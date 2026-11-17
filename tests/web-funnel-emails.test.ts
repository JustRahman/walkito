import { describe, expect, test } from 'bun:test';

import { composeWebMessage, personalSender, type WebMailConfig } from '../supabase/functions/_shared/web/compose.ts';
import {
  DESCRIPTOR,
  GUARANTEE,
  abandon1Email,
  abandon2Email,
  cancelUrl,
  day3Email,
  emailFor,
  morningEmail,
  planUrl,
  renewalNoticeEmail,
  welcomeEmail,
  type WebEmail,
} from '../supabase/functions/_shared/web/emails.ts';
import { WEB_PRODUCTS } from '../supabase/functions/_shared/web/products.ts';
import { sampleWebEmails } from '../supabase/functions/_shared/web/samples.ts';
import type { WebPerson } from '../supabase/functions/_shared/web/sequence.ts';
import { verifyUnsubscribeToken } from '../supabase/functions/_shared/email/links.ts';

/**
 * The funnel's emails: the words (dates, amounts, links, the rules every
 * Walkito email keeps) and the message Resend receives.
 */

const BASE = 'https://start.walkito.site';
const NY = 'America/New_York';
const monthly = WEB_PRODUCTS.web_monthly_intro;
const quarter = WEB_PRODUCTS.web_quarter;
/** Sunday 22 November 2026, 17:00 in New York. */
const SUNDAY = '2026-11-22T22:00:00.000Z';

const CONFIG: WebMailConfig = {
  from: 'walkito <hello@walkito.site>',
  personalFrom: personalSender('walkito <hello@walkito.site>'),
  replyTo: 'hello@walkito.site',
  postalAddress: '30 N Gould St, Sheridan, WY 82801',
  linkBase: 'https://walkito.site',
  functionsBase: 'https://example.supabase.co/functions/v1',
  unsubscribeSecret: 'test-secret-with-some-length',
};
const USER = '6f1c1d52-3a2b-4c8d-9e0f-1a2b3c4d5e6f';

function words(e: WebEmail): string[] {
  return [e.subject, e.preheader, e.greeting ?? '', ...e.paragraphs, e.button?.label ?? '', ...e.after, e.ps ?? '', e.footerWhy];
}

/** Every email and every variant a person can get. */
function everything(): WebEmail[] {
  return [
    welcomeEmail({ product: monthly, nextChargeAt: SUNDAY, zone: NY, base: BASE }),
    welcomeEmail({ product: quarter, nextChargeAt: SUNDAY, zone: NY, base: BASE }),
    welcomeEmail({ product: monthly, nextChargeAt: null, endsAt: SUNDAY, zone: NY, base: BASE }),
    welcomeEmail({ product: monthly, nextChargeAt: null, zone: NY, base: BASE }),
    morningEmail({ base: BASE }),
    day3Email({ base: BASE }),
    renewalNoticeEmail({ product: monthly, renewalAt: SUNDAY, zone: NY, base: BASE }),
    renewalNoticeEmail({ product: quarter, renewalAt: SUNDAY, zone: NY, base: BASE }),
    abandon1Email({ base: BASE }),
    abandon2Email({ base: BASE }),
    ...sampleWebEmails(new Date('2026-11-16T12:00:00Z'), BASE).map((s) => s.email),
  ];
}

