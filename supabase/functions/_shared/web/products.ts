/**
 * The web funnel's products, on the server.
 *
 * The funnel at start.walkito.site sells through RevenueCat Billing (Stripe as
 * the gateway) with the buyer's Supabase user id as the RevenueCat app user
 * id. Those purchases never reach the app's own RevenueCat customer (an
 * anonymous id), so the app sees them through `comp_access` (reason 'web'),
 * which `revenuecat-webhook` writes.
 *
 * The catalog is what the emails quote, so it must say what the price page
 * and the consent box said. A new price arm is a new RevenueCat product (a
 * saved price cannot be edited), so it is a new entry here before it goes
 * live: an email for a product missing from the catalog is held, never sent
 * with a guessed amount.
 */

export type WebProduct = {
  id: string;
  /** The plan's name on a receipt. */
  name: string;
  currency: 'USD';
  /** The paid first period, when the product has one. */
  intro: { amount: number; days: number } | null;
  /** The regular charge, and how many months it covers. */
  amount: number;
  months: number;
  /**
   * Which renewals get the notice two days before: only the end of the paid
   * first period (the step from $0.99 to $9.99), or every renewal.
   */
  notice: 'intro' | 'every';
};

export const WEB_PRODUCTS: Readonly<Record<string, WebProduct>> = {
  web_monthly_intro: {
    id: 'web_monthly_intro',
    name: 'Walkito monthly',
    currency: 'USD',
    intro: { amount: 0.99, days: 7 },
    amount: 9.99,
    months: 1,
    notice: 'intro',
  },
  web_quarter: {
    id: 'web_quarter',
    name: 'Walkito, 3 months',
    currency: 'USD',
    intro: null,
    amount: 19.99,
    months: 3,
    notice: 'every',
  },
  web_monthly_499: {
    id: 'web_monthly_499',
    name: 'Walkito monthly',
    currency: 'USD',
    intro: { amount: 4.99, days: 30 },
    amount: 9.99,
    months: 1,
    notice: 'intro',
  },
  web_yearly_4999: {
    id: 'web_yearly_4999',
    name: 'Walkito, 1 year',
    currency: 'USD',
    intro: null,
    amount: 49.99,
    months: 12,
    notice: 'every',
  },
  web_yearly: {
    id: 'web_yearly',
    name: 'Walkito, 1 year',
    currency: 'USD',
    intro: null,
    amount: 59.99,
    months: 12,
    notice: 'every',
  },
};

/** RevenueCat Billing and Stripe: the stores a web purchase comes from. */
const WEB_STORES: ReadonlySet<string> = new Set(['RC_BILLING', 'STRIPE']);

/** The id without a store suffix such as `:monthly`. */
function baseId(productId: string): string {
  return productId.split(':')[0];
}

/**
 * A purchase made on the web: any product id starting with `web_`, or any
 * purchase RevenueCat files under RevenueCat Billing or Stripe. The webhook
 * spells stores in capitals (`RC_BILLING`), the subscriber API in lowercase
 * (`rc_billing`); both count.
 */
export function isWebProduct(productId: string | null | undefined, store?: string | null): boolean {
  if (store != null && WEB_STORES.has(store.toUpperCase())) return true;
  return productId != null && baseId(productId).startsWith('web_');
}

export function webProduct(productId: string | null | undefined): WebProduct | null {
  if (productId == null) return null;
  return WEB_PRODUCTS[baseId(productId)] ?? null;
}

/** `$9.99`. */
export function money(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

/** What the buyer is charged on the first day: the intro price, or a full period. */
export function firstCharge(product: WebProduct): number {
  return product.intro?.amount ?? product.amount;
}
