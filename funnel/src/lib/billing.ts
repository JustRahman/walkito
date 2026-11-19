import type { Package, Purchases } from '@revenuecat/purchases-js';

import { env, PRICE_OFFER, type PriceVariant } from '../config';

let instance: Promise<Purchases> | null = null;
let configuredFor: string | null = null;

/** RevenueCat Web Billing, with the Supabase user id as the app user id. */
function purchases(userId: string): Promise<Purchases> {
  if (instance != null && configuredFor === userId) return instance;
  configuredFor = userId;
  instance = import('@revenuecat/purchases-js').then(async ({ Purchases }) => {
    if (Purchases.isConfigured()) {
      const shared = Purchases.getSharedInstance();
      await shared.changeUser(userId);
      return shared;
    }
    return Purchases.configure({ apiKey: env.rcKey, appUserId: userId });
  });
  return instance;
}

export function billingReady(): boolean {
  return env.rcKey !== '';
}

/**
 * `monthlyIntro`: RevenueCat offers her the $4.99 first month. It answers per
 * app user id and leaves the intro out for anyone who has bought before
 * ("has never made any purchase"), so a returning member sees $9.99 today.
 * `offer` is null when she can no longer get its $29.99 first year.
 */
export type Packages = { monthly: Package | null; yearly: Package | null; offer: Package | null; monthlyIntro: boolean };

/** RevenueCat gives this product an intro price for her. */
export function hasIntro(pkg: Package | null): boolean {
  return pkg?.webBillingProduct.introPricePhase?.price != null;
}

export async function loadPackages(userId: string, variant: PriceVariant): Promise<Packages> {
  const rc = await purchases(userId);
  const offerings = await rc.getOfferings();
  const offering = offerings.all[variant.offering] ?? null;
  const find = (pkg: string, product: string) =>
    offering?.availablePackages.find((p) => p.identifier === pkg && p.product.identifier === product) ??
    offering?.availablePackages.find((p) => p.product.identifier === product) ??
    null;
  const monthly = find(variant.monthly.pkg, variant.monthly.product);
  const offer = find(PRICE_OFFER.pkg, PRICE_OFFER.product);
  return {
    monthly,
    yearly: find(variant.yearly.pkg, variant.yearly.product),
    offer: hasIntro(offer) ? offer : null,
    monthlyIntro: hasIntro(monthly),
  };
}

export type BuyResult = { status: 'bought' } | { status: 'cancelled' } | { status: 'failed'; code: string; message: string };

/**
 * RevenueCat's own full-page checkout, with its own close button: in-page,
 * never a pop-up or a redirect, which the Facebook and Instagram browsers lose.
 * (Given an element instead, it drops the close button and the page has to
 * supply one it cannot wire to the purchase.)
 */
export async function buy(userId: string, pkg: Package, email: string): Promise<BuyResult> {
  const rc = await purchases(userId);
  const { ErrorCode, PurchasesError } = await import('@revenuecat/purchases-js');
  try {
    await rc.purchase({ rcPackage: pkg, customerEmail: email, selectedLocale: 'en', skipSuccessPage: true });
    return { status: 'bought' };
  } catch (error) {
    if (error instanceof PurchasesError && error.errorCode === ErrorCode.UserCancelledError) return { status: 'cancelled' };
    const code = error instanceof PurchasesError ? String(error.errorCode) : 'unknown';
    return {
      status: 'failed',
      code,
      message: 'Your bank did not approve this. You have not been charged. Try another card, or try again in a minute.',
    };
  }
}

export type SwitchResult = { status: 'switched' } | { status: 'cancelled' } | { status: 'unsupported' } | { status: 'failed'; code: string; message: string };

/**
 * Monthly to yearly on the same card. NOT BUILT, on purpose; the screen that
 * calls it is behind YEARLY_UPGRADE_ENABLED (config.ts), which is off.
 *
 * What RevenueCat Billing supports (docs: /docs/web/product-changes, Nov 2026):
 * a product change from the Web SDK, in BETA, through `purchase()` with
 * `productChangeInfo: { subscriptionId, subscriberToken }`. Missing here:
 *  1. The API is internal: `productChangeInfo` is not in the SDK's types and
 *     may change in any release (the SDK would need pinning to one version).
 *  2. A server endpoint that mints the subscriber token: RevenueCat v2
 *     `POST /projects/{project}/apps/{app}/authenticate` with a v2 secret key
 *     holding `iam:authorization:issue_token`, for the signed-in user only,
 *     plus the subscription id from `GET /customers/{id}/subscriptions`.
 *  3. A change path in the dashboard: web_monthly_499 -> web_yearly_4999, as
 *     an upgrade.
 *  4. The money is not "$45.00 today": an upgrade on RevenueCat Billing
 *     charges the full $49.99 now and refunds the unused part of the $4.99
 *     as a separate refund (the paid first month ends; it does not carry
 *     over). The screen's words must say that before it is switched on.
 */
export async function switchToYearly(): Promise<SwitchResult> {
  return { status: 'unsupported' };
}
