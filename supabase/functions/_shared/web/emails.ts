import { firstCharge, money, webProduct, type WebProduct } from './products.ts';
import { wakeMinutes, type WebDecision, type WebEmailKey, type WebPerson } from './sequence.ts';

/**
 * The words of every funnel email, in English.
 *
 * Plain US English at about a grade-6 reading level, for a reader who may be
 * 60 and found us on Facebook last night: short sentences, real dates, real
 * amounts, one button. Calm and honest: no countdowns, no discounts, no
 * "last chance", nothing that hurries. No condition words anywhere, subjects
 * least of all, because a subject shows on a lock screen. No dash as
 * punctuation (a plain hyphen inside a word is fine), as everywhere Walkito
 * writes. `tests/web-funnel-emails.test.ts` checks these rules on every
 * email and variant.
 *
 * Unlike the app's emails, these are in sentence case: the welcome and the
 * renewal notice are receipts and billing notices, and a capital at the start
 * of a sentence reads more easily to the people they are for. The footer is
 * the shared template's, lowercase like every other Walkito email.
 *
 * Amounts come from the product catalog (`products.ts`), the same numbers
 * the price page and the consent box showed. Dates are the buyer's own day,
 * in their time zone.
 */

export type WebEmail = {
  kind: WebEmailKey;
  subject: string;
  /** The line an inbox shows after the subject. */
  preheader: string;
  greeting: string | null;
  paragraphs: string[];
  button: { label: string; url: string } | null;
  /** Paragraphs after the button. */
  after: string[];
  ps: string | null;
  /** The day-3 note: from two people, no mascot, no button. */
  personal: boolean;
  footerWhy: string;
};

export const GUARANTEE = 'Not for you? Reply to any email within 14 days of a charge and we refund it.';
export const DESCRIPTOR = 'Your card statement will show NEMY WALKITO. NEMY LLC is the company behind Walkito.';
const REPLY = 'Questions? Just reply. A real person reads every email.';

/** The OneLink that opens the App Store or Google Play, tagged with the email it came from. */
export function appUrl(key: WebEmailKey): string {
  return `https://walkito.onelink.me/2L97?pid=email&c=${key}`;
}

/** The funnel's `/s/me`: sign in with the email code, then the plan and today's session. */
export function planUrl(base: string, key: WebEmailKey): string {
  return `${trim(base)}/s/me?e=${key}`;
}

/** The funnel's price page, where she left: her plan and the plans to pick from, on the browser she used. */
export function priceUrl(base: string, key: WebEmailKey): string {
  return `${trim(base)}/s/18?e=${key}`;
}

/** The funnel's cancel page. */
export function cancelUrl(base: string, key: WebEmailKey): string {
  return `${trim(base)}/s/cancel?e=${key}`;
}

function trim(url: string): string {
  return url.replace(/\/+$/, '');
}

function hostOf(base: string): string {
  try {
    return new URL(base).host;
  } catch {
    return 'walkito.site';
  }
}

/** `Sunday, November 22, 2026`, on the buyer's own calendar. */
export function longDate(iso: string, zone: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: zone }).format(new Date(iso));
}

/** `Sunday, November 22`. */
export function shortDate(iso: string, zone: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: zone }).format(new Date(iso));
}

/** `month`, `3 months` or `year`. */
function span(months: number): string {
  return months === 1 ? 'month' : months === 12 ? 'year' : `${months} months`;
}

/** `every month`, `every 3 months` or `every year`. */
function every(months: number): string {
  return months === 1 ? 'every month' : months === 12 ? 'every year' : `every ${months} months`;
}

/** `first week`, `first month` or `first 14 days`. */
function firstPeriod(days: number): string {
  if (days === 7) return 'first week';
  if (days >= 28 && days <= 31) return 'first month';
  if (days >= 365 && days <= 366) return 'first year';
  return `first ${days} days`;
}

function buyerFooter(base: string, billing: boolean): string {
  const why = `you're getting this because you have a walkito plan from ${hostOf(base)}.`;
  return billing ? `${why} billing emails like this one come even if you unsubscribe.` : why;
}

/**
 * The receipt, right after the first purchase. `nextChargeAt` is the first
 * full charge (the end of the first week, or of the first 3 months);
 * `endsAt` is set instead when the plan was already cancelled and will not
 * charge again.
 */
