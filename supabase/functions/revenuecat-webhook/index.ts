/**
 * RevenueCat → `subscriptions`, so offer emails stop the moment someone pays,
 * on any device.
 *
 * The event is treated as a nudge, never as the truth. Whatever it says, the
 * function asks RevenueCat's own API for that customer's entitlements and
 * writes what the API answers. That is why the webhook needs no shared secret:
 * a forged request can only make us look up a real customer's real status.
 * (If REVENUECAT_WEBHOOK_AUTH is set, the Authorization header must match it
 * as well.)
 *
 * RevenueCat knows the buyer by its own anonymous id; `revenuecat_links` maps
 * that to our user, written by the app through `link_revenuecat`.
 *
 * It also grants the 3-month pass (NON_RENEWING_PURCHASE of a pass product):
 * 90 days, queued behind whatever is still running, counted once per store
 * transaction (`_shared/pass.ts`, `grant_pass`). The same rule holds: the
 * purchase is looked up in RevenueCat's record of that customer, never taken
 * from the event, so a forged event grants nothing. A pass bought before its
 * buyer was linked to an account is picked up later by `pass-sync`.
 *
 * And the web funnel's purchases (start.walkito.site, RevenueCat Billing).
 * There the RevenueCat app user id is the buyer's own Supabase user id, a
 * UUID, so no link is needed. From the same record it writes `web_customers`
 * and the buyer's `comp_access` row (reason 'web', open until a day past the
 * paid access), which opens the app on any phone they sign in on; when the
 * record shows no access any more (expired, refunded, moved away), that row
 * goes, and only a row with reason 'web' is ever touched
 * (`_shared/web/customer.ts`). A web event that cannot be looked up or
 * written answers an error, so RevenueCat delivers it again. A first web
 * purchase that the buyer's own record confirms also sends Meta its Purchase
 * event (`purchase-<user id>`, the amount and currency, and the browser ids
 * the funnel stored: nothing about the buyer) and asks `web-email` for the
 * receipt.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

import { isPassProduct, premiumUntilFor, grantPass, subscriberOf } from '../_shared/pass.ts';
import { capiEvent, sendToMeta } from '../_shared/web/capi.ts';
import { fetchSubscriber, recordWebState, webStateOf, type RcSubscriber } from '../_shared/web/customer.ts';
import { isWebProduct } from '../_shared/web/products.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RC_KEY = Deno.env.get('REVENUECAT_API_KEY') ?? '';
const AUTH = Deno.env.get('REVENUECAT_WEBHOOK_AUTH') ?? '';
const CRON_SECRET = Deno.env.get('EMAIL_CRON_SECRET') ?? '';
const META_PIXEL_ID = Deno.env.get('META_PIXEL_ID') ?? '';
const META_CAPI_TOKEN = Deno.env.get('META_CAPI_TOKEN') ?? '';
const META_TEST_EVENT_CODE = Deno.env.get('META_TEST_EVENT_CODE') ?? '';
const META_GRAPH_VERSION = Deno.env.get('META_GRAPH_VERSION') ?? '';
const FUNNEL = (Deno.env.get('WEB_FUNNEL_BASE') || 'https://walkito.site/go').replace(/\/+$/, '');

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

type RcEvent = {
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  transferred_to?: string[];
  transferred_from?: string[];
  product_id?: string;
  /** The store's transaction id (Play's order id). */
  transaction_id?: string;
  /** `APP_STORE`, `PLAY_STORE`, `RC_BILLING`, `STRIPE` … */
  store?: string;
  /** `SANDBOX` or `PRODUCTION`. */
  environment?: string;
  purchased_at_ms?: number;
  /** In USD. */
  price?: number | null;
  price_in_purchased_currency?: number | null;
  currency?: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** What RevenueCat itself says about this customer right now. */
