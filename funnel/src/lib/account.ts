import type { SupabaseClient, User } from '@supabase/supabase-js';

import { env } from '../config';
import { beforeCheckout, type Guard } from './checkout-guard';

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

/**
 * The account this browser is signed in to with an address, or null.
 *
 * Asks the server, not the stored token: after payment the webhook puts her
 * address on the anonymous account she bought with, and the token this
 * browser holds still says anonymous until it is refreshed. So a buyer back
 * on the cancel page in the same browser is recognised without a code.
 */
export async function signedInUser(): Promise<{ userId: string; email: string } | null> {
  const db = await supabase();
  if (db == null) return null;
  const { data } = await db.auth.getSession();
  if (data.session == null) return null;
  try {
    const { data: fresh, error } = await db.auth.getUser();
    const user = error == null ? fresh.user : null;
    if (user == null || user.email == null || user.email === '' || user.email_confirmed_at == null) return null;
    if (data.session.user.email !== user.email) await db.auth.refreshSession().catch(() => undefined);
    return { userId: user.id, email: user.email };
  } catch {
    const cached = data.session.user;
    return cached.is_anonymous !== true && cached.email != null ? { userId: cached.id, email: cached.email } : null;
  }
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

export type EmailTaken =
  | { ok: true; next: 'price'; userId: string; email: string; existing: boolean }
  | { ok: true; next: 'code'; mode: CodeMode }
  | { ok: false; message: string; reason: string };

/**
 * The email step without a code: a new address goes straight to the price.
 *
 * The code was where people left: she had to go to her mail and come back
 * before she saw a price. Now the address is kept with the anonymous account
 * this browser holds (`web_leads.email`), she buys under that account, and
 * `revenuecat-webhook` puts the address on the account once she has paid, so
 * the app's own email sign-in finds her plan. The code she gets is the app's.
 *
 * An address that already has an account still gets a sign-in code first, as
 * before: what she buys has to land on the account she already has.
 * `signInWithOtp` without sign-ups mails only those, and says `otp_disabled`
 * for every other address without sending anything.
 */
export async function takeEmail(email: string): Promise<EmailTaken> {
  const address = email.trim().toLowerCase();
  if (!ADDRESS.test(address)) return { ok: false, message: 'That email address does not look right. Please check it.', reason: 'format' };
  const db = await supabase();
  if (db == null) return { ok: false, message: NO_SERVER, reason: 'config' };
  try {
    const user = await ensureUser(db);
    if (user.email === address) return { ok: true, next: 'price', userId: user.id, email: address, existing: true };
    if (user.is_anonymous !== true) {
      const sent = await sendCode(address);
      return sent.ok ? { ok: true, next: 'code', mode: sent.mode } : sent;
    }
    const { error } = await db.auth.signInWithOtp({ email: address, options: { shouldCreateUser: false } });
    if (error == null) return { ok: true, next: 'code', mode: 'sign-in' };
    if (error.code !== 'otp_disabled') return { ok: false, message: explain(error.code), reason: error.code ?? 'unknown' };
    return { ok: true, next: 'price', userId: user.id, email: address, existing: false };
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

/** `beforeCheckout` with this browser's account and Supabase: see lib/checkout-guard.ts. */
export async function guardCheckout(email: string): Promise<Guard> {
  const db = await supabase();
  const user = await currentUser();
  const account = user == null ? null : { email: user.email ?? null, anonymous: user.is_anonymous === true };
  return beforeCheckout(account, email, async (address) => {
    if (db == null) return 'failed';
    try {
      const { error } = await db.auth.signInWithOtp({ email: address, options: { shouldCreateUser: false } });
      if (error == null) return 'sent';
      if (error.code === 'otp_disabled') return 'no-account';
      if (error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit') return 'rate-limited';
      return 'failed';
    } catch {
      return 'failed';
    }
  });
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
  /** She reached the price page: the start of the abandoned-checkout emails. */
  price_viewed_at?: string;
  /** "I want to think about it": the plan emails go to her. */
  plan_email_requested_at?: string;
  /** When she usually gets up, "HH:MM": the morning email goes then. */
  wake_time?: string;
  /** The one-time price offer was shown (never again after this). */
  offer_shown_at?: string;
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
  /** 'email' when the plan was found on another account with the same verified address. */
  matched_by?: 'account' | 'email';
};

export type AccessCheck = { ok: true; access: Access } | { ok: false; reason: 'signed-out' | 'error' };

/**
 * The plan, or why it could not be read. "We could not reach the server" and
 * "there is no plan" are different answers, and the account pages say so.
 * One retry after a short wait, for a cold function or a flaky connection.
 */
export async function checkAccess(): Promise<AccessCheck> {
  const db = await supabase();
  if (db == null || (await currentUser()) == null) return { ok: false, reason: 'signed-out' };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { data, error } = await db.functions.invoke<Access>('web-account', { method: 'GET' });
      if (error == null && data != null && typeof data.access === 'boolean') return { ok: true, access: data };
    } catch {
      // Network: tried once more below.
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 1500));
  }
  return { ok: false, reason: 'error' };
}

export async function access(): Promise<Access | null> {
  const result = await checkAccess();
  return result.ok ? result.access : null;
}
