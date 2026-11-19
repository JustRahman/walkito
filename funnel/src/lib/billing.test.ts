import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Package } from '@revenuecat/purchases-js';

import { hasIntro } from './billing';

/** A package as RevenueCat returns it, with or without an intro price for this buyer. */
function pkg(intro: number | null): Package {
  const introPricePhase = intro == null ? null : { price: { amount: intro * 100, amountMicros: intro * 1e6, currency: 'USD', formattedPrice: `$${intro}` } };
  return { webBillingProduct: { introPricePhase } } as unknown as Package;
}

describe('the first month at $4.99 is shown only when RevenueCat offers it to her', () => {
  test('a new buyer gets the intro; a returning one (RevenueCat leaves it out) and a missing package do not', () => {
    expect(hasIntro(pkg(4.99))).toBe(true);
    expect(hasIntro(pkg(null))).toBe(false);
    expect(hasIntro(null)).toBe(false);
  });

  test('the price page takes today\'s monthly price from that answer, never straight from the config', () => {
    const price = readFileSync(join(import.meta.dir, '../screens/price.tsx'), 'utf8');
    expect(price.match(/m\.intro/g)).toEqual(['m.intro']);
    expect(price.includes('const monthToday = intro ? m.intro : m.price;')).toBe(true);
    expect(price.includes('if (!loaded.monthlyIntro) {')).toBe(true);
    // A box ticked while the page still showed $4.99 never opens a $9.99 checkout.
    expect(price.includes("if (plan === 'monthly' && intro && loaded?.monthlyIntro === false) return setPhase('idle');")).toBe(true);
  });

  test('the $29.99 offer is dropped for anyone RevenueCat no longer gives its first year', () => {
    const billing = readFileSync(join(import.meta.dir, 'billing.ts'), 'utf8');
    expect(billing.includes('offer: hasIntro(offer) ? offer : null,')).toBe(true);
  });
});
