import { describe, expect, test } from 'bun:test';

import {
  compUntil,
  hasAccess,
  portalSubscription,
  recordWebState,
  webStateOf,
  type RcSubscriber,
} from '../supabase/functions/_shared/web/customer.ts';
import { WEB_PRODUCTS, firstCharge, isWebProduct, money, webProduct } from '../supabase/functions/_shared/web/products.ts';

/**
 * How a web purchase becomes access in the app: which purchases count as
 * web, what RevenueCat's record says about one, and the `comp_access` end
 * the webhook writes for it.
 */

const NOW = new Date('2026-11-16T12:00:00Z');
const DAY = 86_400_000;
const at = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString();

describe('which purchases are web purchases', () => {
  test('any product id starting with web_, with or without a store suffix', () => {
    expect(isWebProduct('web_monthly_intro')).toBe(true);
    expect(isWebProduct('web_quarter')).toBe(true);
    expect(isWebProduct('web_monthly_499:p1m')).toBe(true);
  });

  test('anything RevenueCat files under RevenueCat Billing or Stripe, in either spelling', () => {
    expect(isWebProduct('rc_1w_199', 'RC_BILLING')).toBe(true);
    expect(isWebProduct('price_1Qabc', 'STRIPE')).toBe(true);
    expect(isWebProduct('anything', 'rc_billing')).toBe(true);
    expect(isWebProduct(null, 'stripe')).toBe(true);
  });

  test('never an app purchase', () => {
    expect(isWebProduct('walkito_annual', 'APP_STORE')).toBe(false);
    expect(isWebProduct('pass_3mo', 'PLAY_STORE')).toBe(false);
    expect(isWebProduct('pass_12wk_4999')).toBe(false);
    expect(isWebProduct(null)).toBe(false);
    expect(isWebProduct(undefined, null)).toBe(false);
  });
});

describe('the catalog the emails quote', () => {
  test('has both contract products, at the prices the price page shows', () => {
    expect(webProduct('web_monthly_intro')).toMatchObject({ intro: { amount: 0.99, days: 7 }, amount: 9.99, months: 1, notice: 'intro' });
    expect(webProduct('web_quarter')).toMatchObject({ intro: null, amount: 19.99, months: 3, notice: 'every' });
    expect(webProduct('web_quarter:p3m')?.id).toBe('web_quarter');
    expect(webProduct('web_unknown')).toBeNull();
  });

  test('charges the intro price first, else a full period', () => {
    expect(money(firstCharge(WEB_PRODUCTS.web_monthly_intro), 'USD')).toBe('$0.99');
    expect(money(firstCharge(WEB_PRODUCTS.web_quarter), 'USD')).toBe('$19.99');
    expect(money(9.99, 'USD')).toBe('$9.99');
  });
});

function subscriber(sub: Record<string, unknown>, entitlement: Record<string, unknown> | null = {}, extra: Partial<RcSubscriber> = {}): RcSubscriber {
  const product = 'web_monthly_intro';
  return {
    subscriptions: { [product]: { store: 'rc_billing', purchase_date: at(0), original_purchase_date: at(0), ...sub } },
    entitlements: entitlement == null ? {} : { premium: { product_identifier: product, expires_date: sub.expires_date as string, ...entitlement } },
    ...extra,
  };
}