describe('the rules every funnel email keeps', () => {
  const all = everything();

  test('no dash as punctuation: no long dash, no spaced hyphen', () => {
    expect(all.flatMap(words).filter((t) => /[—–]| - /.test(t))).toEqual([]);
  });

  test('no condition words anywhere, and none in a subject a lock screen shows', () => {
    const condition = /plantar|fasci|heel|bunion|flat feet|arch|pain|ache|sore|injur|diabet|neuropath|arthrit|condition|symptom|diagnos/i;
    expect(all.map((e) => e.subject).filter((s) => condition.test(s))).toEqual([]);
    expect(all.flatMap(words).filter((t) => condition.test(t))).toEqual([]);
  });

  test('no diagnosis words and no hurry', () => {
    const banned = /\b(treat\w*|cure[sd]?|curing|fix\w*|heal(s|ed|ing)?|hurry|last chance|expires? soon|only today|discount|% off)\b/i;
    expect(all.flatMap(words).filter((t) => banned.test(t))).toEqual([]);
  });

  test('one button at most, and every link goes somewhere real', () => {
    for (const e of all) {
      if (e.button != null) expect(e.button.url).toMatch(/^https:\/\//);
      for (const t of words(e)) for (const m of t.matchAll(/\]\(([^)]+)\)/g)) expect(m[1]).toMatch(/^https:\/\//);
    }
  });
});

describe('web_welcome', () => {
  test('a receipt for the monthly plan: paid today, the next charge and its date, then every month', () => {
    const e = welcomeEmail({ product: monthly, nextChargeAt: SUNDAY, zone: NY, base: BASE });
    expect(e.subject).toBe('Your Walkito plan and receipt');
    expect(e.preheader).toBe('You paid $0.99 today. Your plan is ready when you are.');
    expect(e.paragraphs).toEqual([
      'Your plan is ready. It gives you short sessions you can do at home.',
      'Your plan: Walkito monthly',
      'Paid today: $0.99 for your first week',
      'Next charge: $9.99 on Sunday, November 22, 2026',
      'After that: $9.99 every month until you cancel',
    ]);
    expect(e.button).toEqual({ label: 'Open my plan', url: 'https://start.walkito.site/s/me?e=web_welcome' });
    expect(e.after.join(' ')).toContain('6-digit code');
    expect(e.after.join(' ')).toContain('[App Store or Google Play](https://walkito.onelink.me/2L97?pid=email&c=web_welcome)');
    expect(e.after).toContain('You can cancel any time here: [Cancel my plan](https://start.walkito.site/s/cancel?e=web_welcome).');
    expect(e.after).toContain(GUARANTEE);
    expect(e.after).toContain(DESCRIPTOR);
    expect(GUARANTEE).toBe('Not for you? Reply to any email within 14 days of a charge and we refund it.');
    expect(DESCRIPTOR).toContain('NEMY LLC');
  });

  test('a receipt for the 3-month plan', () => {
    const e = welcomeEmail({ product: quarter, nextChargeAt: '2027-02-14T15:00:00.000Z', zone: NY, base: BASE });
    expect(e.paragraphs.slice(1)).toEqual([
      'Your plan: Walkito, 3 months',
      'Paid today: $19.99 for 3 months',
      'Next charge: $19.99 on Sunday, February 14, 2027',
      'After that: $19.99 every 3 months until you cancel',
    ]);
  });

  test('a plan cancelled before the receipt went says there are no more charges', () => {
    const e = welcomeEmail({ product: monthly, nextChargeAt: null, endsAt: SUNDAY, zone: NY, base: BASE });
    expect(e.paragraphs.join(' ')).not.toContain('Next charge');
    expect(e.paragraphs).toContain('Your plan is open until Sunday, November 22, 2026. You cancelled it, so there are no more charges.');
  });

  test("dates are the buyer's own day", () => {
    // 03:00 UTC on the 23rd is still the evening of the 22nd in Los Angeles.
    const e = welcomeEmail({ product: monthly, nextChargeAt: '2026-11-23T03:00:00.000Z', zone: 'America/Los_Angeles', base: BASE });
    expect(e.paragraphs).toContain('Next charge: $9.99 on Sunday, November 22, 2026');
  });
});

