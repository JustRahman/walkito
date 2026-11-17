import { isWebProduct } from './products.ts';

/**
 * A web buyer's subscription, read from RevenueCat's own record of them.
 *
 * Shared by `revenuecat-webhook` (RevenueCat calls it after any change) and
 * `web-account` (the success page polls it right after checkout), so
 * whichever comes first writes the same answer. Neither trusts a request
 * body: the record is always fetched with our key, as the webhook has always
 * done for app purchases.
 *
 * What gets written is `web_customers` (the funnel's view of the purchase)
 * and, through `web_record_customer` in 0021_web_funnel.sql, a
 * `comp_access` row with reason 'web' that the app reads on every sign-in.
 * Only rows with reason 'web' are ever written or deleted here: a founder's,
 * a reviewer's or an access code's row is left exactly as it is.
 */

// deno-lint-ignore no-explicit-any
type Db = { rpc: (fn: string, args?: Record<string, unknown>) => any };

/** One entry of `subscriber.subscriptions` in RevenueCat's v1 API, keyed by product id. */
export type RcSubscription = {
  expires_date?: string | null;
  purchase_date?: string | null;
  original_purchase_date?: string | null;
  /** `normal`, `intro` (a paid first period), `trial` or `prepaid`. */
  period_type?: string | null;
  /** `rc_billing`, `stripe`, `app_store` … */
  store?: string | null;
  unsubscribe_detected_at?: string | null;
  billing_issues_detected_at?: string | null;
  grace_period_expires_date?: string | null;
  refunded_at?: string | null;
  management_url?: string | null;
};

export type RcEntitlement = {
  expires_date: string | null;
  grace_period_expires_date?: string | null;
  product_identifier?: string;
  purchase_date?: string;
};

export type RcSubscriber = {
  entitlements?: Record<string, RcEntitlement>;
  subscriptions?: Record<string, RcSubscription>;
  non_subscriptions?: Record<string, unknown[]>;
  /** For RevenueCat Billing, the customer portal (which emails the buyer a sign-in link). */
  management_url?: string | null;
};

/**
 * - `intro`: in the paid first week, will renew
 * - `active`: in a paid period, will renew
 * - `cancelled`: still open until `period_end`, will not renew
 * - `billing_issue`: a renewal charge failed and RevenueCat is retrying
 * - `expired`, `refunded`: no access
 */
export type WebStatus = 'intro' | 'active' | 'cancelled' | 'billing_issue' | 'expired' | 'refunded';

export type WebState = {
  productId: string;
  status: WebStatus;
  access: boolean;
  /** The current period's end, as the entitlement says (`expires_date`). */
  periodEnd: string | null;
  /** When access really ends: the period's end, or a grace period's after a failed renewal. */
  accessEnd: string | null;
  /** The end of the paid first period, while the buyer is in it. */
  introEndsAt: string | null;
  managementUrl: string | null;
  firstPurchaseAt: string | null;
};

const DAY_MS = 86_400_000;

const ms = (iso: string | null | undefined): number => (iso == null ? Number.NaN : Date.parse(iso));

/** The later of two instants; a missing one loses. */
function later(a: string | null | undefined, b: string | null | undefined): string | null {
  if (Number.isNaN(ms(b))) return Number.isNaN(ms(a)) ? null : (a as string);
  if (Number.isNaN(ms(a))) return b as string;
  return ms(b) > ms(a) ? (b as string) : (a as string);
}

function earlier(a: string | null | undefined, b: string | null | undefined): string | null {
  if (Number.isNaN(ms(b))) return Number.isNaN(ms(a)) ? null : (a as string);
  if (Number.isNaN(ms(a))) return b as string;
  return ms(b) < ms(a) ? (b as string) : (a as string);
}

const httpsOrNull = (url: string | null | undefined): string | null =>
  typeof url === 'string' && url.startsWith('https://') ? url : null;

/**
 * The web purchase in a RevenueCat subscriber record, or null when there is
 * none. When there are several (a plan changed, a lapsed buyer came back),
 * the one that runs latest is the current one.
 */
