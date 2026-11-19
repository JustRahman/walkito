import { afterEach, describe, expect, test } from 'bun:test';

import {
  CLIENT_EVENTS,
  browserId,
  capiBody,
  capiEvent,
  clientIp,
  eventId,
  hashedEmail,
  hashedId,
  isClientEvent,
  matchKeys,
  sendToMeta,
  sha256Hex,
  sourceUrl,
  type CapiInput,
} from '../supabase/functions/_shared/web/capi.ts';
import { corsHeaders, funnelOrigins, hostsOf } from '../supabase/functions/_shared/web/cors.ts';

/**
 * What reaches Meta: four events, the browser's ids, IP and user agent, the
 * amount on a Purchase and, once she has given her email, two SHA-256 hashes
 * (her email, our account id). Never the email itself, never an answer.
 */

const EMAIL = 'sam@example.com';
const USER_ID = '6f1c1d52-3a2b-4c8d-9e0f-1a2b3c4d5e6f';
/** `printf 'sam@example.com' | shasum -a 256`, and the same for the id. */
const EMAIL_HASH = 'cd25a6171969f2a3c6e35c7667e3908ef1bd2424241db04411a0eec454ca6c16';
const ID_HASH = '028b9645b24feeead773167b704482c15345e010354849606c4f2ebb53a95a59';

const FBP = 'fb.1.1596403881668.1116446470';
const FBC = 'fb.1.1554763741205.AbCdEfGhIjKlMnOpQrStUvWxYz1234567890';
const HOSTS = hostsOf(funnelOrigins(''));

function headers(map: Record<string, string>) {
  return { get: (name: string) => map[name.toLowerCase()] ?? null };
}

/** An input with everything a careless caller might add. */
function careless(name: CapiInput['name']): CapiInput {
  return {
    name,
    id: 'pv-123',
    time: 1_763_300_000.7,
    sourceUrl: 'https://start.walkito.site/s/3',
    ip: '203.0.113.7',
    userAgent: 'Mozilla/5.0 (iPhone) FBAN/FBIOS',
    fbp: FBP,
    fbc: FBC,
    value: 0.99,
    currency: 'usd',
    // Fields that must never travel, smuggled past the type: her address as it is, in `em` too.
    ...({ email: EMAIL, em: EMAIL, externalId: USER_ID, ph: '555', answers: { pain: 7, zones: ['heel'] }, custom_data: { goal: 'heel' } } as object),
  } as CapiInput;
}

describe('the events allowed from a page', () => {
  test('PageView, ViewContent and InitiateCheckout; Purchase only from the server', () => {
    expect([...CLIENT_EVENTS]).toEqual(['PageView', 'ViewContent', 'InitiateCheckout']);
    for (const name of CLIENT_EVENTS) expect(isClientEvent(name)).toBe(true);
    expect(isClientEvent('Purchase')).toBe(false);
    expect(isClientEvent('Lead')).toBe(false);
    expect(isClientEvent('CompleteRegistration')).toBe(false);
    expect(isClientEvent(undefined)).toBe(false);
  });
});

describe('the payload', () => {
  test('a page event carries the browser ids, IP and user agent, and nothing else', () => {
    const event = capiEvent(careless('ViewContent'));
    expect(Object.keys(event).sort()).toEqual(['action_source', 'event_id', 'event_name', 'event_source_url', 'event_time', 'user_data']);
    expect(event).toEqual({
      event_name: 'ViewContent',
      event_time: 1_763_300_000,
      event_id: 'pv-123',
      action_source: 'website',
      event_source_url: 'https://start.walkito.site/s/3',
      user_data: { client_ip_address: '203.0.113.7', client_user_agent: 'Mozilla/5.0 (iPhone) FBAN/FBIOS', fbp: FBP, fbc: FBC },
    });
  });

  test('a Purchase adds the amount and currency, nothing more', () => {
    const event = capiEvent(careless('Purchase'));
    expect(event.custom_data).toEqual({ value: 0.99, currency: 'USD' });
    expect(Object.keys(event.user_data).sort()).toEqual(['client_ip_address', 'client_user_agent', 'fbc', 'fbp']);
  });

  test('an address or an id that was not hashed is dropped, and no answer is in what is sent', () => {
    for (const name of [...CLIENT_EVENTS, 'Purchase'] as const) {
      const body = JSON.stringify(capiBody([capiEvent(careless(name))], 'TEST123'));
      for (const banned of [EMAIL, USER_ID, '@', '"em"', '"external_id"', '"ph"', 'email', 'answers', 'pain', 'heel', 'zones', 'goal']) {
        expect(body).not.toContain(banned);
      }
    }
  });

  test('missing ids are left out rather than sent empty; bad ones are dropped', () => {
    const event = capiEvent({ name: 'PageView', id: 'x', time: 1, sourceUrl: 'https://start.walkito.site/', ip: null, userAgent: null, fbp: 'not-an-id', fbc: null });
    expect(event.user_data).toEqual({});
  });

  test('a Purchase without a valid amount or currency carries no custom data', () => {
    const base = careless('Purchase');
    expect(capiEvent({ ...base, value: null }).custom_data).toBeUndefined();
    expect(capiEvent({ ...base, currency: 'dollars' }).custom_data).toBeUndefined();
    expect(capiEvent({ ...base, value: Number.NaN }).custom_data).toBeUndefined();
  });

  test('a test code routes the events to the Test events tab', () => {
    const event = capiEvent(careless('PageView'));
    expect(capiBody([event], 'TEST123')).toEqual({ data: [event], test_event_code: 'TEST123' });
    expect(capiBody([event], '')).toEqual({ data: [event] });
    expect(capiBody([event], null)).toEqual({ data: [event] });
  });
});

