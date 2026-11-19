/**
 * The funnel's page events, sent to Meta from our server as well as from the
 * browser pixel, so an ad blocker or the Facebook app's browser does not lose
 * them. Meta keeps one of each pair: the browser and this send the same
 * `event_id`.
 *
 *   POST { event_name, event_id, event_source_url, fbp?, fbc? }
 *   Authorization: Bearer <her own token>   (only once she has given her email)
 *
 * Three events only: PageView, ViewContent (the plan) and InitiateCheckout.
 * Purchase is sent by `revenuecat-webhook` alone, from RevenueCat's record,
 * so a page cannot report a purchase that did not happen. What reaches Meta is
 * the event, the page's address without its query, the visitor's IP address
 * and user agent (from this request, never the body), and the browser's own
 * Meta ids. Once she has given her email the funnel sends her token as well,
 * and two SHA-256 hashes go with the event for Meta to match her by: her
 * email (`em`) and our account id (`external_id`). Both are looked up here
 * from the token (the address on her account, or the one her lead holds while
 * the account is still anonymous) and hashed here; the body never carries an
 * email, and a token that cannot be checked sends the event without them.
 * Never the email itself, never an answer (`_shared/web/capi.ts`).
 *
 * Without META_PIXEL_ID and META_CAPI_TOKEN it answers 204 and sends nothing,
 * so the funnel can call it before the dataset exists. META_TEST_EVENT_CODE
 * routes everything to Events Manager's Test events tab. No Supabase JWT is
 * required (verify_jwt off in config.toml); CORS lets in the funnel's origins
 * only, plus any in WEB_FUNNEL_ORIGINS.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

import { capiEvent, clientIp, eventId, isClientEvent, matchKeys, sendToMeta, sourceUrl, browserId } from '../_shared/web/capi.ts';
import { corsHeaders, funnelOrigins, hostsOf } from '../_shared/web/cors.ts';

const env = (name: string): string => Deno.env.get(name) ?? '';

const PIXEL_ID = env('META_PIXEL_ID');
const TOKEN = env('META_CAPI_TOKEN');
const TEST_CODE = env('META_TEST_EVENT_CODE');
const VERSION = env('META_GRAPH_VERSION');
const ORIGINS = funnelOrigins(env('WEB_FUNNEL_ORIGINS'));
const HOSTS = hostsOf(ORIGINS);

const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

/** A slow lookup never holds an event back: it goes without the hashes instead. */
const LOOKUP_MS = 3000;

/** The account the token names and its address, or null: no token, a token Supabase Auth does not know, or no answer in time. */
async function whoIs(req: Request): Promise<{ userId: string; email: string | null } | null> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const lookup = async () => {
    const { data, error } = await db.auth.getUser(token);
    const user = error == null ? data.user : null;
    if (user == null) return null;
    if (user.email) return { userId: user.id, email: user.email };
    // Before she pays, her address is on her lead, not on the anonymous account she will buy with.
    const { data: lead } = await db.from('web_leads').select('email').eq('user_id', user.id).maybeSingle();
    return { userId: user.id, email: typeof lead?.email === 'string' ? lead.email : null };
  };
  try {
    return await Promise.race([lookup(), new Promise<null>((resolve) => setTimeout(() => resolve(null), LOOKUP_MS))]);
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  const cors = corsHeaders(origin, ORIGINS, 'POST, OPTIONS');
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (origin != null && !ORIGINS.includes(origin)) return json({ error: 'origin not allowed' }, 403);
  if (!PIXEL_ID || !TOKEN) return new Response(null, { status: 204, headers: cors });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const name = body?.event_name;
  if (!isClientEvent(name)) return json({ error: 'event_name must be PageView, ViewContent or InitiateCheckout' }, 400);
  const id = eventId(body?.event_id);
  if (id == null) return json({ error: 'event_id missing or malformed' }, 400);
  const url = sourceUrl(body?.event_source_url, HOSTS);
  if (url == null) return json({ error: 'event_source_url must be a page of the funnel' }, 400);

  const time = Date.now() / 1000;
  const match = await matchKeys(await whoIs(req));
  const event = capiEvent({
    name,
    id,
    time,
    sourceUrl: url,
    ip: clientIp(req.headers),
    userAgent: req.headers.get('user-agent'),
    fbp: browserId(body?.fbp),
    fbc: browserId(body?.fbc),
    em: match.em,
    externalId: match.externalId,
  });
  const sent = await sendToMeta({ pixelId: PIXEL_ID, token: TOKEN, testEventCode: TEST_CODE, version: VERSION }, [event]);
  return json({ ok: sent.ok }, sent.ok ? 200 : 502);
});