describe('web_renewal_notice', () => {
  test('the monthly plan: the end of the first week, the amount, and how to stop', () => {
    const e = renewalNoticeEmail({ product: monthly, renewalAt: SUNDAY, zone: NY, base: BASE });
    expect(e.subject).toBe('Your first week ends Sunday, November 22');
    expect(e.paragraphs).toEqual([
      'Your first week of Walkito ends on Sunday, November 22, 2026.',
      'On that day, we will charge $9.99 to your card for the next month. After that, it is $9.99 every month until you cancel.',
      'Want to keep going? You do not need to do anything.',
      'Want to stop? Tap here to cancel: [Cancel my plan](https://start.walkito.site/s/cancel?e=web_renewal_notice). You can still use your plan until Sunday, November 22.',
    ]);
    expect(e.after).toEqual([GUARANTEE]);
  });

  test('the 3-month plan', () => {
    const e = renewalNoticeEmail({ product: quarter, renewalAt: SUNDAY, zone: NY, base: BASE });
    expect(e.subject).toBe('Your Walkito plan renews Sunday, November 22');
    expect(e.paragraphs.slice(0, 2)).toEqual([
      'Your 3 months of Walkito end on Sunday, November 22, 2026.',
      'On that day, we will charge $19.99 to your card for the next 3 months.',
    ]);
  });
});

describe('the others', () => {
  test('day 2 is one line and a button to today', () => {
    const e = morningEmail({ base: BASE });
    expect(e.paragraphs).toHaveLength(1);
    expect(e.button?.url).toBe(planUrl(BASE, 'web_morning'));
  });

  test('day 3 is a note from two people: no button, no mascot, their names', () => {
    const e = day3Email({ base: BASE });
    expect(e.personal).toBe(true);
    expect(e.button).toBeNull();
    expect(e.paragraphs.at(-1)).toBe('Rahim, Walkito');
  });

  test('the abandoned-checkout emails offer nothing and hurry nobody', () => {
    for (const e of [abandon1Email({ base: BASE }), abandon2Email({ base: BASE })]) {
      expect(words(e).join(' ')).not.toMatch(/\$|%|today only|only \w+ left|\d+ left|soon|deal|offer|expire/i);
      expect(e.button?.label).toBe('See my plan');
    }
    expect(cancelUrl('https://start.walkito.site/', 'web_abandon_1')).toBe('https://start.walkito.site/s/cancel?e=web_abandon_1');
  });
});

describe('a decision becomes an email', () => {
  const buyer = (customer: Partial<NonNullable<WebPerson['customer']>>): WebPerson => ({
    userId: USER,
    email: 'sam@example.com',
    zone: NY,
    unsubscribed: false,
    checkoutOpenedAt: null,
    customer: { productId: 'web_monthly_intro', status: 'intro', periodEnd: SUNDAY, introEndsAt: SUNDAY, firstPurchaseAt: '2026-11-15T22:00:00.000Z', ...customer },
    log: [],
  });

  test('the welcome quotes the first full charge from the plan itself', () => {
    const e = emailFor({ kind: 'web_welcome', logKey: 'web_welcome', renewalAt: null }, buyer({}), BASE);
    expect('held' in e ? e.held : e.paragraphs).toContain('Next charge: $9.99 on Sunday, November 22, 2026');
  });

  test('a cancelled plan gets a receipt without a next charge', () => {
    const e = emailFor({ kind: 'web_welcome', logKey: 'web_welcome', renewalAt: null }, buyer({ status: 'cancelled' }), BASE);
    expect('held' in e ? e.held : e.paragraphs.join(' ')).toContain('no more charges');
  });

  test('a product the catalog does not know is held, never guessed', () => {
    const e = emailFor({ kind: 'web_welcome', logKey: 'web_welcome', renewalAt: null }, buyer({ productId: 'web_monthly_499' }), BASE);
    expect(e).toEqual({ held: 'no catalog entry for web_monthly_499' });
  });
});