export function webStateOf(subscriber: RcSubscriber, now: Date = new Date()): WebState | null {
  const web = Object.entries(subscriber.subscriptions ?? {}).filter(([id, sub]) => isWebProduct(id, sub.store));
  if (web.length === 0) return null;
  const end = (sub: RcSubscription) => ms(later(sub.expires_date, sub.grace_period_expires_date));
  const [productId, sub] = web.reduce((a, b) => (end(b[1]) > end(a[1]) ? b : a));

  // RevenueCat's own answer, when a web product grants an entitlement: it
  // already accounts for refunds and grace periods. A web product left off
  // every entitlement still opens the app for as long as it runs.
  const granting = Object.values(subscriber.entitlements ?? {}).filter((e) => isWebProduct(e.product_identifier));
  const entitlement = granting.find((e) => e.product_identifier === productId) ?? granting[0] ?? null;
  const periodEnd = entitlement != null ? entitlement.expires_date : (sub.expires_date ?? null);
  const accessEnd = later(periodEnd, entitlement?.grace_period_expires_date ?? sub.grace_period_expires_date);
  const access =
    entitlement != null
      ? entitlement.expires_date == null || ms(accessEnd) > now.getTime()
      : sub.refunded_at == null && ms(accessEnd) > now.getTime();

  const intro = sub.period_type === 'intro' || sub.period_type === 'trial';
  const status: WebStatus = !access
    ? sub.refunded_at != null
      ? 'refunded'
      : 'expired'
    : sub.unsubscribe_detected_at != null
      ? 'cancelled'
      : sub.billing_issues_detected_at != null
        ? 'billing_issue'
        : intro
          ? 'intro'
          : 'active';

  let firstPurchaseAt: string | null = null;
  for (const [, s] of web) firstPurchaseAt = earlier(firstPurchaseAt, s.original_purchase_date ?? s.purchase_date);

  return {
    productId,
    status,
    access,
    periodEnd,
    accessEnd,
    introEndsAt: intro ? (sub.expires_date ?? null) : null,
    managementUrl: httpsOrNull(sub.management_url) ?? httpsOrNull(subscriber.management_url),
    firstPurchaseAt,
  };
}

/** How long `comp_access` keeps the app open: a day past the paid access, so a renewal that lands late locks nobody out. */
export function compUntil(accessEnd: string | null): string | null {
  if (Number.isNaN(ms(accessEnd))) return null;
  return new Date(ms(accessEnd) + DAY_MS).toISOString();
}

