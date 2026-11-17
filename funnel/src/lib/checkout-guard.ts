/**
 * Right before checkout opens: is she about to buy on the anonymous account
 * this browser holds while her address already belongs to another account?
 *
 * That happens when she had the app before, or signed up (in the app, on
 * another device) between the email step and paying. The purchase would land
 * on the anonymous account and the app, signed in to her real one, would not
 * see it. So the address is checked once more here, and if another account
 * holds it she gets a 6-digit code and buys signed in to that account.
 *
 * Pure: the account and a way to ask the server go in, a decision comes out
 * (`checkout-guard.test.ts`). `signInWithOtp` without sign-ups mails a code
 * only to an address that has an account and says `otp_disabled` for every
 * other one, so asking is the check.
 */

export type GuardAccount = { email: string | null; anonymous: boolean } | null;

/** What asking for a sign-in code answered. */
export type CodeAsk = 'sent' | 'no-account' | 'rate-limited' | 'failed';

export type Guard = { next: 'checkout' } | { next: 'code' } | { next: 'error'; message: string };

export async function beforeCheckout(account: GuardAccount, email: string, askCode: (email: string) => Promise<CodeAsk>): Promise<Guard> {
  const address = email.trim().toLowerCase();
  // No account yet: the price page sends her to the email step anyway.
  if (account == null) return { next: 'checkout' };
  // Signed in to an account that already has this address (the code, Google, or an earlier claim).
  if (account.email != null && account.email.trim().toLowerCase() === address) return { next: 'checkout' };
  // Signed in to a real account with another address (Google with a different one): she buys there.
  if (!account.anonymous) return { next: 'checkout' };
  switch (await askCode(address)) {
    case 'no-account':
      return { next: 'checkout' };
    case 'sent':
    // A code went out moments ago: only an address with an account gets one.
    case 'rate-limited':
      return { next: 'code' };
    case 'failed':
      return { next: 'error', message: 'We could not reach our server. Check your connection and try again.' };
  }
}
