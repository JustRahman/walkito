import { describe, expect, test } from 'bun:test';

import {
  CLIENT_EVENTS,
  browserId,
  capiBody,
  capiEvent,
  clientIp,
  eventId,
  isClientEvent,
  sourceUrl,
  type CapiInput,
} from '../supabase/functions/_shared/web/capi.ts';
import { corsHeaders, funnelOrigins, hostsOf } from '../supabase/functions/_shared/web/cors.ts';

/**
 * What reaches Meta: four events, the browser's ids, IP and user agent, and
 * the amount on a Purchase. Never an email, never an answer.
 */

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
    // Fields that must never travel, smuggled past the type.
    ...({ email: 'sam@example.com', em: 'abc', ph: '555', answers: { pain: 7, zones: ['heel'] }, custom_data: { goal: 'heel' } } as object),
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

  test('no email, hashed or not, and no answer anywhere in what is sent', () => {
    for (const name of [...CLIENT_EVENTS, 'Purchase'] as const) {
      const body = JSON.stringify(capiBody([capiEvent(careless(name))], 'TEST123'));
      for (const banned of ['sam@example.com', '"em"', '"ph"', 'email', 'answers', 'pain', 'heel', 'zones', 'goal']) {
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
