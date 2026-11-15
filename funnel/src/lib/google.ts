import { GOOGLE_CLIENT_ID } from '../config';
import { webview } from './analytics';
import { supabase, type Verified } from './account';

type Gis = {
  accounts: {
    id: {
      initialize(config: Record<string, unknown>): void;
      renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
    };
  };
};

declare global {
  interface Window {
    google?: Gis;
  }
}

/**
 * Google refuses to sign in inside embedded browsers (403 disallowed_useragent):
 * Facebook's and Instagram's, where ad traffic lands, and any Android or iOS
 * webview. There the email code is the only door, so the button is not shown.
 */
export function googleAvailable(): boolean {
  if (GOOGLE_CLIENT_ID === '') return false;
  if (webview() != null) return false;
  const ua = navigator.userAgent;
  if (/; wv\)/.test(ua)) return false;
  if (/iPhone|iPad|iPod/.test(ua) && !/Safari\//.test(ua)) return false;
  return true;
}

let script: Promise<Gis> | null = null;

function loadGis(): Promise<Gis> {
  if (script != null) return script;
  script = new Promise<Gis>((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = 'https://accounts.google.com/gsi/client';
    tag.async = true;
    tag.onload = () => (window.google != null ? resolve(window.google) : reject(new Error('gis')));
    tag.onerror = () => {
      script = null;
      reject(new Error('gis'));
    };
    document.head.appendChild(tag);
  });
  return script;
}

/**
 * Draws Google's own button into `parent`. Its ID token goes to Supabase the
 * way the Android app's does, under the same client, so the account is the one
 * "Continue with Google" opens in the app, and the one an email code for the
 * same address opens on iPhone.
 */
export async function renderGoogleButton(parent: HTMLElement, onResult: (result: Verified & { existing?: boolean }) => void): Promise<boolean> {
  try {
    const gis = await loadGis();
    gis.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      ux_mode: 'popup',
      auto_select: false,
      cancel_on_tap_outside: true,
      use_fedcm_for_button: true,
      callback: async ({ credential }: { credential?: string }) => {
        if (credential == null) return onResult({ ok: false, message: 'Google sign-in did not finish. Please try again.', reason: 'no_credential' });
        onResult(await signInWithGoogleToken(credential));
      },
    });
    gis.accounts.id.renderButton(parent, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      shape: 'pill',
      text: 'continue_with',
      logo_alignment: 'center',
      width: Math.min(400, Math.max(200, parent.clientWidth)),
    });
    return true;
  } catch {
    return false;
  }
}

async function signInWithGoogleToken(token: string): Promise<Verified & { existing?: boolean }> {
  const db = await supabase();
  if (db == null) return { ok: false, message: 'We could not reach our server. Check your connection and try again.', reason: 'config' };
  try {
    const { data, error } = await db.auth.signInWithIdToken({ provider: 'google', token });
    const user = data.user;
    if (error != null || user == null || user.email == null) {
      return { ok: false, message: 'Google sign-in did not go through. Please try again, or use your email.', reason: error?.code ?? 'no_user' };
    }
    const existing = Date.now() - new Date(user.created_at).getTime() > 60_000;
    return { ok: true, userId: user.id, email: user.email.toLowerCase(), mode: existing ? 'sign-in' : 'create', existing };
  } catch {
    return { ok: false, message: 'We could not reach our server. Check your connection and try again.', reason: 'network' };
  }
}