describe("RevenueCat's record of a web buyer", () => {
  test('the paid first week: intro, open, its end known', () => {
    const state = webStateOf(subscriber({ period_type: 'intro', expires_date: at(7) }), NOW);
    expect(state).toMatchObject({
      productId: 'web_monthly_intro',
      status: 'intro',
      access: true,
      periodEnd: at(7),
      accessEnd: at(7),
      introEndsAt: at(7),
      firstPurchaseAt: at(0),
    });
  });

  test('after the first renewal: active, no intro end any more (the database keeps the one it had)', () => {
    const state = webStateOf(subscriber({ period_type: 'normal', expires_date: at(30) }), NOW);
    expect(state?.status).toBe('active');
    expect(state?.introEndsAt).toBeNull();
  });

  test('cancelled: still open until the period ends, but will not renew', () => {
    const state = webStateOf(subscriber({ period_type: 'intro', expires_date: at(5), unsubscribe_detected_at: at(-1) }), NOW);
    expect(state).toMatchObject({ status: 'cancelled', access: true, periodEnd: at(5) });
  });

  test('a failed renewal in its grace period: still open, until the grace ends', () => {
    const state = webStateOf(
      subscriber({ period_type: 'normal', expires_date: at(-1), billing_issues_detected_at: at(-1), grace_period_expires_date: at(6) }, { grace_period_expires_date: at(6) }),
      NOW,
    );
    expect(state).toMatchObject({ status: 'billing_issue', access: true, periodEnd: at(-1), accessEnd: at(6) });
  });

  test('expired and refunded: no access', () => {
    expect(webStateOf(subscriber({ period_type: 'normal', expires_date: at(-2) }), NOW)).toMatchObject({ status: 'expired', access: false });
    expect(webStateOf(subscriber({ period_type: 'intro', expires_date: at(-0.1), refunded_at: at(-0.1) }), NOW)).toMatchObject({
      status: 'refunded',
      access: false,
    });
  });

  test("a web product left off every entitlement still opens the app while it runs; RevenueCat's refund still closes it", () => {
    expect(webStateOf(subscriber({ period_type: 'normal', expires_date: at(20) }, null), NOW)?.access).toBe(true);
    expect(webStateOf(subscriber({ period_type: 'normal', expires_date: at(20), refunded_at: at(-1) }, null), NOW)?.access).toBe(false);
  });

  test('nothing for a customer with no web purchase', () => {
    expect(webStateOf({}, NOW)).toBeNull();
    expect(
      webStateOf({ subscriptions: { walkito_annual: { store: 'app_store', expires_date: at(100) } }, entitlements: { premium: { product_identifier: 'walkito_annual', expires_date: at(100) } } }, NOW),
    ).toBeNull();
  });

  test('the latest web subscription is the current one; the first purchase is the earliest', () => {
    const state = webStateOf(
      {
        subscriptions: {
          web_monthly_intro: { store: 'rc_billing', period_type: 'normal', expires_date: at(-40), original_purchase_date: at(-80) },
          web_quarter: { store: 'rc_billing', period_type: 'normal', expires_date: at(60), original_purchase_date: at(-30) },
          walkito_annual: { store: 'app_store', expires_date: at(300) },
        },
        entitlements: { premium: { product_identifier: 'web_quarter', expires_date: at(60) } },
      },
      NOW,
    );
    expect(state).toMatchObject({ productId: 'web_quarter', status: 'active', periodEnd: at(60), firstPurchaseAt: at(-80) });
  });

  test("the customer portal comes from the subscription or the subscriber, https only", () => {
    const portal = 'https://api.revenuecat.com/rcbilling/v1/customerportal/tx1/portal';
    expect(webStateOf(subscriber({ period_type: 'intro', expires_date: at(7) }, {}, { management_url: portal }), NOW)?.managementUrl).toBe(portal);
    expect(webStateOf(subscriber({ period_type: 'intro', expires_date: at(7), management_url: portal }), NOW)?.managementUrl).toBe(portal);
    expect(webStateOf(subscriber({ period_type: 'intro', expires_date: at(7) }, {}, { management_url: 'javascript:alert(1)' }), NOW)?.managementUrl).toBeNull();
  });
});

describe('comp_access until', () => {
  test('is one day past the paid access', () => {
    expect(compUntil('2026-11-23T21:00:00.000Z')).toBe('2026-11-24T21:00:00.000Z');
    expect(compUntil('2027-02-14T15:30:00Z')).toBe('2027-02-15T15:30:00.000Z');
  });

  test('is nothing without an end', () => {
    expect(compUntil(null)).toBeNull();
    expect(compUntil('not a date')).toBeNull();
  });
});

