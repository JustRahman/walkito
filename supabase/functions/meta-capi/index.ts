/**
 * The funnel's page events, sent to Meta from our server as well as from the
 * browser pixel, so an ad blocker or the Facebook app's browser does not lose
 * them. Meta keeps one of each pair: the browser and this send the same
 * `event_id`.
 *
 *   POST { event_name, event_id, event_source_url, fbp?, fbc? }
 *
 * Three events only: PageView, ViewContent (the plan) and InitiateCheckout.
 * Purchase is sent by `revenuecat-webhook` alone, from RevenueCat's record,
 * so a page cannot report a purchase that did not happen. What reaches Meta is
 * the event, the page's address without its query, the visitor's IP address
 * and user agent (from this request, never the body), and the browser's own
 * Meta ids. Nothing else: no email, no answers (`_shared/web/capi.ts`).
 *
 * Without META_PIXEL_ID and META_CAPI_TOKEN it answers 204 and sends nothing,
 * so the funnel can call it before the dataset exists. META_TEST_EVENT_CODE
 * routes everything to Events Manager's Test events tab. No Supabase JWT
 * (verify_jwt off in config.toml); CORS lets in the funnel's origins only,
 * plus any in WEB_FUNNEL_ORIGINS.
 */

import { capiEvent, clientIp, eventId, isClientEvent, sendToMeta, sourceUrl, browserId } from '../_shared/web/capi.ts';
import { corsHeaders, funnelOrigins, hostsOf } from '../_shared/web/cors.ts';

const env = (name: string): string => Deno.env.get(name) ?? '';

const PIXEL_ID = env('META_PIXEL_ID');
const TOKEN = env('META_CAPI_TOKEN');
const TEST_CODE = env('META_TEST_EVENT_CODE');
const VERSION = env('META_GRAPH_VERSION');
const ORIGINS = funnelOrigins(env('WEB_FUNNEL_ORIGINS'));
const HOSTS = hostsOf(ORIGINS);

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

  const event = capiEvent({
    name,
    id,
    time: Date.now() / 1000,
    sourceUrl: url,
    ip: clientIp(req.headers),
    userAgent: req.headers.get('user-agent'),
    fbp: browserId(body?.fbp),
    fbc: browserId(body?.fbc),
  });
  const sent = await sendToMeta({ pixelId: PIXEL_ID, token: TOKEN, testEventCode: TEST_CODE, version: VERSION }, [event]);
  return json({ ok: sent.ok }, sent.ok ? 200 : 502);
});
