import { describe, expect, test } from 'bun:test';

import { beforeCheckout, type CodeAsk } from './checkout-guard';

/** A server that answers the sign-in code request, and counts how often it was asked. */
function server(answer: CodeAsk | (() => CodeAsk)) {
  const asked: string[] = [];
  return {
    asked,
    ask: async (email: string) => {
      asked.push(email);
      return typeof answer === 'function' ? answer() : answer;
    },
  };
}

const anonymous = { email: null, anonymous: true };

describe('right before checkout: is the purchase going to her real account?', () => {
  test('her address already belongs to another account (she has the app): a code first, no checkout', async () => {
    const s = server('sent');
    expect(await beforeCheckout(anonymous, ' Sam@Example.com ', s.ask)).toEqual({ next: 'code' });
    expect(s.asked).toEqual(['sam@example.com']);
  });

  test('an account made after the email step but before paying: the email step let her through, checkout does not', async () => {
    // At the email step nobody held the address; she then signed up in the app.
    let signedUpInTheApp = false;
    const s = server(() => (signedUpInTheApp ? 'sent' : 'no-account'));
    expect(await beforeCheckout(anonymous, 'sam@example.com', s.ask)).toEqual({ next: 'checkout' });
    signedUpInTheApp = true;
    expect(await beforeCheckout(anonymous, 'sam@example.com', s.ask)).toEqual({ next: 'code' });
  });

  test('a code sent moments ago (rate limited) means an account holds it: still the code', async () => {
    expect(await beforeCheckout(anonymous, 'sam@example.com', server('rate-limited').ask)).toEqual({ next: 'code' });
  });

  test('nobody holds the address: straight to checkout', async () => {
    expect(await beforeCheckout(anonymous, 'new@example.com', server('no-account').ask)).toEqual({ next: 'checkout' });
  });

  test('already signed in to the account with this address: checkout, and the server is not asked', async () => {
    const s = server('sent');
    expect(await beforeCheckout({ email: 'sam@example.com', anonymous: false }, 'SAM@example.com', s.ask)).toEqual({ next: 'checkout' });
    // The address the webhook put on an anonymous account after an earlier purchase counts too.
    expect(await beforeCheckout({ email: 'sam@example.com', anonymous: true }, 'sam@example.com', s.ask)).toEqual({ next: 'checkout' });
    expect(s.asked).toEqual([]);
  });

  test('signed in to a real account (Google) with another address: she buys on that account', async () => {
    const s = server('sent');
    expect(await beforeCheckout({ email: 'sam@gmail.com', anonymous: false }, 'sam@example.com', s.ask)).toEqual({ next: 'checkout' });
    expect(s.asked).toEqual([]);
  });

  test('the server cannot be reached: no checkout, a message', async () => {
    const guard = await beforeCheckout(anonymous, 'sam@example.com', server('failed').ask);
    expect(guard.next).toBe('error');
  });
});