describe('the two hashes Meta matches her by', () => {
  test('SHA-256 as lowercase hex, against known values', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(await hashedEmail(EMAIL)).toBe(EMAIL_HASH);
    expect(await hashedId(USER_ID)).toBe(ID_HASH);
  });

  test('the email is trimmed and put in lowercase first, as Meta asks', async () => {
    expect(await hashedEmail('  Sam@Example.COM \n')).toBe(EMAIL_HASH);
    expect(await hashedId(` ${USER_ID.toUpperCase()} `)).toBe(ID_HASH);
  });

  test('nothing to hash gives nothing, never the hash of an empty string', async () => {
    for (const raw of [null, undefined, '', '   ', 'not an address', 42]) expect(await hashedEmail(raw)).toBeNull();
    for (const raw of [null, undefined, '', '   ', 42]) expect(await hashedId(raw)).toBeNull();
    expect(await matchKeys(null)).toEqual({ em: null, externalId: null });
    expect(await matchKeys({ userId: USER_ID, email: null })).toEqual({ em: null, externalId: ID_HASH });
  });

  test('known: `em` and `external_id` go as arrays of one hash each, beside what was there before', async () => {
    const match = await matchKeys({ userId: USER_ID, email: ` ${EMAIL.toUpperCase()}` });
    for (const name of CLIENT_EVENTS) {
      const event = capiEvent({ ...careless(name), ...match });
      expect(event.user_data).toEqual({
        client_ip_address: '203.0.113.7',
        client_user_agent: 'Mozilla/5.0 (iPhone) FBAN/FBIOS',
        fbp: FBP,
        fbc: FBC,
        em: [EMAIL_HASH],
        external_id: [ID_HASH],
      });
      for (const hash of [...event.user_data.em!, ...event.user_data.external_id!]) expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(event.custom_data).toBeUndefined();
    }
  });

  test('not known: neither key is in the payload', async () => {
    const event = capiEvent({ ...careless('ViewContent'), ...(await matchKeys(null)) });
    expect(Object.keys(event.user_data).sort()).toEqual(['client_ip_address', 'client_user_agent', 'fbc', 'fbp']);
  });

  test('a hash in capitals is not sent as it is: Meta wants lowercase', () => {
    const event = capiEvent({ ...careless('ViewContent'), em: EMAIL_HASH.toUpperCase(), externalId: ID_HASH.slice(1) });
    expect(event.user_data.em).toBeUndefined();
    expect(event.user_data.external_id).toBeUndefined();
  });
});

