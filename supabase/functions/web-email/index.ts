/**
 * The web funnel's emails, through Resend, with the app emails' template.
 *
 * POST, with EMAIL_CRON_SECRET as a bearer token:
 *
 *   {}                              the run: pg_cron, every 15 minutes (0021_web_funnel.sql)
 *   { "welcomeFor": "<user id>" }   the receipt, now: `revenuecat-webhook` asks right after a first purchase
 *   { "sampleTo": "you@example.com", "keys": ["web_welcome"] }
 *                                   every email (both plans where they differ) with sample dates, to one
 *                                   inbox; `keys` is optional; nothing is logged; works in any mode
 *   { "dryRun": true, "userId": "…", "now": "2026-11-16T13:05:00Z", "html": true }
 *                                   what a run would decide, without sending; for one user, with every
 *                                   email's reason for not going and, with `html`, the rendered email
 *
 * Who gets what, and when, is `_shared/web/sequence.ts` (one pure function,
 * tested); the words are `_shared/web/emails.ts`. Each email is claimed in
 * `web_email_log` before it is sent, so a run and the webhook's welcome never
 * both send it. A send Resend refuses for a bad address is kept as failed and
 * not tried again; any other failure releases the claim for the next run.
 *
 * WEB_EMAIL_MODE (else EMAIL_MODE, else off), with email-scheduler's meanings:
 *   off   nothing is decided or sent
 *   dry   decided and returned, nothing sent or logged
 *   test  only WEB_EMAIL_TEST_RECIPIENTS (else EMAIL_TEST_RECIPIENTS), addresses or user ids
 *   live  everyone
 * Its own name, because Supabase secrets are shared by every function: the
 * funnel's emails can be tested while the app's run stays live.
 *
 * The address is `web_leads.email` (what the buyer typed in the funnel), else
 * the account's confirmed email, else the one waiting for its code. The time
 * zone is `web_leads.utm.tz`, else New York.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

import { composeWebMessage, personalSender, type WebMailConfig } from '../_shared/web/compose.ts';
import { emailFor, type WebEmail } from '../_shared/web/emails.ts';
import { sampleWebEmails } from '../_shared/web/samples.ts';
import { nextWebEmail, zoneOf, type WebCustomer, type WebEmailKey, type WebLogRow, type WebPerson } from '../_shared/web/sequence.ts';
import type { WebStatus } from '../_shared/web/customer.ts';

const env = (name: string): string => Deno.env.get(name) ?? '';

const SUPABASE_URL = env('SUPABASE_URL');
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');
const CRON_SECRET = env('EMAIL_CRON_SECRET');
const RESEND_KEY = env('RESEND_API_KEY');
const MODE = (env('WEB_EMAIL_MODE') || env('EMAIL_MODE') || 'off') as 'off' | 'dry' | 'test' | 'live';
const TEST_RECIPIENTS = new Set(
  (env('WEB_EMAIL_TEST_RECIPIENTS') || env('EMAIL_TEST_RECIPIENTS'))
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean),
);
const FUNNEL = env('WEB_FUNNEL_BASE') || 'https://walkito.site/go';
const FROM = env('EMAIL_FROM') || 'walkito <hello@walkito.site>';

const config: WebMailConfig = {
  from: FROM,
  personalFrom: personalSender(FROM),
  replyTo: env('EMAIL_REPLY_TO') || 'hello@walkito.site',
  postalAddress: env('EMAIL_POSTAL_ADDRESS'),
  linkBase: env('EMAIL_LINK_BASE') || 'https://walkito.site',
  functionsBase: `${SUPABASE_URL}/functions/v1`,
  unsubscribeSecret: env('EMAIL_UNSUBSCRIBE_SECRET'),
};

const DAY_MS = 86_400_000;
const PAGE = 1000;
const CHUNK = 200;
/** Resend's default limit is a few requests a second; this stays under it. */
const SEND_GAP_MS = 550;

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { 'Content-Type': 'application/json' } });
}

function notReadyToSend(): string[] {
  const missing: string[] = [];
  if (!RESEND_KEY) missing.push('RESEND_API_KEY');
  if (!config.unsubscribeSecret) missing.push('EMAIL_UNSUBSCRIBE_SECRET');
  return missing;
}

type Row = Record<string, unknown>;

/** Every row a query returns, a page at a time. */
// deno-lint-ignore no-explicit-any
async function everyRow(what: string, query: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: { message: string } | null }>): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error != null) throw new Error(`could not read ${what}: ${error.message}`);
    out.push(...(data ?? []));
    if ((data ?? []).length < PAGE) return out;
  }
}

