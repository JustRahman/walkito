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
    /** First charge, today, for the first month. */
    intro: number;
    /** Every month after the first. */
    price: number;
  };
  yearly: { pkg: string; product: string; price: number; months: 12 };
  /** RevenueCat offering the packages live in. */
  offering: string;
};

/**
 * Rahman's decision (Nov 13 research, E-18): a small first payment, $4.99 for
 * the first month, then $9.99; the year at $49.99, the app's own price. No
 * 3-month plan for now. The earlier arm ($0.99 for 7 days, 3 months, $59.99
 * a year) lives on in RevenueCat for anyone who bought it.
 */
export const PRICE_VARIANTS: Readonly<Record<string, PriceVariant>> = {
  b: {
    id: 'b',
    monthly: { pkg: '$rc_monthly', product: 'web_monthly_499', intro: 4.99, price: 9.99 },
    yearly: { pkg: '$rc_annual', product: 'web_yearly_4999', price: 49.99, months: 12 },
    offering: 'web_b',
  },
};

export const DEFAULT_VARIANT = 'b';

/**
 * What the yearly plan costs less than the same twelve months paid monthly,
 * the first of them at its intro price. Worked out here so the line on the
 * price page follows the prices and is never typed.
 */
export function yearlySaving(v: PriceVariant): number {
  return Math.round((v.monthly.intro + (v.yearly.months - 1) * v.monthly.price - v.yearly.price) * 100) / 100;
}

/**
 * The one-time offer after "What held you back?" -> "The price": the first
 * year for $29.99, then $49.99 a year. A NEW RevenueCat product with a paid
 * first period (one year at $29.99) that renews at $49.99; the live products
 * are not touched. It sits in the variant's offering as its own package. Until
 * RevenueCat has it, the offer is simply not shown.
 */
export type Offer = { id: string; pkg: string; product: string; intro: number; price: number; months: 12 };

export const PRICE_OFFER: Offer = {
  id: 'year_2999',
  pkg: 'yearly_offer',
  product: 'web_yearly_2999',
  intro: 29.99,
  price: 49.99,
  months: 12,
};

/**
 * "Want the whole year instead?" right after a monthly purchase. OFF: see
 * `switchToYearly` in lib/billing.ts for what is missing before it can be on.
 */
export const YEARLY_UPGRADE_ENABLED = false;

/**
 * A preview build shows Rahim's placeholder texts (src/preview/placeholders.ts).
 * True only in `bun run dev` or a build with FUNNEL_PREVIEW=1; the deploy
 * script never sets it, and it is a build-time constant, so production drops
 * the placeholders entirely.
 */
export const PREVIEW = import.meta.env.MODE === 'development' || import.meta.env.FUNNEL_PREVIEW === '1';

/** Days before the first full charge that the reminder email goes out. */
export const REMINDER_DAYS_BEFORE = 2;

/** Refund window, days after any charge. */
export const GUARANTEE_DAYS = 14;

export const ONELINK = 'https://walkito.onelink.me/2L97/';

// ── Trust lines on the plan and price pages ────────────────────────────────

/**
 * The clinical practice guideline behind "Exercise is what physical therapists
 * recommend first". TODO(Rahman): put the exact guideline link here. While it
 * is empty, the line is hidden.
 */
export const PT_GUIDELINE_URL = '';

/** The site's own list of the papers and guidelines its guides cite (site/lib/citations.ts), each with a DOI or PubMed id. */
export const SOURCES_URL = 'https://walkito.site/science/';

/**
 * Dr. Carla Shayman's name and photo, worded as her Upwork contract (Oct 30,
 * 2026) covers: she reviewed our heel pain and flat feet guides, and we may
 * use her bio. Rahim asked for her back on Nov 18. Not "reviewed every
 * exercise": that needs her broader written consent.
 */
export const CARLA_APPROVED = true;

/** Her photo, as walkito.site already serves it (the funnel runs under walkito.site/go). */
export const CARLA_PHOTO = '/team/carla-shayman.webp';

/** The App Store rating the line quotes. Change it if the rating changes. */
export const APP_STORE_RATING = '5.0';

/** "Used by 1,000+ people" shows only once the server's real count passes this. The server counts people, not women. */
export const PEOPLE_THRESHOLD = 1000;

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
