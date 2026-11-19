import { addDays, localTime } from '../email/time.ts';
import type { WebStatus } from './customer.ts';
import { webProduct, type WebProduct } from './products.ts';

/**
 * Which funnel email, if any, one person gets on this run.
 *
 * Pure: the person and the clock go in, a decision and the reason each other
 * email was passed over come out, so every timing rule is tested without a
 * database or a mail server (`tests/web-funnel-sequence.test.ts`). The
 * `web-email` function runs it every 15 minutes for everyone who could be
 * due, and once more right after a purchase for the welcome.
 *
 * For buyers:
 *
 * - `web_welcome`: the receipt, right after the first purchase (the webhook
 *   asks for it at once; a run catches one it missed, for a day).
 * - `web_morning`: the next local morning, 08:00 to 12:00, or, when the funnel
 *   has her wake time (`web_leads.wake_time`), from that time to two hours
 *   after it: her first-step routine, before she gets out of bed. A purchase
 *   made before 04:00 belongs to the evening before it, so a 01:30 buyer
 *   hears from us that same morning, not 30 hours later.
 * - `web_day3`: two days after that day, 10:00 to 14:00, from two people.
 * - `web_renewal_notice`: on the local day two days before the charge,
 *   09:00 to 21:00 (or the day after, if a run missed it, while the charge is
 *   still 12 hours away). For the monthly plan only the step from the first
 *   month to $9.99 is announced; for the yearly plans and the 3-month plan,
 *   every renewal, the $29.99 year's step to $49.99 included. Never for a plan
 *   that will not renew.
 *
 * For people with an address who reached the price page (or opened
 * checkout, or asked for the plan by email) and did not buy (no
 * `web_customers` row). The clock starts at the latest of those moments:
 *
 * - `web_abandon_1`: about an hour later (1 to 3 hours), never between
 *   22:00 and 08:00.
 * - `web_abandon_2`: about a day later (24 to 36 hours), never between
 *   22:00 and 08:00. The last one: after it, nothing.
 *
 * Both stop the moment she pays (she has a `web_customers` row), after an
 * unsubscribe, and once each has gone.
 *
 * The welcome and the renewal notice are billing emails: they go even after
 * an unsubscribe, because the price page promised them. The others are not,
 * and each waits at least 3 hours after any other email and goes no more than
 * one a local day. Each email goes once (`web_email_log`, keyed by user and
 * key; the renewal notice's key carries the renewal's date). Times are the
 * buyer's own: the time zone the funnel stored in `utm.tz`, else New York.
 */

export type WebEmailKey = 'web_welcome' | 'web_morning' | 'web_day3' | 'web_renewal_notice' | 'web_abandon_1' | 'web_abandon_2';

export const WEB_EMAIL_KEYS: readonly WebEmailKey[] = [
  'web_welcome',
  'web_morning',
  'web_day3',
  'web_renewal_notice',
  'web_abandon_1',
  'web_abandon_2',
];

/** Billing emails: sent even after an unsubscribe. */
export const BILLING: ReadonlySet<WebEmailKey> = new Set(['web_welcome', 'web_renewal_notice']);

export const DEFAULT_ZONE = 'America/New_York';

const HOUR_MS = 3_600_000;
/** Before this local hour, an instant belongs to the day before it. */
const NIGHT_ENDS = 4;
const WELCOME_WITHIN_HOURS = 24;
/** Windows are minutes of the local day. */
const MORNING = { from: 8 * 60, to: 12 * 60 };
const DAY3 = { from: 10 * 60, to: 14 * 60 };
/** The first-step email: from her wake time to two hours after it. */
const WAKE_WINDOW_MINUTES = 120;
const NOTICE = { from: 9, to: 21 };
/** A notice that cannot reach the buyer this long before the charge is no notice. */
const NOTICE_MIN_HOURS_BEFORE = 12;
const ABANDON_1_HOURS = { from: 1, to: 3 };
const ABANDON_2_HOURS = { from: 24, to: 36 };
/** No abandoned-checkout email between these local hours. */
const ABANDON_QUIET = { from: 22, to: 8 };
/** After any email, the next non-billing one waits this long. */
const GAP_HOURS = 3;

export type WebCustomer = {
  productId: string;
  status: WebStatus;
  periodEnd: string | null;
  introEndsAt: string | null;
  firstPurchaseAt: string | null;
};

