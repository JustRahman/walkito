/**
 * Meta's Conversions API, shaped by hand so nothing but what we chose can go.
 *
 * Four events in all: PageView, ViewContent (the plan) and InitiateCheckout
 * from the funnel's pages through `meta-capi`, and Purchase from
 * `revenuecat-webhook` only. Each carries the browser's own Meta ids (fbp,
 * fbc), its IP address and its user agent; Purchase also carries the amount.
 * Once she has given her email, a page event also carries two SHA-256 hashes
 * for Meta to match her by: her email (`em`) and our account id
 * (`external_id`). Never the email itself, no quiz answer, nothing else: the
 * funnel asks about feet, and Meta must not learn a word of it. `capiEvent`
 * takes named fields and writes a fresh object, so a field passed by mistake
 * has nowhere to go, and it drops an `em` or `externalId` that is not a
 * SHA-256 hash, so an address passed by mistake is not sent either.
 *
 * The browser pixel sends the same events with the same `event_id` and, once
 * it knows them, the same two hashes, and Meta keeps one of each pair.
 */

export const CLIENT_EVENTS = ['PageView', 'ViewContent', 'InitiateCheckout'] as const;
export type ClientEvent = (typeof CLIENT_EVENTS)[number];
export type CapiEventName = ClientEvent | 'Purchase';

/** Graph API v25.0 is served until July 2028. `META_GRAPH_VERSION` overrides it. */
export const GRAPH_VERSION = 'v25.0';

export type CapiInput = {
  name: CapiEventName;
  id: string;
  /** Seconds since the epoch. */
  time: number;
  sourceUrl: string;
  ip: string | null;
  userAgent: string | null;
  fbp: string | null;
  fbc: string | null;
  /** SHA-256 of her email, from `hashedEmail`. Anything that is not a hash is dropped. */
  em?: string | null;
  /** SHA-256 of our account id, from `hashedId`. Anything that is not a hash is dropped. */
  externalId?: string | null;
  /** Purchase only. */
  value?: number | null;
  currency?: string | null;
};

export type CapiEvent = {
  event_name: CapiEventName;
  event_time: number;
  event_id: string;
  action_source: 'website';
  event_source_url: string;
  user_data: { client_ip_address?: string; client_user_agent?: string; fbp?: string; fbc?: string; em?: string[]; external_id?: string[] };
  custom_data?: { value: number; currency: string };
};

export function isClientEvent(name: unknown): name is ClientEvent {
  return (CLIENT_EVENTS as readonly unknown[]).includes(name);
}

/** A Meta browser id (`_fbp`, `_fbc`): `fb.1.1596403881668.1116446470`. */
export function browserId(raw: unknown): string | null {
  return typeof raw === 'string' && /^fb\.\d\.\d+\.[^\s]{1,480}$/.test(raw) ? raw : null;
}

/** The id the browser pixel used for the same event, so Meta can keep one. */
export function eventId(raw: unknown): string | null {
  return typeof raw === 'string' && /^[A-Za-z0-9._:-]{1,100}$/.test(raw) ? raw : null;
}

/** The page, without its query or fragment: neutral paths only, and nothing a query string might carry. */
export function sourceUrl(raw: unknown, allowedHosts: readonly string[]): string | null {
  if (typeof raw !== 'string' || raw.length > 2000) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!allowedHosts.includes(url.hostname)) return null;
  return `${url.origin}${url.pathname}`;
}

/** The visitor's address, as the edge saw it: Cloudflare's header first, then the first hop of X-Forwarded-For. */
export function clientIp(headers: { get(name: string): string | null }): string | null {
  const candidates = [
    headers.get('cf-connecting-ip'),
    (headers.get('x-forwarded-for') ?? '').split(',')[0],
    headers.get('x-real-ip'),
  ];
  for (const raw of candidates) {
    const ip = raw?.trim() ?? '';
    if (ip.length > 0 && ip.length <= 64 && /^[0-9a-fA-F:.]+$/.test(ip)) return ip;
  }
  return null;
}

const SHA256 = /^[0-9a-f]{64}$/;
const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Meta's `em`: the address trimmed and in lowercase, then SHA-256 as lowercase hex. Null for anything that is not an address. */
export async function hashedEmail(raw: unknown): Promise<string | null> {
  const address = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return ADDRESS.test(address) && address.length <= 320 ? sha256Hex(address) : null;
}

/** Meta's `external_id`: our account id (the Supabase user id), hashed the same way. */
export async function hashedId(raw: unknown): Promise<string | null> {
  const id = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return id !== '' && id.length <= 100 ? sha256Hex(id) : null;
}

/** The two hashes for somebody we know: the account her token names, and the address on it or on her lead. */
export async function matchKeys(known: { userId: string; email: string | null } | null): Promise<{ em: string | null; externalId: string | null }> {
  if (known == null) return { em: null, externalId: null };
  const [em, externalId] = await Promise.all([hashedEmail(known.email), hashedId(known.userId)]);
  return { em, externalId };
}

export function capiEvent(input: CapiInput): CapiEvent {
  const user_data: CapiEvent['user_data'] = {};
  if (input.ip) user_data.client_ip_address = input.ip;
  if (input.userAgent) user_data.client_user_agent = input.userAgent.slice(0, 1024);
  const fbp = browserId(input.fbp);
  if (fbp != null) user_data.fbp = fbp;
  const fbc = browserId(input.fbc);
  if (fbc != null) user_data.fbc = fbc;
  if (typeof input.em === 'string' && SHA256.test(input.em)) user_data.em = [input.em];
  if (typeof input.externalId === 'string' && SHA256.test(input.externalId)) user_data.external_id = [input.externalId];
  const event: CapiEvent = {
    event_name: input.name,
    event_time: Math.floor(input.time),
    event_id: input.id,
    action_source: 'website',
    event_source_url: input.sourceUrl,
    user_data,
  };
  const value = input.value;
  const currency = input.currency?.toUpperCase() ?? '';
  if (input.name === 'Purchase' && typeof value === 'number' && Number.isFinite(value) && value >= 0 && /^[A-Z]{3}$/.test(currency)) {
    event.custom_data = { value: Math.round(value * 100) / 100, currency };
  }
  return event;
}

/** The request body. A test code sends the events to Events Manager's Test events tab instead of the real data. */
export function capiBody(events: CapiEvent[], testEventCode?: string | null): { data: CapiEvent[]; test_event_code?: string } {
  return testEventCode ? { data: events, test_event_code: testEventCode } : { data: events };
}

export type MetaConfig = { pixelId: string; token: string; testEventCode?: string | null; version?: string | null };

export async function sendToMeta(config: MetaConfig, events: CapiEvent[]): Promise<{ ok: boolean; status: number; detail: string }> {
  const version = config.version || GRAPH_VERSION;
  const url = `https://graph.facebook.com/${version}/${encodeURIComponent(config.pixelId)}/events?access_token=${encodeURIComponent(config.token)}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(capiBody(events, config.testEventCode)),
      signal: AbortSignal.timeout(8000),
    });
    const detail = (await res.text()).slice(0, 500);
    if (!res.ok) console.warn('[meta] events refused', res.status, detail);
    return { ok: res.ok, status: res.status, detail };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn('[meta] events not sent', detail);
    return { ok: false, status: 0, detail };
  }
}
