import type { SupabaseClient, User } from '@supabase/supabase-js';

import { env } from '../config';

let client: Promise<SupabaseClient | null> | null = null;

/** Loaded on the email step, not before: the first screens stay light. */
export function supabase(): Promise<SupabaseClient | null> {
  if (client != null) return client;
  if (env.supabaseUrl === '' || env.supabaseAnonKey === '') return (client = Promise.resolve(null));
  client = import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'walkito-funnel-auth' },
    }),
  );
  return client;
}

export async function currentUser(): Promise<User | null> {
  const db = await supabase();
  if (db == null) return null;
  const { data } = await db.auth.getSession();
  return data.session?.user ?? null;
}

async function ensureUser(db: SupabaseClient): Promise<User> {
  const { data } = await db.auth.getSession();
  if (data.session?.user != null) return data.session.user;
  const { data: created, error } = await db.auth.signInAnonymously();
  if (error != null || created.user == null) throw error ?? new Error('no user');
  return created.user;
}

export type CodeMode = 'create' | 'sign-in';
export type CodeSent = { ok: true; mode: CodeMode } | { ok: false; message: string; reason: string };
export type Verified = { ok: true; userId: string; email: string; mode: CodeMode } | { ok: false; message: string; reason: string };

const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NO_SERVER = 'We could not reach our server. Check your connection and try again.';

function explain(code: string | undefined): string {
  switch (code) {
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'We just sent a code. Please wait a minute before asking for another.';
    case 'otp_expired':
      return 'That code has expired or is not right. Check the newest email from us, or ask for a new code.';
    case 'email_address_invalid':
    case 'validation_failed':
      return 'That email address does not look right. Please check it.';
    default:
      return 'Something went wrong on our side. Please try again.';
  }
}

/**
 * Mails a 6-digit code. A new address is added to the anonymous account this
 * browser holds, so everything she did here stays hers. An address that
 * already has an account (she has the app, or came back) gets a sign-in code
 * instead, and the code signs her in to that account.
 */
export async function sendCode(email: string, prefer: CodeMode = 'create'): Promise<CodeSent> {
  const address = email.trim().toLowerCase();
  if (!ADDRESS.test(address)) return { ok: false, message: 'That email address does not look right. Please check it.', reason: 'format' };
  const db = await supabase();
  if (db == null) return { ok: false, message: NO_SERVER, reason: 'config' };
  try {
    if (prefer === 'create') {
      const user = await ensureUser(db);
      if (user.is_anonymous === true) {
        const { error } = await db.auth.updateUser({ email: address });
        if (error == null) return { ok: true, mode: 'create' };
        if (error.code !== 'email_exists') return { ok: false, message: explain(error.code), reason: error.code ?? 'unknown' };
      } else if (user.email === address) {
        return { ok: true, mode: 'sign-in' };
      }
    }
    const { error } = await db.auth.signInWithOtp({ email: address, options: { shouldCreateUser: prefer === 'create' } });
    if (error != null) return { ok: false, message: explain(error.code), reason: error.code ?? 'unknown' };
    return { ok: true, mode: 'sign-in' };
  } catch {
    return { ok: false, message: NO_SERVER, reason: 'network' };
  }
}

export async function verifyCode(email: string, code: string, mode: CodeMode): Promise<Verified> {
  const address = email.trim().toLowerCase();
  const db = await supabase();
  if (db == null) return { ok: false, message: NO_SERVER, reason: 'config' };
  try {
    const { data, error } = await db.auth.verifyOtp({ email: address, token: code.trim(), type: mode === 'create' ? 'email_change' : 'email' });
    if (error != null) return { ok: false, message: explain(error.code ?? 'otp_expired'), reason: error.code ?? 'unknown' };
    const user = data.user ?? data.session?.user;
    if (user == null) return { ok: false, message: explain(undefined), reason: 'no_user' };
    return { ok: true, userId: user.id, email: user.email ?? address, mode };
  } catch {
    return { ok: false, message: NO_SERVER, reason: 'network' };
  }
}

export async function signOut(): Promise<void> {
  const db = await supabase();
  await db?.auth.signOut();
}

// --- Rows the funnel writes for its own user (RLS: own row only). ----------

export type Lead = {
  email?: string;
  locale?: string;
  variant?: string;
  price_variant?: string;
  utm?: Record<string, string>;
  fbp?: string | null;
  fbc?: string | null;
  user_agent?: string;
  checkout_opened_at?: string;
};

export async function saveLead(lead: Lead): Promise<void> {
  const db = await supabase();
  const user = await currentUser();
  if (db == null || user == null) return;
  await db.from('web_leads').upsert({ user_id: user.id, ...lead, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
}

export async function saveAnswers(row: { answers?: unknown; try_it?: unknown; plan?: unknown }): Promise<void> {
  const db = await supabase();
  const user = await currentUser();
  if (db == null || user == null) return;
  await db
    .from('web_quiz_answers')
    .upsert({ user_id: user.id, version: 1, ...row, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
}

export type ConsentKind = 'auto_renew' | 'health_answers' | 'marketing';

export async function logConsent(kind: ConsentKind, textShown: string, accepted: boolean): Promise<void> {
  const db = await supabase();
  const user = await currentUser();
  if (db == null || user == null) return;
  await db.from('web_consents').insert({ user_id: user.id, kind, text_shown: textShown, accepted });
}

export type Access = {
  access: boolean;
  status: string | null;
  product_id: string | null;
  period_end: string | null;
  intro_ends_at: string | null;
  management_url: string | null;
};

export async function access(): Promise<Access | null> {
  const db = await supabase();
  if (db == null || (await currentUser()) == null) return null;
  const { data, error } = await db.functions.invoke<Access>('web-account', { method: 'GET' });
  if (error != null) return null;
  return data;
}
