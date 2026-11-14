/**
 * Everything that is a decision rather than code: the price, the products, the
 * links. The price is a variant so a second arm ($4.99 first month, say) is a
 * new entry here and a new RevenueCat product, never an edit of a live one.
 */
export type PriceVariant = {
  id: string;
  monthly: {
    /** RevenueCat package and product. */
    pkg: string;
    product: string;
    /** First charge, today. */
    intro: number;
    introDays: number;
    /** Every month after the intro. */
    price: number;
  };
  quarter: { pkg: string; product: string; price: number; months: 3 };
};

export const PRICE_VARIANTS: Readonly<Record<string, PriceVariant>> = {
  a: {
    id: 'a',
    monthly: { pkg: '$rc_monthly', product: 'web_monthly_intro', intro: 0.99, introDays: 7, price: 9.99 },
    quarter: { pkg: '$rc_three_month', product: 'web_quarter', price: 19.99, months: 3 },
  },
};

export const DEFAULT_VARIANT = 'a';

/** RevenueCat offering the web packages live in. */
export const RC_OFFERING = 'web';

/** Days before the first full charge that the reminder email goes out. */
export const REMINDER_DAYS_BEFORE = 2;

/** Refund window, days after any charge. */
export const GUARANTEE_DAYS = 14;

export const ONELINK = 'https://walkito.onelink.me/2L97/';

export const SUPPORT_EMAIL = import.meta.env.FUNNEL_SUPPORT_EMAIL || 'hello@walkito.site';
export const COMPANY = 'Nemy LLC';
export const POSTAL_ADDRESS = import.meta.env.FUNNEL_POSTAL_ADDRESS || '';
export const DESCRIPTOR = 'WALKITO';

export const env = {
  supabaseUrl: import.meta.env.FUNNEL_SUPABASE_URL ?? '',
  supabaseAnonKey: import.meta.env.FUNNEL_SUPABASE_ANON_KEY ?? '',
  posthogKey: import.meta.env.FUNNEL_POSTHOG_KEY ?? '',
  posthogHost: import.meta.env.FUNNEL_POSTHOG_HOST || 'https://us.i.posthog.com',
  rcKey: import.meta.env.FUNNEL_RC_KEY ?? '',
  pixelId: import.meta.env.FUNNEL_PIXEL_ID ?? '',
};

export function money(value: number): string {
  return `$${value.toFixed(2)}`;
}