export type WebLogRow = { key: string; sentAt: string; status: 'sending' | 'sent' | 'failed' };

export type WebPerson = {
  userId: string;
  email: string | null;
  /** An IANA zone, already checked (`zoneOf`). */
  zone: string;
  unsubscribed: boolean;
  checkoutOpenedAt: string | null;
  /** She reached the price page. */
  priceViewedAt?: string | null;
  /** "I want to think about it" on the price page. */
  planEmailRequestedAt?: string | null;
  /** When she usually gets up, "HH:MM" in her zone; the morning email goes then. */
  wakeTime?: string | null;
  /** Her plan, as the funnel saved it (only with her consent to keep her answers). */
  plan?: { focus: string | null; minutes: number | null } | null;
  customer: WebCustomer | null;
  log: WebLogRow[];
};

export type WebDecision = {
  kind: WebEmailKey;
  /** The `web_email_log` key: the email's own, or with the renewal's date. */
  logKey: string;
  /** The charge a renewal notice announces. */
  renewalAt: string | null;
};

export type WebEvaluation = {
  decision: WebDecision | null;
  skipped: { kind: WebEmailKey; reason: string }[];
  /** Why nothing was even considered. */
  blocked: string | null;
};

/** The zone the funnel stored as `utm.tz`, when it is a real one. */
export function zoneOf(utm: unknown): string {
  const tz = typeof utm === 'object' && utm != null ? (utm as Record<string, unknown>).tz : null;
  if (typeof tz !== 'string' || tz.length === 0 || tz.length > 64) return DEFAULT_ZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_ZONE;
  }
}

/** The local day an instant belongs to, with the small hours counted as the night before. */
export function dayOf(iso: string, zone: string): string {
  const local = localTime(new Date(iso), zone);
  return local.hour < NIGHT_ENDS ? addDays(local.date, -1) : local.date;
}

/** The charge a renewal notice would announce, or null when there is none to announce. */
export function renewalOf(customer: WebCustomer): { at: string; product: WebProduct } | null {
  const product = webProduct(customer.productId);
  if (product == null) return null;
  if (customer.status !== 'intro' && customer.status !== 'active') return null;
  if (customer.status === 'intro' && customer.introEndsAt != null) return { at: customer.introEndsAt, product };
  return product.notice === 'every' && customer.periodEnd != null ? { at: customer.periodEnd, product } : null;
}

const hoursSince = (iso: string, now: Date) => (now.getTime() - Date.parse(iso)) / HOUR_MS;
const within = (hour: number, w: { from: number; to: number }) => hour >= w.from && hour < w.to;
const clock = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;

/** Her wake time as minutes of the day, or null when there is none or it is not "HH:MM". */
export function wakeMinutes(wake: string | null | undefined): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(wake ?? '');
  return m == null ? null : Number(m[1]) * 60 + Number(m[2]);
}