function statusOf(sub: RcSubscriber): { status: 'active' | 'expired' | 'none'; productId: string | null } {
  const now = Date.now();
  const entitlements = Object.values(sub.entitlements ?? {});
  const active = entitlements.find((e) => e.expires_date == null || Date.parse(e.expires_date) > now);
  if (active != null) return { status: 'active', productId: active.product_identifier ?? null };
  const bought = entitlements.length > 0 || Object.keys(sub.subscriptions ?? {}).length > 0 || Object.keys(sub.non_subscriptions ?? {}).length > 0;
  return { status: bought ? 'expired' : 'none', productId: entitlements[0]?.product_identifier ?? null };
}

/** Meta's Purchase for a first web purchase. A sandbox purchase goes only as a test event, never into the real data. */
async function reportPurchase(userId: string, event: RcEvent): Promise<string> {
  if (!META_PIXEL_ID || !META_CAPI_TOKEN) return 'not configured';
  if (event.environment === 'SANDBOX' && !META_TEST_EVENT_CODE) return 'sandbox, not sent';
  const { data: lead } = await db.from('web_leads').select('fbp, fbc, user_agent').eq('user_id', userId).maybeSingle();
  const inCurrency = event.price_in_purchased_currency != null && event.currency != null;
  const purchase = capiEvent({
    name: 'Purchase',
    id: `purchase-${userId}`,
    time: (event.purchased_at_ms ?? Date.now()) / 1000,
    sourceUrl: `${FUNNEL}/`,
    ip: null,
    userAgent: lead?.user_agent ?? null,
    fbp: lead?.fbp ?? null,
    fbc: lead?.fbc ?? null,
    value: inCurrency ? event.price_in_purchased_currency : (event.price ?? null),
    currency: inCurrency ? event.currency : 'USD',
  });
  const sent = await sendToMeta(
    { pixelId: META_PIXEL_ID, token: META_CAPI_TOKEN, testEventCode: META_TEST_EVENT_CODE || null, version: META_GRAPH_VERSION || null },
    [purchase],
  );
  return sent.ok ? 'sent' : `failed ${sent.status}`;
}

