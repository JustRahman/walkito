import { abandon1Email, abandon2Email, day3Email, morningEmail, renewalNoticeEmail, welcomeEmail, type WebEmail } from './emails.ts';
import { WEB_PRODUCTS } from './products.ts';
import { DEFAULT_ZONE } from './sequence.ts';

/**
 * Every funnel email once, with believable dates, for looking at the real
 * thing in a real mail app before a buyer gets it: `web-email`'s `sampleTo`.
 * The welcome and the renewal notice come for both plans.
 */

const DAY_MS = 86_400_000;

export function sampleWebEmails(now: Date, base: string, zone: string = DEFAULT_ZONE): { name: string; email: WebEmail }[] {
  const monthly = WEB_PRODUCTS.web_monthly_intro;
  const quarter = WEB_PRODUCTS.web_quarter;
  const inDays = (n: number) => new Date(now.getTime() + n * DAY_MS).toISOString();
  return [
    { name: 'web_welcome', email: welcomeEmail({ product: monthly, nextChargeAt: inDays(7), zone, base }) },
    { name: 'web_welcome_quarter', email: welcomeEmail({ product: quarter, nextChargeAt: inDays(91), zone, base }) },
    { name: 'web_morning', email: morningEmail({ base }) },
    { name: 'web_day3', email: day3Email({ base }) },
    { name: 'web_renewal_notice', email: renewalNoticeEmail({ product: monthly, renewalAt: inDays(2), zone, base }) },
    { name: 'web_renewal_notice_quarter', email: renewalNoticeEmail({ product: quarter, renewalAt: inDays(2), zone, base }) },
    { name: 'web_abandon_1', email: abandon1Email({ base }) },
    { name: 'web_abandon_2', email: abandon2Email({ base }) },
  ];
}
