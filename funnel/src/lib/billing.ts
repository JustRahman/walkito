import type { Package, Purchases } from '@revenuecat/purchases-js';

import { env, RC_OFFERING, type PriceVariant } from '../config';

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

export type Packages = { monthly: Package | null; quarter: Package | null };

export async function loadPackages(userId: string, variant: PriceVariant): Promise<Packages> {
  const rc = await purchases(userId);
  const offerings = await rc.getOfferings();
  const offering = offerings.all[RC_OFFERING] ?? offerings.current;
  const find = (pkg: string, product: string) =>
    offering?.availablePackages.find((p) => p.identifier === pkg && p.product.identifier === product) ??
    offering?.availablePackages.find((p) => p.product.identifier === product) ??
    null;
  return { monthly: find(variant.monthly.pkg, variant.monthly.product), quarter: find(variant.quarter.pkg, variant.quarter.product) };
}

export type BuyResult = { status: 'bought' } | { status: 'cancelled' } | { status: 'failed'; code: string; message: string };

export async function buy(userId: string, pkg: Package, email: string, target: HTMLElement): Promise<BuyResult> {
  const rc = await purchases(userId);
  const { ErrorCode, PurchasesError } = await import('@revenuecat/purchases-js');
  try {
    await rc.purchase({ rcPackage: pkg, customerEmail: email, htmlTarget: target, selectedLocale: 'en', skipSuccessPage: true });
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
