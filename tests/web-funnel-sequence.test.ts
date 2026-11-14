import { describe, expect, test } from 'bun:test';

import {
  DEFAULT_ZONE,
  dayOf,
  nextWebEmail,
  zoneOf,
  type WebCustomer,
  type WebEmailKey,
  type WebLogRow,
  type WebPerson,
} from '../supabase/functions/_shared/web/sequence.ts';

/**
 * The funnel's email timing, one rule at a time: each test builds one person
 * at one instant and asks which email, if any, that run would send.
 */

const NY = 'America/New_York';
const LA = 'America/Los_Angeles';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** The instant a local clock in `zone` shows `date hour:minute`. */
function inZone(zone: string, date: string, hour: number, minute = 0): Date {
  const guess = Date.parse(`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(guess));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const shown = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'));
  return new Date(guess - (shown - guess));
}

const ny = (date: string, hour: number, minute = 0) => inZone(NY, date, hour, minute);
const plus = (d: Date, ms: number) => new Date(d.getTime() + ms);

/** Monday 16 November 2026, 21:00 in New York. */
const BOUGHT = ny('2026-11-16', 21);

function person(over: Partial<WebPerson> = {}, customer: Partial<WebCustomer> | null = {}): WebPerson {
  return {
    userId: 'u1',
    email: 'sam@example.com',
    zone: NY,
    unsubscribed: false,
    checkoutOpenedAt: null,
    customer:
      customer == null
        ? null
        : {
            productId: 'web_monthly_intro',
            status: 'intro',
            periodEnd: plus(BOUGHT, 7 * DAY).toISOString(),
            introEndsAt: plus(BOUGHT, 7 * DAY).toISOString(),
            firstPurchaseAt: BOUGHT.toISOString(),
            ...customer,
          },
    log: [],
    ...over,
  };
}

const sent = (key: string, at: Date, status: WebLogRow['status'] = 'sent'): WebLogRow => ({ key, sentAt: at.toISOString(), status });
const pick = (p: WebPerson, now: Date): WebEmailKey | null => nextWebEmail(p, now).decision?.kind ?? null;
const why = (p: WebPerson, now: Date, kind: WebEmailKey) => nextWebEmail(p, now).skipped.find((s) => s.kind === kind)?.reason;

const welcomed = [sent('web_welcome', plus(BOUGHT, 60_000))];

describe('the time zone', () => {
  test("is the funnel's utm.tz when it is a real zone, else New York", () => {
    expect(zoneOf({ tz: 'America/Chicago', utm_source: 'fb' })).toBe('America/Chicago');
    expect(zoneOf({ tz: 'Mars/Olympus_Mons' })).toBe(DEFAULT_ZONE);
    expect(zoneOf({ tz: 42 })).toBe(DEFAULT_ZONE);
    expect(zoneOf({})).toBe(DEFAULT_ZONE);
    expect(zoneOf(null)).toBe(DEFAULT_ZONE);
    expect(DEFAULT_ZONE).toBe('America/New_York');
  });

  test('the small hours belong to the day before', () => {
    expect(dayOf(ny('2026-11-17', 1, 30).toISOString(), NY)).toBe('2026-11-16');
    expect(dayOf(ny('2026-11-17', 4).toISOString(), NY)).toBe('2026-11-17');
  });
});

describe('web_welcome', () => {
  test('goes right after the first purchase', () => {
    expect(pick(person(), plus(BOUGHT, 60_000))).toBe('web_welcome');
  });

  test('goes once', () => {
    expect(why(person({ log: welcomed }), plus(BOUGHT, 2 * HOUR), 'web_welcome')).toBe('already sent');
  });

  test('is a receipt: it goes after an unsubscribe too', () => {
    expect(pick(person({ unsubscribed: true }), plus(BOUGHT, 60_000))).toBe('web_welcome');
  });

  test('never a day late, and never for a refunded purchase', () => {
    expect(why(person(), plus(BOUGHT, 25 * HOUR), 'web_welcome')).toBe('purchase is more than a day old');
    expect(why(person({}, { status: 'refunded' }), plus(BOUGHT, 60_000), 'web_welcome')).toBe('plan refunded');
  });

  test('comes before anything else due at the same time', () => {
    expect(pick(person(), ny('2026-11-17', 8, 30))).toBe('web_welcome');
  });
});

describe('web_morning', () => {
  test('the next local morning, 08:00 to 12:00', () => {
    const p = person({ log: welcomed });
    expect(pick(p, ny('2026-11-17', 7, 59))).toBeNull();
    expect(why(p, ny('2026-11-17', 7, 59), 'web_morning')).toBe('outside 8:00-12:00 local');
    expect(pick(p, ny('2026-11-17', 8))).toBe('web_morning');
    expect(pick(p, ny('2026-11-17', 11, 59))).toBe('web_morning');
    expect(pick(p, ny('2026-11-17', 12))).toBeNull();
  });

  test('a purchase at 01:30 gets its morning the same day, one at 07:00 the next', () => {
    const owl = ny('2026-11-17', 1, 30);
    const night = person({ log: [sent('web_welcome', plus(owl, 60_000))] }, { firstPurchaseAt: owl.toISOString() });
    expect(pick(night, ny('2026-11-17', 8))).toBe('web_morning');

    const lark = ny('2026-11-17', 7);
    const early = person({ log: [sent('web_welcome', plus(lark, 60_000))] }, { firstPurchaseAt: lark.toISOString() });
    expect(why(early, ny('2026-11-17', 10), 'web_morning')).toBe('not yet');
    expect(pick(early, ny('2026-11-18', 8))).toBe('web_morning');
  });

  test("in the buyer's own time zone", () => {
    const bought = inZone(LA, '2026-11-16', 21);
    const p = person({ zone: LA, log: [sent('web_welcome', plus(bought, 60_000))] }, { firstPurchaseAt: bought.toISOString() });
    expect(pick(p, ny('2026-11-17', 8))).toBeNull();
    expect(pick(p, inZone(LA, '2026-11-17', 8))).toBe('web_morning');
  });

  test('not after an unsubscribe, nor for a refunded plan', () => {
    expect(why(person({ log: welcomed, unsubscribed: true }), ny('2026-11-17', 8), 'web_morning')).toBe('unsubscribed');
    expect(pick(person({ log: welcomed }, { status: 'refunded' }), ny('2026-11-17', 8))).toBeNull();
  });

  test('waits three hours after another email', () => {
    const late = person({ log: [sent('web_welcome', ny('2026-11-17', 7, 55))] });
    expect(why(late, ny('2026-11-17', 8), 'web_morning')).toBe('another email went out less than 3 hours ago');
    expect(pick(late, ny('2026-11-17', 11))).toBe('web_morning');
  });

  test('no second non-billing email in a local day', () => {
    const p = person({ log: [...welcomed, sent('web_abandon_2', ny('2026-11-17', 8, 1))] });
    expect(why(p, ny('2026-11-17', 11, 30), 'web_morning')).toBe('already emailed today');
  });
});

describe('web_day3', () => {
  const p = person({ log: [...welcomed, sent('web_morning', ny('2026-11-17', 8))] });

  test('two days after the purchase day, 10:00 to 14:00', () => {
    expect(pick(p, ny('2026-11-18', 9, 59))).toBeNull();
    expect(pick(p, ny('2026-11-18', 10))).toBe('web_day3');
    expect(pick(p, ny('2026-11-18', 14))).toBeNull();
  });

  test('not on a later day', () => {
    expect(why(p, ny('2026-11-19', 10), 'web_day3')).toBe('its day has passed');
  });
});

describe('web_renewal_notice', () => {
  const before = [...welcomed, sent('web_morning', ny('2026-11-17', 8)), sent('web_day3', ny('2026-11-18', 10))];
  const monthly = person({ log: before });

  test('on the local day two days before the first $9.99, from 09:00', () => {
    // The first week ends Monday 23 November at 21:00 in New York.
    expect(why(monthly, ny('2026-11-20', 12), 'web_renewal_notice')).toBe('not yet');
    expect(why(monthly, ny('2026-11-21', 8, 59), 'web_renewal_notice')).toBe('outside 9:00-21:00 local');
    expect(nextWebEmail(monthly, ny('2026-11-21', 9)).decision).toEqual({
      kind: 'web_renewal_notice',
      logKey: 'web_renewal_notice:2026-11-24',
      renewalAt: plus(BOUGHT, 7 * DAY).toISOString(),
    });
  });

  test('is a billing email: it goes after an unsubscribe too', () => {
    expect(pick(person({ log: before, unsubscribed: true }), ny('2026-11-21', 9))).toBe('web_renewal_notice');
  });

  test('goes once, and catches up the next day if a run missed it, while the charge is 12 hours away', () => {
    expect(why(person({ log: [...before, sent('web_renewal_notice:2026-11-24', ny('2026-11-21', 9))] }), ny('2026-11-21', 15), 'web_renewal_notice')).toBe(
      'already sent',
    );
    expect(pick(monthly, ny('2026-11-22', 10))).toBe('web_renewal_notice');
    const early = person({ log: before }, { introEndsAt: ny('2026-11-23', 6).toISOString(), periodEnd: ny('2026-11-23', 6).toISOString() });
    expect(why(early, ny('2026-11-22', 20), 'web_renewal_notice')).toBe('too close to the charge');
  });

  test('never for a plan that will not renew, nor for later monthly renewals', () => {
    expect(why(person({ log: before }, { status: 'cancelled' }), ny('2026-11-21', 9), 'web_renewal_notice')).toBe('no renewal to announce');
    const later = person({ log: before }, { status: 'active', periodEnd: ny('2026-12-23', 21).toISOString() });
    expect(why(later, ny('2026-12-21', 9), 'web_renewal_notice')).toBe('no renewal to announce');
  });

  test('before every renewal of the 3-month plan, each once', () => {
    const quarter = (periodEnd: string, log: WebLogRow[]) =>
      person({ log: [...before, ...log] }, { productId: 'web_quarter', status: 'active', periodEnd, introEndsAt: null });
    const first = quarter('2027-02-14T15:00:00.000Z', []);
    expect(nextWebEmail(first, ny('2027-02-12', 10)).decision?.logKey).toBe('web_renewal_notice:2027-02-14');
    const second = quarter('2027-05-15T15:00:00.000Z', [sent('web_renewal_notice:2027-02-14', ny('2027-02-12', 10))]);
    expect(nextWebEmail(second, inZone(NY, '2027-05-13', 10)).decision?.logKey).toBe('web_renewal_notice:2027-05-15');
  });

  test('held for a product the catalog does not know, so no amount is guessed', () => {
    expect(why(person({ log: before }, { productId: 'web_monthly_499' }), ny('2026-11-21', 9), 'web_renewal_notice')).toBe(
      'no catalog entry for web_monthly_499',
    );
  });
});

describe('web_abandon_1 and web_abandon_2', () => {
  const opened = ny('2026-11-16', 14);
  const lead = (over: Partial<WebPerson> = {}) => person({ checkoutOpenedAt: opened.toISOString(), ...over }, null);

  test('the first, one to two hours after checkout opened', () => {
    expect(why(lead(), ny('2026-11-16', 14, 59), 'web_abandon_1')).toBe('not yet');
    expect(pick(lead(), ny('2026-11-16', 15))).toBe('web_abandon_1');
    expect(why(lead(), ny('2026-11-16', 16), 'web_abandon_1')).toBe('its window has passed');
  });

  test('the second, the next day from 10:00, once', () => {
    const after = lead({ log: [sent('web_abandon_1', ny('2026-11-16', 15, 5))] });
    expect(pick(after, ny('2026-11-17', 9, 59))).toBeNull();
    expect(pick(after, ny('2026-11-17', 10))).toBe('web_abandon_2');
    expect(why(after, ny('2026-11-18', 10), 'web_abandon_2')).toBe('its day has passed');
    expect(why(lead({ log: [sent('web_abandon_2', ny('2026-11-17', 10))] }), ny('2026-11-17', 15), 'web_abandon_2')).toBe('already sent');
  });

  test('never at night: a checkout at 21:30 skips the first and gets the second', () => {
    const late = person({ checkoutOpenedAt: ny('2026-11-16', 21, 30).toISOString() }, null);
    expect(why(late, ny('2026-11-16', 22, 45), 'web_abandon_1')).toBe('night time');
    expect(pick(late, ny('2026-11-17', 10))).toBe('web_abandon_2');
  });

  test('at least twelve hours after a checkout in the small hours', () => {
    const owl = person({ checkoutOpenedAt: ny('2026-11-17', 1).toISOString() }, null);
    expect(why(owl, ny('2026-11-17', 12, 59), 'web_abandon_2')).toBe('not yet');
    expect(pick(owl, ny('2026-11-17', 13))).toBe('web_abandon_2');
  });

  test('never to a buyer, even one whose plan has ended', () => {
    const buyer = person({ checkoutOpenedAt: opened.toISOString(), log: welcomed }, { status: 'expired' });
    expect(pick(buyer, ny('2026-11-16', 15))).toBeNull();
    expect(pick(buyer, ny('2026-11-17', 10))).toBeNull();
  });

  test('not after an unsubscribe, not without an address, not without a checkout', () => {
    expect(why(lead({ unsubscribed: true }), ny('2026-11-16', 15), 'web_abandon_1')).toBe('unsubscribed');
    expect(why(lead({ unsubscribed: true }), ny('2026-11-17', 10), 'web_abandon_2')).toBe('unsubscribed');
    expect(nextWebEmail(lead({ email: null }), ny('2026-11-16', 15)).blocked).toBe('no email address');
    expect(nextWebEmail(person({}, null), ny('2026-11-16', 15)).blocked).toBe('never opened checkout');
  });
});