/** Everyone who could be due: recent buyers, renewals within three days, checkouts opened in the last three. */
async function candidates(now: Date): Promise<string[]> {
  const at = (offsetMs: number) => new Date(now.getTime() + offsetMs).toISOString();
  const lists = await Promise.all([
    everyRow('recent buyers', (a, b) => db.from('web_customers').select('user_id').gte('first_purchase_at', at(-4 * DAY_MS)).order('user_id').range(a, b)),
    everyRow('renewals', (a, b) =>
      db.from('web_customers').select('user_id').gte('period_end', at(0)).lte('period_end', at(3 * DAY_MS)).order('user_id').range(a, b),
    ),
    everyRow('first weeks ending', (a, b) =>
      db.from('web_customers').select('user_id').gte('intro_ends_at', at(0)).lte('intro_ends_at', at(3 * DAY_MS)).order('user_id').range(a, b),
    ),
    everyRow('checkouts', (a, b) =>
      db.from('web_leads').select('user_id').not('email', 'is', null).gte('checkout_opened_at', at(-3 * DAY_MS)).order('user_id').range(a, b),
    ),
  ]);
  return [...new Set(lists.flat().map((r) => String(r.user_id)))];
}

/** The account's own address, for a buyer the funnel stored none for. */
async function accountEmail(userId: string): Promise<string | null> {
  const { data } = await db.auth.admin.getUserById(userId);
  const user = data?.user as { email?: string | null; new_email?: string | null } | undefined;
  return user?.email || user?.new_email || null;
}

/** What `sequence.ts` needs to know about each of these users. */
async function people(ids: string[]): Promise<WebPerson[]> {
  const out: WebPerson[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    const [leads, customers, logs, contacts] = await Promise.all([
      everyRow('leads', (a, b) => db.from('web_leads').select('user_id, email, utm, checkout_opened_at, unsubscribed_at').in('user_id', part).range(a, b)),
      everyRow('customers', (a, b) =>
        db.from('web_customers').select('user_id, product_id, status, period_end, intro_ends_at, first_purchase_at').in('user_id', part).range(a, b),
      ),
      everyRow('log', (a, b) => db.from('web_email_log').select('user_id, key, sent_at, status').in('user_id', part).range(a, b)),
      everyRow('contacts', (a, b) => db.from('email_contacts').select('user_id, unsubscribed_at').in('user_id', part).range(a, b)),
    ]);
    const byId = (rows: Row[]) => new Map(rows.map((r) => [String(r.user_id), r]));
    const leadOf = byId(leads);
    const customerOf = byId(customers);
    const contactOf = byId(contacts);
    for (const userId of part) {
      const lead = leadOf.get(userId);
      const c = customerOf.get(userId);
      const customer: WebCustomer | null =
        c == null
          ? null
          : {
              productId: String(c.product_id),
              status: c.status as WebStatus,
              periodEnd: (c.period_end as string | null) ?? null,
              introEndsAt: (c.intro_ends_at as string | null) ?? null,
              firstPurchaseAt: (c.first_purchase_at as string | null) ?? null,
            };
      let email = (lead?.email as string | null | undefined) ?? null;
      if (email == null && customer != null) email = await accountEmail(userId);
      out.push({
        userId,
        email,
        zone: zoneOf(lead?.utm),
        unsubscribed: lead?.unsubscribed_at != null || contactOf.get(userId)?.unsubscribed_at != null,
        checkoutOpenedAt: (lead?.checkout_opened_at as string | null | undefined) ?? null,
        customer,
        log: logs
          .filter((r) => String(r.user_id) === userId)
          .map((r) => ({ key: String(r.key), sentAt: String(r.sent_at), status: r.status as WebLogRow['status'] })),
      });
    }
  }
  return out;
}

