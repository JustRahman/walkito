import type { AccessCheck } from './account';

/**
 * What the account pages say about a plan: exactly one of these, never two
 * at once. Built from `web-account`'s answer, which can carry a status and a
 * date that no longer apply (a refunded plan keeps its old period end), so
 * the status decides first and the dates only fill in the words.
 */
export type PlanStatus =
  | { kind: 'error' }
  | { kind: 'none' }
  | { kind: 'active'; plan: string; nextCharge: Date | null; billingIssue: boolean }
  | { kind: 'cancelled'; plan: string; endsAt: Date }
  | { kind: 'refunded'; plan: string }
  | { kind: 'ended'; plan: string };

export function planName(productId: string | null): string {
  if (productId?.includes('yearly') === true) return 'Yearly plan';
  if (productId?.includes('quarter') === true) return '3-month plan';
  return 'Monthly plan';
}

const future = (iso: string | null, now: Date): Date | null => {
  if (iso == null) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) || d <= now ? null : d;
};

export function planStatus(check: AccessCheck, now: Date = new Date()): PlanStatus {
  if (!check.ok) return check.reason === 'error' ? { kind: 'error' } : { kind: 'none' };
  const a = check.access;
  const plan = planName(a.product_id);
  if (a.status === 'refunded') return { kind: 'refunded', plan };
  if (!a.access) return a.status == null ? { kind: 'none' } : { kind: 'ended', plan };
  if (a.status === 'cancelled') {
    const endsAt = future(a.period_end, now);
    return endsAt != null ? { kind: 'cancelled', plan, endsAt } : { kind: 'ended', plan };
  }
  if (a.status === 'expired') return { kind: 'ended', plan };
  // intro, active, billing_issue, or access from another source (status null).
  const nextCharge = a.status == null ? null : (future(a.intro_ends_at, now) ?? future(a.period_end, now));
  return { kind: 'active', plan, nextCharge, billingIssue: a.status === 'billing_issue' };
}
