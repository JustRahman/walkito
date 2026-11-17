import { describe, expect, test } from 'bun:test';

import type { Access } from './account';
import { planStatus } from './plan-status';

const NOW = new Date('2026-11-16T12:00:00Z');
const DAY = 86_400_000;
const at = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString();

const ok = (a: Partial<Access>) =>
  ({
    ok: true,
    access: { access: true, status: 'intro', product_id: 'web_monthly_499', period_end: at(30), intro_ends_at: at(30), management_url: null, ...a },
  }) as const;

describe('the cancel page says one thing about a plan', () => {
  test('a refunded plan is refunded, never "next charge", even with an old period end on file', () => {
    // The case from Nov 16: status refunded, period end still the old intro end.
    expect(planStatus(ok({ access: false, status: 'refunded', period_end: at(0.5), intro_ends_at: at(0.5) }), NOW)).toEqual({
      kind: 'refunded',
      plan: 'Monthly plan',
    });
  });

  test('a paid first month: active, next charge at the end of the first month', () => {
    const s = planStatus(ok({}), NOW);
    expect(s.kind).toBe('active');
    if (s.kind === 'active') expect(s.nextCharge?.toISOString()).toBe(at(30));
  });

  test('cancelled but paid up: cancelled, with the end date', () => {
    const s = planStatus(ok({ status: 'cancelled', period_end: at(10) }), NOW);
    expect(s).toEqual({ kind: 'cancelled', plan: 'Monthly plan', endsAt: new Date(at(10)) });
  });

  test('cancelled and past its end, or expired: ended', () => {
    expect(planStatus(ok({ access: false, status: 'cancelled', period_end: at(-1) }), NOW).kind).toBe('ended');
    expect(planStatus(ok({ access: false, status: 'expired', period_end: at(-1) }), NOW).kind).toBe('ended');
  });

  test('no purchase at all: none', () => {
    expect(planStatus(ok({ access: false, status: null, product_id: null, period_end: null, intro_ends_at: null }), NOW).kind).toBe('none');
  });

  test('the server could not be reached: an error, not "no plan"', () => {
    expect(planStatus({ ok: false, reason: 'error' }, NOW)).toEqual({ kind: 'error' });
  });

  test('access from elsewhere (a founder, an access code) with no web purchase: active, no date', () => {
    expect(planStatus(ok({ status: null, product_id: null, period_end: null, intro_ends_at: null }), NOW)).toEqual({
      kind: 'active',
      plan: 'Monthly plan',
      nextCharge: null,
      billingIssue: false,
    });
  });

  test('the yearly plans are named as such', () => {
    const s = planStatus(ok({ status: 'active', product_id: 'web_yearly_2999', intro_ends_at: null, period_end: at(365) }), NOW);
    expect(s.kind === 'active' && s.plan).toBe('Yearly plan');
  });
});