describe('the message Resend receives', () => {
  test('the welcome: the button, the small print after it, the footer and one-click unsubscribe', async () => {
    const email = welcomeEmail({ product: monthly, nextChargeAt: SUNDAY, zone: NY, base: BASE });
    const m = await composeWebMessage(email, { userId: USER, email: 'sam@example.com' }, CONFIG);
    expect(m.from).toBe('walkito <hello@walkito.site>');
    expect(m.to).toEqual(['sam@example.com']);
    expect(m.reply_to).toBe('hello@walkito.site');
    expect(m.subject).toBe('Your Walkito plan and receipt');
    expect(m.html).toContain('https://start.walkito.site/s/me?e=web_welcome');
    expect(m.html).toContain('https://walkito.site/email/mascot.png');
    expect(m.html).toContain('Paid today: $0.99 for your first week');
    expect(m.html.indexOf('Open my plan')).toBeLessThan(m.html.indexOf('Not for you?'));
    expect(m.html).toContain('https://walkito.site/unsubscribe/?t=');
    expect(m.html).toContain('30 n gould st, sheridan, wy 82801');
    expect(m.html).toContain('billing emails like this one come even if you unsubscribe');
    expect(m.html).not.toContain('email settings');
    expect(m.text).toContain('Next charge: $9.99 on Sunday, November 22, 2026');
    expect(m.headers['List-Unsubscribe']).toMatch(/^<https:\/\/example\.supabase\.co\/functions\/v1\/email-unsubscribe\?t=.+>$/);
    expect(m.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(m.tags).toEqual([
      { name: 'email_key', value: 'web_welcome' },
      { name: 'funnel', value: 'web' },
    ]);
    const token = decodeURIComponent(/unsubscribe\/\?t=([^&"]+)/.exec(m.html)?.[1] ?? '');
    expect(await verifyUnsubscribeToken(token, CONFIG.unsubscribeSecret)).toBe(USER);
  });

  test('day 3 comes from Rahim, with no mascot and no button', async () => {
    const m = await composeWebMessage(day3Email({ base: BASE }), { userId: USER, email: 'sam@example.com' }, CONFIG);
    expect(m.from).toBe('Rahim from Walkito <hello@walkito.site>');
    expect(m.reply_to).toBe('hello@walkito.site');
    expect(m.html).not.toContain('mascot.png');
    expect(m.html).toContain('Rahim, Walkito');
    expect(m.html).toContain('https://walkito.site/unsubscribe/?t=');
  });

  test('without a postal address, the line is left out', async () => {
    const m = await composeWebMessage(abandon1Email({ base: BASE }), { userId: USER, email: 'sam@example.com' }, { ...CONFIG, postalAddress: '' });
    expect(m.html).not.toContain('walkito · ');
    expect(m.html).toContain("you&#x27;re getting this because you made a walkito plan at start.walkito.site.");
  });
});

describe('samples', () => {
  test('every email, both plans where they differ', () => {
    expect(sampleWebEmails(new Date('2026-11-16T12:00:00Z'), BASE).map((s) => s.name)).toEqual([
      'web_welcome',
      'web_welcome_quarter',
      'web_morning',
      'web_day3',
      'web_renewal_notice',
      'web_renewal_notice_quarter',
      'web_abandon_1',
      'web_abandon_2',
    ]);
  });
});

describe('the one-time offer: first year $29.99, then $49.99', () => {
  const offer = WEB_PRODUCTS.web_yearly_2999;

  test('is in the catalog at the amounts the offer card shows', () => {
    expect(offer?.intro).toEqual({ amount: 29.99, days: 365 });
    expect(offer?.amount).toBe(49.99);
    expect(offer?.months).toBe(12);
  });

  test('its renewal notice names the first year and the $49.99 that follows', () => {
    const e = renewalNoticeEmail({ product: offer!, renewalAt: '2027-11-16T15:00:00Z', zone: NY, base: BASE });
    expect(e.subject).toBe('Your first year ends Tuesday, November 16');
    expect(e.paragraphs[0]).toBe('Your first year of Walkito ends on Tuesday, November 16, 2027.');
    expect(e.paragraphs[1]).toContain('$49.99');
  });
});