export function welcomeEmail(input: { product: WebProduct; nextChargeAt: string | null; endsAt?: string | null; zone: string; base: string }): WebEmail {
  const p = input.product;
  const today = money(firstCharge(p), p.currency);
  const regular = money(p.amount, p.currency);
  const receipt = [
    `Your plan: ${p.name}`,
    p.intro != null ? `Paid today: ${today} for your ${firstPeriod(p.intro.days)}` : `Paid today: ${today} for ${span(p.months)}`,
  ];
  if (input.nextChargeAt != null) {
    receipt.push(`Next charge: ${regular} on ${longDate(input.nextChargeAt, input.zone)}`);
    receipt.push(`After that: ${regular} ${every(p.months)} until you cancel`);
  } else if (input.endsAt != null) {
    receipt.push(`Your plan is open until ${longDate(input.endsAt, input.zone)}. You cancelled it, so there are no more charges.`);
  } else {
    receipt.push(`Then: ${regular} ${every(p.months)} until you cancel`);
  }
  return {
    kind: 'web_welcome',
    subject: 'Your Walkito plan and receipt',
    preheader: `You paid ${today} today. Your plan is ready when you are.`,
    greeting: 'Thank you for joining Walkito.',
    paragraphs: ['Your plan is ready. It gives you short sessions you can do at home.', ...receipt],
    button: { label: 'Open my plan', url: planUrl(input.base, 'web_welcome') },
    after: [
      'To open it, enter this email address. We will send you a 6-digit code. You do not need a password.',
      `Want the app too? Get Walkito on the [App Store or Google Play](${appUrl('web_welcome')}). Sign in there with this same email address. The app is part of your plan.`,
      `You can cancel any time here: [Cancel my plan](${cancelUrl(input.base, 'web_welcome')}).`,
      GUARANTEE,
      DESCRIPTOR,
    ],
    ps: REPLY,
    personal: false,
    footerWhy: buyerFooter(input.base, true),
  };
}

/**
 * Day 2, the next morning. With her wake time it goes then, and it is her
 * first-step routine: three moves sitting up in bed, before her first step.
 */
export function morningEmail(input: { base: string; firstStep?: boolean }): WebEmail {
  if (input.firstStep === true)
    return {
      kind: 'web_morning',
      subject: 'Before your first step',
      preheader: '2 minutes in bed, 3 moves.',
      greeting: null,
      paragraphs: [
        'Good morning. Before you get out of bed, your first-step routine is ready.',
        'Three moves, about 2 minutes, sitting up in bed or on its edge.',
      ],
      button: { label: 'Open my first-step routine', url: appUrl('web_morning') },
      after: [`No app yet? [Open your plan in your browser](${planUrl(input.base, 'web_morning')}).`],
      ps: null,
      personal: false,
      footerWhy: buyerFooter(input.base, false),
    };
  return {
    kind: 'web_morning',
    subject: 'Good morning. Day 2 is ready.',
    preheader: 'A few minutes, whenever you are ready.',
    greeting: null,
    paragraphs: ['Day 2 of your plan is ready. It takes just a few minutes.'],
    button: { label: "Start today's session", url: planUrl(input.base, 'web_morning') },
    after: [],
    ps: null,
    personal: false,
    footerWhy: buyerFooter(input.base, false),
  };
}

/** Day 3: a note from Rahim. Replies reach a person. */
export function day3Email(input: { base: string }): WebEmail {
  return {
    kind: 'web_day3',
    subject: 'How is it going?',
    preheader: 'A quick question from Rahim.',
    greeting: null,
    paragraphs: [
      'Hi there,',
      'You started Walkito a couple of days ago, and we wanted to check in.',
      'How do your feet feel after the sessions so far? Is anything hard or unclear?',
      'Just hit reply and tell us. Even one line helps. We read every reply ourselves.',
      'Rahim, Walkito',
    ],
    button: null,
    after: [],
    ps: null,
    personal: true,
    footerWhy: buyerFooter(input.base, false),
  };
}

/**
 * Two days before a charge: the date, the amount, and how to stop it.
 * `intro` is the step from the first week's price to the monthly one.
 */
export function renewalNoticeEmail(input: {
  product: WebProduct;
  renewalAt: string;
  zone: string;
  base: string;
  /** This charge ends the paid first period. Defaults to true for a product that has one. */
  introEnds?: boolean;
}): WebEmail {
  const p = input.product;
  const amount = money(p.amount, p.currency);
  const date = longDate(input.renewalAt, input.zone);
  const short = shortDate(input.renewalAt, input.zone);
  const intro = p.intro != null && (input.introEnds ?? true);
  const first = intro
    ? p.intro!.days === 7
      ? `Your first week of Walkito ends on ${date}.`
      : firstPeriod(p.intro!.days) === 'first month'
        ? `Your first month of Walkito ends on ${date}.`
        : firstPeriod(p.intro!.days) === 'first year'
          ? `Your first year of Walkito ends on ${date}.`
          : `Your first ${p.intro!.days} days of Walkito end on ${date}.`
    : p.months === 1
      ? `Your month of Walkito ends on ${date}.`
      : p.months === 12
        ? `Your year of Walkito ends on ${date}.`
        : `Your ${p.months} months of Walkito end on ${date}.`;
  const charge = intro
    ? `On that day, we will charge ${amount} to your card for the next ${span(p.months)}. After that, it is ${amount} ${every(p.months)} until you cancel.`
    : `On that day, we will charge ${amount} to your card for the next ${span(p.months)}.`;
  return {
    kind: 'web_renewal_notice',
    subject: intro ? `Your ${firstPeriod(p.intro!.days)} ends ${short}` : `Your Walkito plan renews ${short}`,
    preheader: intro
      ? `Then it is ${amount} ${every(p.months)}. You can cancel any time.`
      : `${amount} for the next ${span(p.months)}. You can cancel any time.`,
    greeting: null,
    paragraphs: [
      first,
      charge,
      'Want to keep going? You do not need to do anything.',
      `Want to stop? Tap here to cancel: [Cancel my plan](${cancelUrl(input.base, 'web_renewal_notice')}). You can still use your plan until ${short}.`,
    ],
    button: { label: 'Open my plan', url: planUrl(input.base, 'web_renewal_notice') },
    after: [GUARANTEE],
    ps: null,
    personal: false,
    footerWhy: buyerFooter(input.base, true),
  };
}