/** RevenueCat's record of one customer, or null when the lookup fails. */
export async function fetchSubscriber(rcKey: string, appUserId: string): Promise<RcSubscriber | null> {
  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: { Authorization: `Bearer ${rcKey}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    console.warn('[revenuecat] lookup failed', res.status);
    return null;
  }
  const body = (await res.json()) as { subscriber?: RcSubscriber };
  return body.subscriber ?? {};
}

/**
 * Writes one buyer's web state. Answers what happened to their
 * `comp_access`: `granted`, `kept` (they hold a row with another reason,
 * left alone), `revoked`, `none`, `no user` (the account is gone), or
 * `failed: …`.
 *
 * A state of null means RevenueCat holds no web purchase for this id (it was
 * transferred away, or there never was one), so any web access ends.
 */
export async function recordWebState(db: Db, userId: string, state: WebState | null): Promise<string> {
  if (state == null) {
    const { data, error } = await db.rpc('web_drop_access', { p_user_id: userId });
    return error != null ? `failed: ${error.message}` : String(data ?? 'none');
  }
  const { data, error } = await db.rpc('web_record_customer', {
    p_user_id: userId,
    p_product_id: state.productId,
    p_status: state.status,
    p_period_end: state.periodEnd,
    p_intro_ends_at: state.introEndsAt,
    p_management_url: state.managementUrl,
    p_first_purchase_at: state.firstPurchaseAt,
    p_access: state.access,
    p_until: state.access ? compUntil(state.accessEnd) : null,
  });
  return error != null ? `failed: ${error.message}` : String(data ?? 'none');
}

/** One subscription in RevenueCat's v2 API, the fields the portal link needs. */
export type RcV2Subscription = {
  id: string;
  store?: string | null;
  gives_access?: boolean | null;
  current_period_ends_at?: number | null;
};

/** The web subscription to open the customer portal for: one that gives access, else the latest. */
export function portalSubscription(items: RcV2Subscription[]): RcV2Subscription | null {
  const web = items.filter((s) => isWebProduct(null, s.store));
  if (web.length === 0) return null;
  const rank = (s: RcV2Subscription) => (s.gives_access ? 1 : 0) * 1e15 + (s.current_period_ends_at ?? 0);
  return web.reduce((a, b) => (rank(b) > rank(a) ? b : a));
}

/**
 * A single-use link straight into the RevenueCat Billing customer portal,
 * signed in, from RevenueCat's v2 API. The v1 `management_url` opens a page
 * that emails the buyer a link first; this one skips that step, so cancelling
 * is one tap. Null when the v2 key is not configured or anything fails, and
 * the caller falls back to `management_url`. Never cached: each link works once.
 */
export async function portalLink(v2Key: string, projectId: string, appUserId: string): Promise<string | null> {
  if (!v2Key || !projectId) return null;
  const base = `https://api.revenuecat.com/v2/projects/${encodeURIComponent(projectId)}`;
  const headers = { Authorization: `Bearer ${v2Key}` };
  try {
    const list = await fetch(`${base}/customers/${encodeURIComponent(appUserId)}/subscriptions`, { headers });
    if (!list.ok) return null;
    const { items } = (await list.json()) as { items?: RcV2Subscription[] };
    const sub = portalSubscription(items ?? []);
    if (sub == null) return null;
    const res = await fetch(`${base}/subscriptions/${encodeURIComponent(sub.id)}/authenticated_management_url`, { headers });
    if (!res.ok) return null;
    const body = (await res.json()) as { management_url?: string | null };
    return httpsOrNull(body.management_url);
  } catch (error) {
    console.warn('[revenuecat] portal link failed', error instanceof Error ? error.message : String(error));
    return null;
  }
}

/** One account's view of a web purchase, as `web-account` reads it. */
export type PurchaseView = {
  userId: string;
  customer: { status: string; period_end: string | null } | null;
  comp: { until: string | null } | null;
};

/**
 * Which of several accounts holds the purchase the cancel page should show.
 *
 * A buyer can pay under one account and sign in under another: the funnel
 * sells to the anonymous account a browser holds, and puts the address on it
 * after payment (`revenuecat-webhook`, claimEmail). When that address already
 * belonged to another account (the app, an earlier visit), or the browser
 * still holds the old anonymous session, the code on the cancel page signs
 * her in to an account with no purchase on it. `web-account` therefore also
 * looks at the accounts whose funnel lead carries the same verified address.
 *
 * The first view is the caller's own: it wins outright while it is open, and
 * every tie. Otherwise: open access first, then any purchase at all
 * (cancelled, refunded or expired, so the page can say so), then the latest
 * `period_end`.
 */
export function bestPurchase(views: PurchaseView[], now: Date = new Date()): PurchaseView | null {
  if (views.length === 0) return null;
  const rank = (v: PurchaseView) => (hasAccess(v.comp, v.customer, now) ? 2 : v.customer != null ? 1 : 0);
  const end = (v: PurchaseView) => {
    const t = Date.parse(v.customer?.period_end ?? '');
    return Number.isNaN(t) ? 0 : t;
  };
  let best = views[0]!;
  if (rank(best) === 2) return best;
  for (const v of views.slice(1)) {
    if (rank(v) > rank(best) || (rank(v) === rank(best) && rank(v) > 0 && end(v) > end(best))) best = v;
  }
  return best;
}

/** Live statuses: the plan is open until `period_end`. */
const OPEN: ReadonlySet<string> = new Set(['intro', 'active', 'cancelled', 'billing_issue']);

/**
 * Whether the account may use the paid plan now: any `comp_access` row still
 * running (the web's own, or a founder's), or a web purchase RevenueCat still
 * counts as open.
 */
export function hasAccess(
  comp: { until: string | null } | null,
  customer: { status: string; period_end: string | null } | null,
  now: Date = new Date(),
): boolean {
  if (comp != null && (comp.until == null || Date.parse(comp.until) > now.getTime())) return true;
  return customer != null && OPEN.has(customer.status) && customer.period_end != null && Date.parse(customer.period_end) > now.getTime();
}

