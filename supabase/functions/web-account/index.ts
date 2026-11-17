/**
 * The funnel's view of the caller's own web purchase.
 *
 *   GET            { access, status, product_id, period_end, intro_ends_at, management_url }
 *   GET ?portal=1  the same, plus `portal_url`
 *
 * Called by the funnel with the user's own token, anonymous or not: the
 * success page polls it until `access` turns true, and the cancel page reads
 * `management_url`. `access` is true while any `comp_access` row runs (the
 * web's own, or a founder's) or RevenueCat still counts the purchase as open;
 * `status` is `web_customers.status` (see 0021_web_funnel.sql), null before
 * a purchase.
 *
 * The webhook usually writes the purchase within seconds. Until it does, this
 * asks RevenueCat itself and writes what it answers, the same way and through
 * the same code (`_shared/web/customer.ts`), so the success page never waits
 * on a late webhook. It asks only for a caller who opened checkout (a
 * RevenueCat lookup creates the customer it looks for) and at most once every
 * few seconds per caller. It also fills in a missing `management_url` once.
 *
 * RevenueCat Billing's `management_url` opens a page that emails the buyer a
 * link to the portal. `portal_url` skips that email: a single-use link,
 * already signed in, from RevenueCat's v2 API. It needs REVENUECAT_V2_API_KEY
 * (a v2 secret key with customer_information read access) and
 * REVENUECAT_PROJECT_ID, is null without them or on any failure, and is made
 * fresh on each request with `?portal=1`: ask for it when the button is
 * tapped, not when the page loads.
 *
 * The purchase can sit on another account than the caller's (see
 * `bestPurchase` in `_shared/web/customer.ts`): when the caller's own account
 * holds no open plan and their address is verified, the accounts whose funnel
 * lead carries that same address are read as well, and the best purchase
 * among them is the one answered, looked up, and opened in the portal.
 * `matched_by` says which: 'account' or 'email'.
 *
 * verify_jwt is off in config.toml; the token is checked here instead, with
 * Supabase Auth, which works whichever keys the project signs with, and a 401
 * from here carries the CORS headers the funnel needs to read it.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

import { bestPurchase, fetchSubscriber, hasAccess, portalLink, recordWebState, webStateOf } from '../_shared/web/customer.ts';
import { corsHeaders, funnelOrigins } from '../_shared/web/cors.ts';

const env = (name: string): string => Deno.env.get(name) ?? '';

const SUPABASE_URL = env('SUPABASE_URL');
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');
const RC_KEY = env('REVENUECAT_API_KEY');
const RC_V2_KEY = env('REVENUECAT_V2_API_KEY');
const RC_PROJECT = env('REVENUECAT_PROJECT_ID');
const ORIGINS = funnelOrigins(env('WEB_FUNNEL_ORIGINS'));

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

/** However fast the success page polls, RevenueCat is asked about one caller at most this often. */
const LOOKUP_GAP_MS = 3000;
const lastLookup = new Map<string, number>();

type CustomerRow = {
  status: string;
  product_id: string;
  period_end: string | null;
  intro_ends_at: string | null;
  management_url: string | null;
};

async function read(userId: string): Promise<{ customer: CustomerRow | null; comp: { until: string | null } | null }> {
  const [customer, comp] = await Promise.all([
    db.from('web_customers').select('status, product_id, period_end, intro_ends_at, management_url').eq('user_id', userId).maybeSingle(),
    db.from('comp_access').select('until').eq('user_id', userId).maybeSingle(),
  ]);
  if (customer.error != null) throw new Error(customer.error.message);
  if (comp.error != null) throw new Error(comp.error.message);
  return { customer: customer.data as CustomerRow | null, comp: comp.data as { until: string | null } | null };
}

/** How many other accounts with the same address are read at most. */
const MAX_EMAIL_MATCHES = 5;

/**
 * Other accounts whose funnel lead carries this address: where a purchase
 * made before the address was on the account (or while another account held
 * it) lives. Only for an address the caller has proved is theirs.
 */
async function sameAddress(email: string, callerId: string): Promise<string[]> {
  const { data, error } = await db
    .from('web_leads')
    .select('user_id')
    .eq('email', email)
    .neq('user_id', callerId)
    .order('updated_at', { ascending: false })
    .limit(MAX_EMAIL_MATCHES);
  if (error != null) throw new Error(error.message);
  return (data ?? []).map((r: { user_id: string }) => String(r.user_id));
}

/** One account's purchase, asking RevenueCat first when we hold nothing (or no portal link) yet. */
async function view(userId: string): Promise<{ customer: CustomerRow | null; comp: { until: string | null } | null }> {
  let { customer, comp } = await read(userId);
  const missingUrl = customer != null && customer.management_url == null && customer.status !== 'expired' && customer.status !== 'refunded';
  if (RC_KEY && (customer == null || missingUrl) && (await mayLookUp(userId, customer))) {
    const subscriber = await fetchSubscriber(RC_KEY, userId);
    if (subscriber != null) {
      const state = webStateOf(subscriber);
      if (state != null || customer != null) {
        const result = await recordWebState(db, userId, state);
        if (result.startsWith('failed')) console.warn('[web-account] could not record', userId, result);
        ({ customer, comp } = await read(userId));
      }
    }
  }
  return { customer, comp };
}

/** Whether RevenueCat may be asked about this caller now. */
async function mayLookUp(userId: string, customer: CustomerRow | null): Promise<boolean> {
  const last = lastLookup.get(userId) ?? 0;
  if (Date.now() - last < LOOKUP_GAP_MS) return false;
  if (customer == null) {
    const { data: lead } = await db.from('web_leads').select('checkout_opened_at').eq('user_id', userId).maybeSingle();
    if (lead?.checkout_opened_at == null) return false;
  }
  lastLookup.set(userId, Date.now());
  return true;
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('Origin'), ORIGINS, 'GET, OPTIONS');
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'GET') return json({ error: 'GET only' }, 405);

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'unauthorized' }, 401);
  const { data: auth, error: authError } = await db.auth.getUser(token);
  const user = auth?.user;
  if (authError != null || user == null) return json({ error: 'unauthorized' }, 401);

  try {
    const own = { userId: user.id, ...(await view(user.id)) };
    let chosen = own;
    // A verified address: the code on the cancel page, Google, or the address
    // the webhook put on the account after payment (confirmed by us).
    const address = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
    const verified = address !== '' && user.email_confirmed_at != null;
    if (verified && !hasAccess(own.comp, own.customer)) {
      const others = [];
      for (const id of await sameAddress(address, user.id)) others.push({ userId: id, ...(await view(id)) });
      chosen = (bestPurchase([own, ...others]) as typeof own | null) ?? own;
      if (chosen.userId !== user.id) console.log('[web-account] purchase found by address', { caller: user.id, owner: chosen.userId });
    }
    const { customer, comp } = chosen;

    const wantsPortal = new URL(req.url).searchParams.get('portal') === '1';
    const portal = wantsPortal && customer != null ? await portalLink(RC_V2_KEY, RC_PROJECT, chosen.userId) : null;

    return json({
      access: hasAccess(comp, customer),
      status: customer?.status ?? null,
      product_id: customer?.product_id ?? null,
      period_end: customer?.period_end ?? null,
      intro_ends_at: customer?.intro_ends_at ?? null,
      management_url: customer?.management_url ?? null,
      matched_by: chosen.userId === user.id ? 'account' : 'email',
      ...(wantsPortal ? { portal_url: portal } : {}),
    });
  } catch (error) {
    console.error('[web-account]', error);
    return json({ error: 'server' }, 500);
  }
});