function leadFooter(base: string): string {
  return `you're getting this because you made a walkito plan at ${hostOf(base)}.`;
}

/**
 * Her plan in words with no condition in them (the email rules: an inbox
 * preview and a lock screen are not the place). Only what she agreed we keep.
 */
const PLAN_FOCUS: Readonly<Record<string, string>> = {
  heel: 'easier first steps',
  steady: 'feeling steadier',
  flat: 'stronger feet',
  allday: 'feet that last all day',
  moving: 'feet that keep moving',
};

export function planLines(plan: { focus: string | null; minutes: number | null } | null | undefined): [string, string] {
  const focus = plan?.focus != null ? PLAN_FOCUS[plan.focus] : undefined;
  const minutes = plan?.minutes != null && [3, 5, 10].includes(plan.minutes) ? `${plan.minutes} minutes a day` : 'a few minutes a day';
  return [`focus: ${focus ?? 'your feet, step by step'}`, minutes];
}

const MONEY_BACK = '14-day money-back: not for you? reply to any email within 14 days of a charge and we refund it.';

/**
 * About an hour after she left the price page (or closed checkout) without
 * buying. Lowercase and friendly, like the welcome email; her plan in two
 * lines, one button back to it.
 */
export function abandon1Email(input: { base: string; plan?: { focus: string | null; minutes: number | null } | null }): WebEmail {
  const [focus, minutes] = planLines(input.plan);
  return {
    kind: 'web_abandon_1',
    subject: 'your walkito plan is saved',
    preheader: "it's ready whenever you are.",
    greeting: null,
    paragraphs: ["we saved the plan you made. here it is:", focus, minutes],
    button: { label: 'see my plan', url: priceUrl(input.base, 'web_abandon_1') },
    after: [MONEY_BACK, 'questions? just reply. a real person reads every email.'],
    ps: null,
    personal: false,
    footerWhy: leadFooter(input.base),
  };
}

/** About a day later. The last one: after it, nothing. */
export function abandon2Email(input: { base: string; plan?: { focus: string | null; minutes: number | null } | null }): WebEmail {
  const [focus, minutes] = planLines(input.plan);
  return {
    kind: 'web_abandon_2',
    subject: 'your walkito plan is saved',
    preheader: 'still here, whenever you are ready.',
    greeting: null,
    paragraphs: ['your plan is still saved for you:', focus, minutes],
    button: { label: 'see my plan', url: priceUrl(input.base, 'web_abandon_2') },
    after: [MONEY_BACK, "this is the last email about it. questions? just reply."],
    ps: null,
    personal: false,
    footerWhy: leadFooter(input.base),
  };
}

/**
 * The email a decision stands for, filled in from the person's own plan. An
 * email that would have to guess an amount (a product missing from the
 * catalog) is held instead, with the reason.
 */
export function emailFor(decision: WebDecision, person: WebPerson, base: string): WebEmail | { held: string } {
  const c = person.customer;
  switch (decision.kind) {
    case 'web_welcome': {
      const product = webProduct(c?.productId);
      if (c == null || product == null) return { held: `no catalog entry for ${c?.productId ?? 'no product'}` };
      const renews = c.status === 'intro' || c.status === 'active' || c.status === 'billing_issue';
      const firstFull = product.intro != null ? (c.introEndsAt ?? c.periodEnd) : c.periodEnd;
      return welcomeEmail({
        product,
        nextChargeAt: renews ? firstFull : null,
        endsAt: c.status === 'cancelled' ? c.periodEnd : null,
        zone: person.zone,
        base,
      });
    }
    case 'web_renewal_notice': {
      const product = webProduct(c?.productId);
      if (product == null || decision.renewalAt == null) return { held: `no catalog entry for ${c?.productId ?? 'no product'}` };
      const introEnds = c?.status === 'intro' && c.introEndsAt === decision.renewalAt;
      return renewalNoticeEmail({ product, renewalAt: decision.renewalAt, zone: person.zone, base, introEnds });
    }
    case 'web_morning':
      return morningEmail({ base, firstStep: wakeMinutes(person.wakeTime) != null });
    case 'web_day3':
      return day3Email({ base });
    case 'web_abandon_1':
      return abandon1Email({ base, plan: person.plan });
    case 'web_abandon_2':
      return abandon2Email({ base, plan: person.plan });
  }
}