describe('what the webhook writes', () => {
  function fakeDb() {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    return {
      calls,
      rpc: (fn: string, args: Record<string, unknown> = {}) => {
        calls.push({ fn, args });
        return Promise.resolve({ data: fn === 'web_drop_access' ? 'revoked' : 'granted', error: null });
      },
    };
  }

  test('an open purchase: the customer and a comp_access end a day past the access', async () => {
    const db = fakeDb();
    const state = webStateOf(subscriber({ period_type: 'intro', expires_date: '2026-11-23T21:00:00.000Z' }), NOW);
    expect(await recordWebState(db, 'u1', state)).toBe('granted');
    expect(db.calls).toEqual([
      {
        fn: 'web_record_customer',
        args: {
          p_user_id: 'u1',
          p_product_id: 'web_monthly_intro',
          p_status: 'intro',
          p_period_end: '2026-11-23T21:00:00.000Z',
          p_intro_ends_at: '2026-11-23T21:00:00.000Z',
          p_management_url: null,
          p_first_purchase_at: at(0),
          p_access: true,
          p_until: '2026-11-24T21:00:00.000Z',
        },
      },
    ]);
  });

  test('a closed purchase: no end is written, so the database removes the web row', async () => {
    const db = fakeDb();
    await recordWebState(db, 'u1', webStateOf(subscriber({ period_type: 'normal', expires_date: at(-2) }), NOW));
    expect(db.calls[0].args).toMatchObject({ p_status: 'expired', p_access: false, p_until: null });
  });

  test('no web purchase left in the record: web access is dropped', async () => {
    const db = fakeDb();
    expect(await recordWebState(db, 'u1', null)).toBe('revoked');
    expect(db.calls).toEqual([{ fn: 'web_drop_access', args: { p_user_id: 'u1' } }]);
  });
});

describe('access, as web-account answers it', () => {
  const later = at(3);
  const earlier = at(-3);
  test('any comp_access row still running, a founder\'s included', () => {
    expect(hasAccess({ until: later }, null, NOW)).toBe(true);
    expect(hasAccess({ until: null }, null, NOW)).toBe(true);
    expect(hasAccess({ until: earlier }, null, NOW)).toBe(false);
  });

  test('or a web purchase RevenueCat still counts as open', () => {
    expect(hasAccess(null, { status: 'intro', period_end: later }, NOW)).toBe(true);
    expect(hasAccess({ until: earlier }, { status: 'cancelled', period_end: later }, NOW)).toBe(true);
    expect(hasAccess(null, { status: 'active', period_end: earlier }, NOW)).toBe(false);
    expect(hasAccess(null, { status: 'refunded', period_end: later }, NOW)).toBe(false);
    expect(hasAccess(null, null, NOW)).toBe(false);
  });
});

describe('the customer portal link', () => {
  test('opens the web subscription that gives access, else the latest web one', () => {
    expect(
      portalSubscription([
        { id: 'sub_app', store: 'app_store', gives_access: true, current_period_ends_at: 9e12 },
        { id: 'sub_old', store: 'rc_billing', gives_access: false, current_period_ends_at: 2e12 },
        { id: 'sub_now', store: 'rc_billing', gives_access: true, current_period_ends_at: 1e12 },
      ])?.id,
    ).toBe('sub_now');
    expect(portalSubscription([{ id: 'a', store: 'rc_billing', gives_access: false, current_period_ends_at: 1 }, { id: 'b', store: 'rc_billing', gives_access: false, current_period_ends_at: 2 }])?.id).toBe('b');
    expect(portalSubscription([{ id: 'sub_app', store: 'app_store', gives_access: true }])).toBeNull();
  });
});