describe('the request to Meta', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  /** Stands in for graph.facebook.com: nothing leaves this machine. */
  function capture(): { url: string; body: string }[] {
    const calls: { url: string; body: string }[] = [];
    globalThis.fetch = (async (url: unknown, init?: { body?: unknown }) => {
      calls.push({ url: String(url), body: String(init?.body) });
      return new Response('{"events_received":1}', { status: 200 });
    }) as typeof fetch;
    return calls;
  }

  test('known: the body has both arrays, and her address is nowhere in it', async () => {
    const calls = capture();
    const match = await matchKeys({ userId: USER_ID, email: EMAIL });
    const sent = await sendToMeta({ pixelId: '123', token: 'secret' }, [capiEvent({ ...careless('ViewContent'), ...match })]);
    expect(sent.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toStartWith('https://graph.facebook.com/v25.0/123/events?');
    const data = JSON.parse(calls[0]!.body).data[0];
    expect(data.user_data.em).toEqual([EMAIL_HASH]);
    expect(data.user_data.external_id).toEqual([ID_HASH]);
    for (const raw of [EMAIL, 'sam', 'example.com', '@', USER_ID]) expect(calls[0]!.url + calls[0]!.body).not.toContain(raw);
  });

  test('not known: no `em` and no `external_id`', async () => {
    const calls = capture();
    await sendToMeta({ pixelId: '123', token: 'secret' }, [capiEvent({ ...careless('PageView'), ...(await matchKeys(null)) })]);
    expect(calls[0]!.body).not.toContain('"em"');
    expect(calls[0]!.body).not.toContain('external_id');
  });

  test("the browser's event id and event name reach Meta as they came, so Meta can pair the two copies", async () => {
    const calls = capture();
    for (const name of CLIENT_EVENTS) {
      const id = `${name}-6f1c1d52-3a2b-4c8d-9e0f-1a2b3c4d5e6f`;
      await sendToMeta({ pixelId: '123', token: 'secret' }, [capiEvent({ ...careless(name), id: eventId(id)! })]);
      const data = JSON.parse(calls.at(-1)!.body).data[0];
      expect(data.event_id).toBe(id);
      expect(data.event_name).toBe(name);
    }
  });
});

describe('what a page may send', () => {
  test("the page's address loses its query and fragment, and must be the funnel's", () => {
    expect(sourceUrl('https://start.walkito.site/s/3?utm_source=fb&fbclid=abc#top', HOSTS)).toBe('https://start.walkito.site/s/3');
    expect(sourceUrl('http://localhost:3000/s/1?x=1', HOSTS)).toBe('http://localhost:3000/s/1');
    expect(sourceUrl('https://evil.example/s/3', HOSTS)).toBeNull();
    expect(sourceUrl('javascript:alert(1)', HOSTS)).toBeNull();
    expect(sourceUrl('not a url', HOSTS)).toBeNull();
    expect(sourceUrl(42, HOSTS)).toBeNull();
  });

  test('event ids and browser ids have their own shapes', () => {
    expect(eventId('checkout-6f1c1d52-3a2b-4c8d-9e0f-1a2b3c4d5e6f')).not.toBeNull();
    expect(eventId('has space')).toBeNull();
    expect(eventId('x'.repeat(101))).toBeNull();
    expect(browserId(FBP)).toBe(FBP);
    expect(browserId(FBC)).toBe(FBC);
    expect(browserId('fb.1.123')).toBeNull();
    expect(browserId('sam@example.com')).toBeNull();
  });
});

describe("the visitor's address", () => {
  test("Cloudflare's header first, then the first hop of X-Forwarded-For", () => {
    expect(clientIp(headers({ 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '198.51.100.1, 10.0.0.1' }))).toBe('203.0.113.7');
    expect(clientIp(headers({ 'x-forwarded-for': '198.51.100.1, 10.0.0.1' }))).toBe('198.51.100.1');
    expect(clientIp(headers({ 'x-forwarded-for': '2001:db8::1' }))).toBe('2001:db8::1');
    expect(clientIp(headers({ 'x-real-ip': '192.0.2.4' }))).toBe('192.0.2.4');
    expect(clientIp(headers({ 'x-forwarded-for': '<script>' }))).toBeNull();
    expect(clientIp(headers({}))).toBeNull();
  });
});

describe('CORS', () => {
  test('the funnel and a dev server, plus any origin added by environment', () => {
    const origins = funnelOrigins('https://walkito-funnel.pages.dev/, not an origin');
    expect(origins).toEqual(['https://walkito.site', 'https://start.walkito.site', 'http://localhost:3000', 'https://walkito-funnel.pages.dev']);
    expect(corsHeaders('https://start.walkito.site', origins, 'POST')['Access-Control-Allow-Origin']).toBe('https://start.walkito.site');
    expect(corsHeaders('https://evil.example', origins, 'POST')['Access-Control-Allow-Origin']).toBeUndefined();
    expect(corsHeaders(null, origins, 'POST')['Access-Control-Allow-Origin']).toBeUndefined();
  });
});
