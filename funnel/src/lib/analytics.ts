import type { PostHog } from 'posthog-js';

import { env } from '../config';
import { getState } from '../state';

/**
 * Every funnel event, declared once. Names and properties say that something
 * happened, never what she told us: no age, no focus, no safety answer, no
 * rating, no balance seconds. Health data never leaves the quiz for analytics.
 */
type Events = {
  funnel_landed: { source: string | null; campaign: string | null; webview: string | null };
  step_viewed: { step: string };
  step_completed: { step: string };
  tryit_started: Record<string, never>;
  tryit_finished: { stopped_early: boolean };
  tryit_skipped: Record<string, never>;
  balance_started: Record<string, never>;
  balance_skipped: Record<string, never>;
  plan_viewed: Record<string, never>;
  email_submitted: Record<string, never>;
  email_code_failed: { reason: string };
  email_verified: { existing: boolean };
  email_saved: { existing: boolean };
  google_shown: Record<string, never>;
  google_failed: { reason: string };
  google_verified: { existing: boolean };
  price_viewed: Record<string, never>;
  plan_selected: { plan: string };
  consent_given: { kind: string };
  checkout_opened: { plan: string };
  checkout_closed: { plan: string };
  checkout_failed: { plan: string; code: string };
  held_back: { reason: string };
  purchase_completed: { plan: string };
  access_confirmed: { waited_s: number };
  session1_started: Record<string, never>;
  session1_completed: Record<string, never>;
  reminder_chosen: { time: string; channel: string };
  app_link_tapped: { from: string };
  account_viewed: Record<string, never>;
  cancel_viewed: Record<string, never>;
  cancel_chosen: { choice: string };
  cancel_status: { status: string; matched_by: string };
  checkout_needs_sign_in: Record<string, never>;
  /** The one-time gift ($29.99 first year), shown once: after she closes checkout, leaves the price page, or answers "The price". */
  exit_gift_shown: { offer: string; trigger: 'checkout_closed' | 'leave' | 'held_back' };
  exit_gift_declined: { offer: string };
  offer_checkout_opened: { offer: string };
  exit_gift_purchased: { offer: string };
  offer_closed: { offer: string };
  offer_failed: { offer: string; code: string };
  plan_email_requested: Record<string, never>;
  upgrade_shown: Record<string, never>;
  upgrade_switched: Record<string, never>;
  upgrade_declined: Record<string, never>;
  upgrade_failed: { code: string };
};

let ph: PostHog | null = null;
const queue: Array<(p: PostHog) => void> = [];

function withPostHog(run: (p: PostHog) => void): void {
  if (ph != null) run(ph);
  else queue.push(run);
}

export function startAnalytics(): void {
  if (env.posthogKey === '') return;
  void import('posthog-js').then(({ default: posthog }) => {
    posthog.init(env.posthogKey, {
      api_host: env.posthogHost,
      person_profiles: 'identified_only',
      capture_pageview: false,
      capture_pageleave: false,
      autocapture: false,
      disable_session_recording: true,
      disable_surveys: true,
      persistence: 'localStorage+cookie',
    });
    posthog.register({
      funnel: 'web-v1',
      app_variant: import.meta.env.DEV ? 'development' : 'web',
      price_variant: getState().variant,
    });
    ph = posthog;
    for (const run of queue.splice(0)) run(posthog);
  });
}

export function track<E extends keyof Events>(event: E, ...props: Events[E] extends Record<string, never> ? [] : [Events[E]]): void {
  withPostHog((p) => p.capture(event, props[0] ?? {}));
}

/** The Supabase user id, which is also the RevenueCat app user id, as the app does. */
export function identify(userId: string, email?: string): void {
  withPostHog((p) => p.identify(userId, email != null ? { email } : undefined));
}

// ---------------------------------------------------------------------------
// Meta: Pixel in the browser and the same event through our own server, with
// one event id so Meta counts it once. Four events only, no customer data
// beyond what the browser already sends. Nothing loads without a pixel id.
// ---------------------------------------------------------------------------

type MetaEvent = 'PageView' | 'ViewContent' | 'InitiateCheckout' | 'Purchase';

type Fbq = ((...args: unknown[]) => void) & { callMethod?: unknown; queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown; disablePushState?: boolean };

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

function cookie(name: string): string | undefined {
  return document.cookie
    .split('; ')
    .find((c) => c.startsWith(name + '='))
    ?.slice(name.length + 1);
}

/** fbc from the ad click, kept for 90 days as Meta's own pixel would. */
function rememberClick(): void {
  const fbclid = new URLSearchParams(location.search).get('fbclid');
  if (fbclid == null || cookie('_fbc') != null) return;
  const value = `fb.1.${Date.now()}.${fbclid}`;
  document.cookie = `_fbc=${value}; max-age=${90 * 86400}; path=/; samesite=lax; secure`;
}

export function startPixel(): void {
  if (env.pixelId === '') return;
  rememberClick();
  const n: Fbq = function (...args: unknown[]) {
    if (n.callMethod != null) (n.callMethod as (...a: unknown[]) => void)(...args);
    else n.queue!.push(args);
  } as Fbq;
  n.push = n;
  n.loaded = true;
  n.version = '2.0';
  n.queue = [];
  // The pixel sends a PageView of its own on every step of the quiz (each is
  // a history entry), with no event id for the server's copy to pair with.
  n.disablePushState = true;
  window.fbq = n;
  window._fbq = n;
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.appendChild(script);
  // No automatic button and form scraping: the quiz is health-adjacent.
  window.fbq('set', 'autoConfig', false, env.pixelId);
  window.fbq('init', env.pixelId);
}

export function meta(event: MetaEvent, eventId: string, value?: { value: number; currency: string }): void {
  if (env.pixelId === '' || window.fbq == null) return;
  window.fbq('track', event, value ?? {}, { eventID: eventId });
  if (event === 'Purchase' || env.supabaseUrl === '') return;
  void fetch(`${env.supabaseUrl}/functions/v1/meta-capi`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: env.supabaseAnonKey },
    body: JSON.stringify({
      event_name: event,
      event_id: eventId,
      event_source_url: location.origin + location.pathname,
      fbp: cookie('_fbp'),
      fbc: cookie('_fbc'),
    }),
    keepalive: true,
  }).catch(() => undefined);
}

/** In-app browsers, for analytics and for the "open in Safari" fallback. */
export function webview(): string | null {
  const ua = navigator.userAgent;
  if (/FBAN|FBAV|FB_IAB/.test(ua)) return 'facebook';
  if (/Instagram/.test(ua)) return 'instagram';
  if (/TikTok|musical_ly/.test(ua)) return 'tiktok';
  return null;
}