/** The receipt, now rather than at the next 15-minute run (which still sends it if this call fails). */
async function askForWelcome(userId: string): Promise<string> {
  if (!CRON_SECRET) return 'EMAIL_CRON_SECRET not set';
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/web-email`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${CRON_SECRET}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ welcomeFor: userId }),
      signal: AbortSignal.timeout(20_000),
    });
    return res.ok ? 'asked' : `failed ${res.status}`;
  } catch (error) {
    return `failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * A funnel buyer who never typed a code: her address is in `web_leads.email`
 * and her account is still anonymous (funnel/src/lib/account.ts, takeEmail).
 * Once she has paid it goes on the account, confirmed, so the app's email
 * sign-in finds her plan. Never over an address the account already has, and
 * never one another account holds (the update fails, and she is asked to
 * write to us from the account page).
 */
async function claimEmail(userId: string): Promise<string> {
  const { data, error } = await db.auth.admin.getUserById(userId);
  if (error != null || data.user == null) return 'no user';
  if (data.user.email) return 'has one';
  const { data: lead } = await db.from('web_leads').select('email').eq('user_id', userId).maybeSingle();
  const email = typeof lead?.email === 'string' ? lead.email.trim().toLowerCase() : '';
  if (email === '') return 'no address';
  const { error: updateError } = await db.auth.admin.updateUserById(userId, { email, email_confirm: true });
  if (updateError != null) {
    console.warn('[revenuecat] could not put the funnel address on', userId, updateError.message);
    return `failed: ${updateError.message}`;
  }
  return 'claimed';
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (AUTH && req.headers.get('Authorization') !== AUTH) return json({ error: 'unauthorized' }, 401);
  if (!RC_KEY) return json({ error: 'REVENUECAT_API_KEY not set' }, 503);

  const payload = (await req.json().catch(() => ({}))) as { event?: RcEvent };
  const event = payload.event ?? {};
  if (event.type === 'TEST') return json({ ok: true, test: true });

  const rcIds = [
    event.app_user_id,
    event.original_app_user_id,
    ...(event.aliases ?? []),
    ...(event.transferred_to ?? []),
    ...(event.transferred_from ?? []),
  ].filter((x): x is string => typeof x === 'string' && x.length > 0);
  if (rcIds.length === 0) return json({ ok: true, note: 'no app user id' });

  const { data: links, error } = await db.from('revenuecat_links').select('rc_app_user_id, user_id').in('rc_app_user_id', rcIds);
  if (error != null) return json({ error: error.message }, 500);
  const users = new Map<string, string>();
  for (const l of links ?? []) users.set(String(l.user_id), String(l.rc_app_user_id));
  // A RevenueCat id that is already one of ours: a web buyer's (or the SDK's, if it ever logs in with it).
  for (const id of rcIds) if (UUID.test(id) && !users.has(id)) users.set(id, id);
  if (users.size === 0) return json({ ok: true, note: 'no linked user yet' });

  // ── A pass ──────────────────────────────────────────────────────────────
  const passes: string[] = [];
  if (event.type === 'NON_RENEWING_PURCHASE' && isPassProduct(event.product_id)) {
    for (const [userId, rcId] of users) {
      const subscriber = await subscriberOf(RC_KEY, rcId);
      // RevenueCat retries a delivery that fails: a lookup that did not answer
      // is worth another try rather than a pass never granted.
      if (subscriber == null) return json({ error: 'lookup failed' }, 502);
      const purchase = subscriber.passes.find(
        (p) => p.transactionId === event.transaction_id && p.productId.split(':')[0] === event.product_id?.split(':')[0],
      );
      if (purchase == null) {
        // Not in RevenueCat's record (yet, or ever): nothing is granted.
        console.warn('[revenuecat] pass purchase not found for', event.product_id);
        continue;
      }
      const window = await grantPass(db, userId, rcId, purchase, premiumUntilFor(purchase, subscriber));
      if (window == null) return json({ error: 'grant failed' }, 500);
      passes.push(`${userId}:${window.granted ? 'granted' : 'already'}:${window.expiresAt}`);
    }
  }

  const webEvent = isWebProduct(event.product_id, event.store);
  const written: string[] = [];
  const web: string[] = [];
  /** Buyers whose own RevenueCat record holds the web purchase that opened the app. */
  const webBuyers = new Set<string>();
  for (const [userId, rcId] of users) {
    const subscriber = await fetchSubscriber(RC_KEY, rcId);
    if (subscriber == null) {
      // A web buyer may be waiting on the success page for this: worth RevenueCat's retry.
      if (webEvent && userId === rcId) return json({ error: 'lookup failed' }, 502);
      continue;
    }
    const status = statusOf(subscriber);
    const { error: upsertError } = await db
      .from('subscriptions')
      .upsert({ user_id: userId, status: status.status, product_id: status.productId ?? event.product_id ?? null, updated_at: new Date().toISOString() });
    // A UUID-shaped RevenueCat id that is not one of our users fails the foreign key; that is fine.
    if (upsertError == null) written.push(`${userId}:${status.status}`);

    // ── A web purchase ──────────────────────────────────────────────────────
    // Known to RevenueCat by the buyer's own Supabase id, so the id is the user.
    if (userId !== rcId) continue;
    const state = webStateOf(subscriber);
    if (state == null && !webEvent && event.type !== 'TRANSFER') continue;
    const result = await recordWebState(db, userId, state);
    if (result.startsWith('failed') && webEvent) return json({ error: result }, 500);
    web.push(`${userId}:${state?.status ?? 'none'}:${result}`);
    if (result === 'granted' || result === 'kept') webBuyers.add(userId);
  }

  const emails: string[] = [];
  for (const userId of webBuyers) emails.push(`${userId}:${await claimEmail(userId)}`);

  // ── A first web purchase: Meta's Purchase, and the receipt ──────────────
  let meta: string | null = null;
  let welcome: string | null = null;
  const buyer = event.app_user_id;
  if (event.type === 'INITIAL_PURCHASE' && webEvent && buyer != null && webBuyers.has(buyer)) {
    meta = await reportPurchase(buyer, event);
    welcome = await askForWelcome(buyer);
  }

  return json({ ok: true, type: event.type ?? null, written, passes, web, emails, meta, welcome });
});
