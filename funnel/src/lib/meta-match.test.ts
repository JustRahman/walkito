import { beforeEach, describe, expect, test } from 'bun:test';

import { capiEvent, eventId, hashedEmail, hashedId, isClientEvent } from '../../../supabase/functions/_shared/web/capi.ts';
import { eventPair, matchOf, sha256Hex, storeMatch, storedMatch, waitFor, type MetaEvent } from './meta-match';

const EMAIL = 'sam@example.com';
const USER_ID = '6f1c1d52-3a2b-4c8d-9e0f-1a2b3c4d5e6f';
/** `printf 'sam@example.com' | shasum -a 256`, and the same for the id. */
const EMAIL_HASH = 'cd25a6171969f2a3c6e35c7667e3908ef1bd2424241db04411a0eec454ca6c16';
const ID_HASH = '028b9645b24feeead773167b704482c15345e010354849606c4f2ebb53a95a59';

/** Bun has no localStorage of its own. */
const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
} as Storage;

beforeEach(() => store.clear());

describe("what the pixel is given once she has given her email", () => {
  test('SHA-256 as lowercase hex, against known values', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(await matchOf(USER_ID, EMAIL)).toEqual({ em: EMAIL_HASH, external_id: ID_HASH });
  });

  test('the email is trimmed and put in lowercase first', async () => {
    expect(await matchOf(` ${USER_ID.toUpperCase()}`, '  Sam@Example.COM ')).toEqual({ em: EMAIL_HASH, external_id: ID_HASH });
  });

  test('the same two hashes our server sends for the same person', async () => {
    const match = await matchOf(USER_ID, ' Sam@Example.com');
    expect(match?.em).toBe((await hashedEmail('sam@example.com '))!);
    expect(match?.external_id).toBe((await hashedId(USER_ID))!);
  });

  test('her address is nowhere in what the pixel gets, and nothing else is', async () => {
    const match = (await matchOf(USER_ID, EMAIL))!;
    expect(Object.keys(match).sort()).toEqual(['em', 'external_id']);
    for (const raw of [EMAIL, 'sam', '@', USER_ID]) expect(JSON.stringify(match)).not.toContain(raw);
  });

  test('no email or no account: nothing, never the hash of an empty string', async () => {
    expect(await matchOf(USER_ID, '')).toBeNull();
    expect(await matchOf(USER_ID, 'not an address')).toBeNull();
    expect(await matchOf('  ', EMAIL)).toBeNull();
  });
});

describe('kept for her next visit', () => {
  test('the two hashes, and gone when she signs out', async () => {
    expect(storedMatch()).toBeNull();
    storeMatch(await matchOf(USER_ID, EMAIL));
    expect(storedMatch()).toEqual({ em: EMAIL_HASH, external_id: ID_HASH });
    expect([...store.values()].join()).not.toContain(EMAIL);
    storeMatch(null);
    expect(storedMatch()).toBeNull();
  });

  test('anything that is not two hashes is not handed to the pixel', () => {
    for (const bad of ['{"em":"sam@example.com","external_id":"x"}', `{"em":"${EMAIL_HASH}"}`, 'not json', '[]']) {
      store.set('walkito-funnel-meta-match', bad);
      expect(storedMatch()).toBeNull();
    }
  });
});

/** Every event the funnel sends, with an id of the shape its call site makes (`main.tsx`, `screens/price.tsx`). */
const SENT: [MetaEvent, string][] = [
  ['PageView', 'view-3b241101-e2bb-4255-8caf-4136c566a962'],
  ['ViewContent', 'price-3b241101-e2bb-4255-8caf-4136c566a962'],
  ['InitiateCheckout', `checkout-${USER_ID}-1763500000000`],
  ['Purchase', `purchase-${USER_ID}`],
];

describe('one event, the pixel and our server: one name and one id', () => {
  test.each(SENT)('%s', (name, id) => {
    const pair = eventPair(name, id, 'https://start.walkito.site/s/18');
    expect(pair.pixel[0]).toBe('track');
    expect(pair.pixel[1]).toBe(name);
    expect(pair.pixel[3]).toEqual({ eventID: id });
    expect(pair.server).toEqual({ event_name: name, event_id: id, event_source_url: 'https://start.walkito.site/s/18' });
    // The server takes the id as it is, with no change of case or shape.
    expect(eventId(pair.server.event_id)).toBe(id);
  });

  test.each(SENT.filter(([name]) => name !== 'Purchase'))('%s reaches Meta from the server under the id the pixel used', (name, id) => {
    const pair = eventPair(name, id, 'https://start.walkito.site/s/18');
    if (!isClientEvent(pair.server.event_name)) throw new Error('the server would refuse this name');
    const sent = capiEvent({ name: pair.server.event_name, id: eventId(pair.server.event_id)!, time: 1763500000, sourceUrl: pair.server.event_source_url, ip: null, userAgent: null, fbp: null, fbc: null });
    expect(sent.event_name).toBe(pair.pixel[1]);
    expect(sent.event_id).toBe(pair.pixel[3].eventID);
  });

  test('a price goes to the pixel only, never to our server', () => {
    const pair = eventPair('Purchase', `purchase-${USER_ID}`, 'https://start.walkito.site/s/18', { value: 29.99, currency: 'USD' });
    expect(pair.pixel[2]).toEqual({ value: 29.99, currency: 'USD' });
    expect(Object.keys(pair.server).sort()).toEqual(['event_id', 'event_name', 'event_source_url']);
  });
});

describe("the server's copy waits for the pixel's browser id", () => {
  test('goes as soon as the cookie is there', async () => {
    let checks = 0;
    const started = Date.now();
    await waitFor(() => ++checks >= 3, 1000, 5);
    expect(checks).toBe(3);
    expect(Date.now() - started).toBeLessThan(500);
  });

  test('at once when it was there already', async () => {
    let checks = 0;
    await waitFor(() => (checks++, true), 1000, 5);
    expect(checks).toBe(1);
  });

  test('and goes without it after the limit: a blocked pixel holds nothing back for long', async () => {
    const started = Date.now();
    await waitFor(() => false, 40, 5);
    expect(Date.now() - started).toBeGreaterThanOrEqual(40);
    expect(Date.now() - started).toBeLessThan(500);
  });
});