export function nextWebEmail(p: WebPerson, now: Date): WebEvaluation {
  const skipped: WebEvaluation['skipped'] = [];
  const none = (blocked: string | null = null): WebEvaluation => ({ decision: null, skipped, blocked });
  const decide = (kind: WebEmailKey, logKey: string = kind, renewalAt: string | null = null): WebEvaluation => ({
    decision: { kind, logKey, renewalAt },
    skipped,
    blocked: null,
  });
  if (p.email == null) return none('no email address');

  const local = localTime(now, p.zone);
  const logged = new Set(p.log.map((row) => row.key));
  const sends = p.log.filter((row) => row.status !== 'failed');
  const lastSentHours = sends.length > 0 ? Math.min(...sends.map((row) => hoursSince(row.sentAt, now))) : Number.POSITIVE_INFINITY;
  const emailedToday = sends.some(
    (row) => !BILLING.has(row.key.split(':')[0] as WebEmailKey) && localTime(new Date(row.sentAt), p.zone).date === local.date,
  );

  /** The checks every non-billing email shares; a reason when it may not go now. */
  const minuteOfDay = local.hour * 60 + local.minute;
  const held = (kind: WebEmailKey, day: string, window: { from: number; to: number }): string | null => {
    if (logged.has(kind)) return 'already sent';
    if (p.unsubscribed) return 'unsubscribed';
    if (local.date !== day) return local.date < day ? 'not yet' : 'its day has passed';
    if (!within(minuteOfDay, window)) return `outside ${clock(window.from)}-${clock(window.to)} local`;
    if (emailedToday) return 'already emailed today';
    if (lastSentHours < GAP_HOURS) return 'another email went out less than 3 hours ago';
    return null;
  };

  const c = p.customer;
  if (c != null) {
    const live = c.status !== 'expired' && c.status !== 'refunded';

    if (logged.has('web_welcome')) skipped.push({ kind: 'web_welcome', reason: 'already sent' });
    else if (!live) skipped.push({ kind: 'web_welcome', reason: `plan ${c.status}` });
    else if (c.firstPurchaseAt == null || hoursSince(c.firstPurchaseAt, now) > WELCOME_WITHIN_HOURS)
      skipped.push({ kind: 'web_welcome', reason: 'purchase is more than a day old' });
    else return decide('web_welcome');

    const renewal = renewalOf(c);
    if (renewal == null) {
      const reason = webProduct(c.productId) == null ? `no catalog entry for ${c.productId}` : 'no renewal to announce';
      skipped.push({ kind: 'web_renewal_notice', reason });
    } else {
      const logKey = `web_renewal_notice:${renewal.at.slice(0, 10)}`;
      const noticeDay = addDays(localTime(new Date(renewal.at), p.zone).date, -2);
      const hoursLeft = -hoursSince(renewal.at, now);
      if (logged.has(logKey)) skipped.push({ kind: 'web_renewal_notice', reason: 'already sent' });
      else if (local.date < noticeDay) skipped.push({ kind: 'web_renewal_notice', reason: 'not yet' });
      else if (hoursLeft < NOTICE_MIN_HOURS_BEFORE) skipped.push({ kind: 'web_renewal_notice', reason: 'too close to the charge' });
      else if (!within(local.hour, NOTICE)) skipped.push({ kind: 'web_renewal_notice', reason: 'outside 9:00-21:00 local' });
      else return decide('web_renewal_notice', logKey, renewal.at);
    }

    if (c.firstPurchaseAt == null || !live) {
      const reason = live ? 'no purchase date' : `plan ${c.status}`;
      skipped.push({ kind: 'web_morning', reason }, { kind: 'web_day3', reason });
      return none();
    }
    const day1 = dayOf(c.firstPurchaseAt, p.zone);
    const wake = wakeMinutes(p.wakeTime);
    const morningWindow = wake == null ? MORNING : { from: wake, to: Math.min(wake + WAKE_WINDOW_MINUTES, 24 * 60) };
    const morning = held('web_morning', addDays(day1, 1), morningWindow);
    if (morning == null) return decide('web_morning');
    skipped.push({ kind: 'web_morning', reason: morning });
    const day3 = held('web_day3', addDays(day1, 2), DAY3);
    if (day3 == null) return decide('web_day3');
    skipped.push({ kind: 'web_day3', reason: day3 });
    return none();
  }

  const left = latestOf(p.checkoutOpenedAt, p.priceViewedAt ?? null, p.planEmailRequestedAt ?? null);
  if (left == null) return none('never reached the price page');
  const since = hoursSince(left, now);
  const quiet = local.hour >= ABANDON_QUIET.from || local.hour < ABANDON_QUIET.to;
  const abandon = (kind: WebEmailKey, hours: { from: number; to: number }): string | null => {
    if (logged.has(kind)) return 'already sent';
    if (p.unsubscribed) return 'unsubscribed';
    if (since < hours.from) return 'not yet';
    if (since >= hours.to) return 'its window has passed';
    if (quiet) return 'night time';
    if (lastSentHours < GAP_HOURS) return 'another email went out less than 3 hours ago';
    return null;
  };
  const first = abandon('web_abandon_1', ABANDON_1_HOURS);
  if (first == null) return decide('web_abandon_1');
  skipped.push({ kind: 'web_abandon_1', reason: first });
  const second = abandon('web_abandon_2', ABANDON_2_HOURS);
  if (second == null) return decide('web_abandon_2');
  skipped.push({ kind: 'web_abandon_2', reason: second });
  return none();
}

/** The latest of some instants; missing ones are skipped. */
function latestOf(...values: (string | null)[]): string | null {
  let best: string | null = null;
  for (const v of values) if (v != null && !Number.isNaN(Date.parse(v)) && (best == null || Date.parse(v) > Date.parse(best))) best = v;
  return best;
}
