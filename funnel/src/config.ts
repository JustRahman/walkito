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
  yearly: { pkg: string; product: string; price: number; months: 12 };
};

export const PRICE_VARIANTS: Readonly<Record<string, PriceVariant>> = {
  a: {
    id: 'a',
    monthly: { pkg: '$rc_monthly', product: 'web_monthly_intro', intro: 0.99, introDays: 7, price: 9.99 },
    quarter: { pkg: '$rc_three_month', product: 'web_quarter', price: 19.99, months: 3 },
    yearly: { pkg: '$rc_annual', product: 'web_yearly', price: 59.99, months: 12 },
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

/**
 * The Web OAuth client the Android app signs in with (432333591174-gtnel…), whose
 * ID tokens Supabase accepts. Empty hides "Continue with Google": it is set only
 * once the client lists this site as an authorized JavaScript origin.
 */
export const GOOGLE_CLIENT_ID = import.meta.env.FUNNEL_GOOGLE_CLIENT_ID ?? '';

export const SUPPORT_EMAIL = import.meta.env.FUNNEL_SUPPORT_EMAIL || 'hello@walkito.site';
export const COMPANY = 'Nemy LLC';
export const POSTAL_ADDRESS = import.meta.env.FUNNEL_POSTAL_ADDRESS || '';
/** Nemy LLC's Stripe account descriptor, shared with the agency, so not changed for Walkito. */
export const DESCRIPTOR = 'NEMY LLC';

/** "Nemy LLC, 30 N Gould St…", whether or not the address already starts with the name. */
export const COMPANY_LINE = POSTAL_ADDRESS === '' ? COMPANY : POSTAL_ADDRESS.startsWith(COMPANY) ? POSTAL_ADDRESS : `${COMPANY}, ${POSTAL_ADDRESS}`;

/** Where the funnel is served: "/go" under walkito.site, from Vite's `base`. */
export const BASE = import.meta.env.BASE_URL.replace(/\/+$/, '');

/** A funnel path or public file, under the base. */
export function url(path: string): string {
  return BASE + path;
}

/** How the funnel's address is written in copy, without the scheme. */
export const SITE = 'walkito.site' + BASE;

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