/** Claims, sends and records one email. */
async function send(person: WebPerson, logKey: string, email: WebEmail): Promise<string> {
  const claim = await db.from('web_email_log').insert({ user_id: person.userId, key: logKey, status: 'sending' });
  if (claim.error != null) return claim.error.code === '23505' ? 'already claimed' : `claim failed: ${claim.error.message}`;
  const release = () => db.from('web_email_log').delete().eq('user_id', person.userId).eq('key', logKey);
  try {
    const message = await composeWebMessage(email, { userId: person.userId, email: person.email as string }, config);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `${person.userId}:${logKey}`,
      },
      body: JSON.stringify(message),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (res.ok && body.id) {
      await db
        .from('web_email_log')
        .update({ status: 'sent', resend_id: body.id, sent_at: new Date().toISOString() })
        .eq('user_id', person.userId)
        .eq('key', logKey);
      return 'sent';
    }
    // An address Resend refuses outright will be refused every time.
    if (res.status === 422 && /to|address|email/i.test(body.message ?? '')) {
      await db.from('web_email_log').update({ status: 'failed', error: body.message ?? 'rejected' }).eq('user_id', person.userId).eq('key', logKey);
      return `rejected: ${body.message}`;
    }
    await release();
    return `failed ${res.status}: ${body.message ?? body.name ?? 'unknown'}`;
  } catch (error) {
    await release();
    return `failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

type Outcome = { userId: string; key: string; subject?: string; result: string; html?: string };

/** Decides, and sends unless dry, for each of these users. */
async function run(
  ids: string[],
  now: Date,
  options: { dry: boolean; only?: WebEmailKey; explain: boolean; html: boolean },
): Promise<{ outcomes: Outcome[]; skippedByReason: Record<string, number> }> {
  const outcomes: Outcome[] = [];
  const skippedByReason: Record<string, number> = {};
  for (const person of await people(ids)) {
    const evaluation = nextWebEmail(person, now);
    const decision = evaluation.decision;
    if (decision == null || (options.only != null && decision.kind !== options.only)) {
      const reason = evaluation.blocked ?? (decision != null ? `${decision.kind} is due, not ${options.only}` : 'nothing due');
      skippedByReason[reason] = (skippedByReason[reason] ?? 0) + 1;
      if (options.explain) {
        outcomes.push({ userId: person.userId, key: 'none', result: `${reason}; ${evaluation.skipped.map((s) => `${s.kind}: ${s.reason}`).join('; ')}` });
      }
      continue;
    }
    const email = emailFor(decision, person, FUNNEL);
    if ('held' in email) {
      outcomes.push({ userId: person.userId, key: decision.logKey, result: `held: ${email.held}` });
      continue;
    }
    const outcome: Outcome = { userId: person.userId, key: decision.logKey, subject: email.subject, result: '' };
    const address = (person.email ?? '').toLowerCase();
    if (options.dry) {
      outcome.result = 'dry run';
      if (options.html) outcome.html = (await composeWebMessage(email, { userId: person.userId, email: address }, config)).html;
    } else if (MODE === 'test' && !TEST_RECIPIENTS.has(address) && !TEST_RECIPIENTS.has(person.userId)) {
      outcome.result = 'held: not a test recipient';
    } else {
      outcome.result = await send(person, decision.logKey, email);
      await sleep(SEND_GAP_MS);
    }
    outcomes.push(outcome);
  }
  return { outcomes, skippedByReason };
}

/** Every email with sample dates, to one address. Not logged. */
async function sendSamples(to: string, keys: string[] | undefined) {
  if (!RESEND_KEY) return { error: 'RESEND_API_KEY not set' };
  const picked = sampleWebEmails(new Date(), FUNNEL).filter(
    (s) => keys == null || keys.length === 0 || keys.includes(s.name) || keys.includes(s.email.kind),
  );
  const results: { key: string; result: string }[] = [];
  for (const sample of picked) {
    const message = await composeWebMessage(
      sample.email,
      { userId: '00000000-0000-4000-8000-000000000000', email: to },
      { ...config, unsubscribeSecret: config.unsubscribeSecret || 'sample' },
    );
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...message, tags: [...message.tags, { name: 'sample', value: 'true' }] }),
    });
    const out = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    results.push({ key: sample.name, result: res.ok ? `sent ${out.id}` : `failed ${res.status}: ${out.message ?? ''}` });
    await sleep(SEND_GAP_MS);
  }
  return { samples: results.length, to, results };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!CRON_SECRET || req.headers.get('Authorization') !== `Bearer ${CRON_SECRET}`) return json({ error: 'unauthorized' }, 401);

  const body = (await req.json().catch(() => ({}))) as {
    sampleTo?: string;
    keys?: string[];
    welcomeFor?: string;
    dryRun?: boolean;
    userId?: string;
    now?: string;
    html?: boolean;
  };
  if (body.sampleTo) return json(await sendSamples(body.sampleTo, body.keys));

  const dry = body.dryRun === true || MODE === 'dry';
  if (MODE === 'off' && !dry) return json({ mode: MODE, note: 'WEB_EMAIL_MODE (or EMAIL_MODE) is off; nothing decided or sent' });
  const missing = notReadyToSend();
  if (!dry && missing.length > 0) return json({ mode: MODE, error: `not configured: ${missing.join(', ')}` }, 503);
  const now = dry && body.now ? new Date(body.now) : new Date();

  try {
    if (body.welcomeFor) {
      const { outcomes } = await run([body.welcomeFor], now, { dry, only: 'web_welcome', explain: true, html: false });
      console.log(`[web-email] welcome for ${body.welcomeFor}: ${outcomes[0]?.result ?? 'nothing'}`);
      return json({ mode: MODE, dry, outcomes });
    }
    const ids = body.userId ? [body.userId] : await candidates(now);
    const { outcomes, skippedByReason } = await run(ids, now, { dry, explain: body.userId != null, html: body.html === true && body.userId != null });
    const sent = outcomes.filter((o) => o.result === 'sent').length;
    console.log(`[web-email] mode=${MODE}${dry ? ' (dry)' : ''} candidates=${ids.length} decided=${outcomes.length} sent=${sent}`);
    return json({ mode: MODE, dry, now: now.toISOString(), candidates: ids.length, sent, outcomes, skippedByReason });
  } catch (error) {
    console.error('[web-email]', error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
