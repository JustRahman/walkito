import type { ResendMessage } from '../email/compose.ts';
import { oneClickUrl, unsubscribePageUrl, unsubscribeToken } from '../email/links.ts';
import { renderEmail } from '../email/template.ts';
import type { WebEmail } from './emails.ts';

/**
 * One funnel email, as the request body Resend takes: the app emails' own
 * template, footer and one-click unsubscribe, with the funnel's links in
 * place of the app's. Kept apart from the edge function so a test renders
 * exactly what a buyer would get.
 *
 * The unsubscribe token is the same HMAC of the user id the app emails use,
 * so `email-unsubscribe` and the site's /unsubscribe/ page work unchanged;
 * for a funnel buyer they mark `web_leads.unsubscribed_at`.
 */

/**
 * Where every reply to a funnel email goes. Fixed, not configurable: the
 * Terms promise a refund on any charge by replying to any of our emails, so a
 * reply must always reach the inbox a person reads.
 */
export const WEB_REPLY_TO = 'hello@walkito.site';

export type WebMailConfig = {
  /** `walkito <hello@walkito.site>`. */
  from: string;
  /** The day-3 note's sender: two names, the same address. */
  personalFrom: string;
  postalAddress: string;
  /** The main site, which serves the unsubscribe page and the mascot: `https://walkito.site`. */
  linkBase: string;
  /** `https://<ref>.supabase.co/functions/v1`, for the one-click unsubscribe target. */
  functionsBase: string;
  unsubscribeSecret: string;
};

/** `Rahim from Walkito <hello@walkito.site>`: the same address as `from`, with the people's names. */
export function personalSender(from: string, names = 'Rahim from Walkito'): string {
  const address = /<([^>]+)>/.exec(from)?.[1] ?? from.trim();
  return `${names} <${address}>`;
}

export async function composeWebMessage(email: WebEmail, recipient: { userId: string; email: string }, config: WebMailConfig): Promise<ResendMessage> {
  const token = await unsubscribeToken(recipient.userId, config.unsubscribeSecret);
  const { html, text } = await renderEmail({
    content: {
      subject: email.subject,
      preheader: email.preheader,
      greeting: email.greeting,
      paragraphs: email.paragraphs,
      button: { label: email.button?.label ?? '', path: '' },
      ps: email.ps,
    },
    locale: 'en',
    buttonUrl: email.button?.url ?? '',
    unsubscribeUrl: unsubscribePageUrl(config.linkBase, token, 'en'),
    settingsUrl: '',
    // Lowercase like the rest of the footer.
    postalAddress: config.postalAddress.toLowerCase(),
    assetBase: config.linkBase,
    footerWhy: email.footerWhy,
    hideSettings: true,
    afterButton: email.after,
    hideMascot: email.personal,
  });
  return {
    from: email.personal ? config.personalFrom : config.from,
    to: [recipient.email],
    reply_to: WEB_REPLY_TO,
    subject: email.subject,
    html,
    text,
    headers: {
      'List-Unsubscribe': `<${oneClickUrl(config.functionsBase, token)}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    tags: [
      { name: 'email_key', value: email.kind },
      { name: 'funnel', value: 'web' },
    ],
  };
}
