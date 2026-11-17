import { describe, expect, test } from 'bun:test';

import { recordWebState, webStateOf, type RcSubscriber, type RcSubscription } from '../supabase/functions/_shared/web/customer.ts';
import { accountForEmail, linkAccounts, linkedUntil, syncLinkedAccess } from '../supabase/functions/_shared/web/links.ts';

/**
 * A web plan bought on the funnel's anonymous account (A) while her address
 * already belonged to her real account (B), the one the app signs in to. The
 * webhook links A to B (0023_web_account_links.sql) and gives B the same
 * access through comp_access, which the app reads; every later RevenueCat
 * event for A keeps B in step.
 *
 * The database below does what the SQL functions do, in memory.
 */

const NOW = new Date('2026-11-17T12:00:00Z');
const DAY = 86_400_000;
const at = (days: number, from: Date = NOW) => new Date(from.getTime() + days * DAY).toISOString();

const A = 'aaaaaaaa-0000-4000-8000-000000000001'; // the anonymous account the funnel sold to
const B = 'bbbbbbbb-0000-4000-8000-000000000002'; // her real account (the app)

type Comp = { reason: string; until: string | null };

function memoryDb(emails: Record<string, string> = { [B]: 'sam@example.com' }) {
  const users = new Set([A, B]);
  const links = new Map<string, { target: string; email: string; access: boolean; until: string | null }>();
  const comp = new Map<string, Comp>();
  const customers = new Map<string, { status: string; period_end: string | null }>();
  const ok = (data: unknown) => Promise.resolve({ data, error: null });
  const setWeb = (user: string, until: string | null): string => {
    const row = comp.get(user);
    if (until == null) {
      if (row?.reason === 'web') {
        comp.delete(user);
        return 'revoked';
      }
      return 'none';
    }
    if (row == null || row.reason === 'web') comp.set(user, { reason: 'web', until });
    return comp.get(user)?.reason === 'web' ? 'granted' : 'kept';
  };
  return {
    links,
    comp,
    customers,
    rpc: (fn: string, args: Record<string, unknown> = {}) => {
      switch (fn) {
        case 'web_account_for_email':
          return ok(Object.entries(emails).find(([, e]) => e === String(args.p_email).trim().toLowerCase())?.[0] ?? null);
        case 'web_link_account': {
          const [source, target] = [String(args.p_source), String(args.p_target)];
          if (source === target) return ok('same account');
          if (!users.has(source) || !users.has(target)) return ok('no user');
          const old = links.get(source);
          links.set(source, { target, email: String(args.p_email), access: old?.access ?? false, until: old?.until ?? null });
          return ok('linked');
        }
        case 'web_link_state': {
          const link = links.get(String(args.p_source));
          if (link == null) return ok([]);
          link.access = args.p_access === true;
          link.until = (args.p_until as string | null) ?? null;
          return ok([link.target]);
        }
        case 'web_target_inputs': {
          const target = String(args.p_target);
          return ok({
            links: [...links.values()].filter((l) => l.target === target).map((l) => ({ access: l.access, until: l.until })),
            own: customers.get(target) ?? null,
          });
        }
        case 'web_set_linked_access':
          return ok(setWeb(String(args.p_target), (args.p_until as string | null) ?? null));
        case 'web_record_customer': {
          const user = String(args.p_user_id);
          customers.set(user, { status: String(args.p_status), period_end: (args.p_period_end as string | null) ?? null });
          if (args.p_access !== true) return ok(setWeb(user, null));
          return ok(args.p_until == null ? 'none' : setWeb(user, String(args.p_until)));
        }
        case 'web_drop_access':
          customers.delete(String(args.p_user_id));
          return ok(setWeb(String(args.p_user_id), null));
        default:
          throw new Error(`unexpected rpc ${fn}`);
      }
    },
  };
}

/** RevenueCat's record of a web buyer: one monthly subscription. */
function record(sub: Partial<RcSubscription>): RcSubscriber {
  return {
    subscriptions: {
      web_monthly_499: { store: 'rc_billing', purchase_date: at(0), original_purchase_date: at(0), period_type: 'intro', ...sub },
    },
  };
}

/** What the webhook does for one RevenueCat event about A: record A, then keep any linked account in step. */
async function event(db: ReturnType<typeof memoryDb>, sub: Partial<RcSubscription>, now: Date = NOW) {
  const state = webStateOf(record(sub), now);
  await recordWebState(db, A, state);
  return { state, synced: await syncLinkedAccess(db, A, state, now) };
}

/** The webhook's repair when the address cannot go on A: link A to the account that holds it. */
async function repair(db: ReturnType<typeof memoryDb>, sub: Partial<RcSubscription>) {
  const { state } = await event(db, sub);
  const holder = await accountForEmail(db, 'sam@example.com');
  expect(holder).toBe(B);
  expect(await linkAccounts(db, A, holder!, 'sam@example.com')).toBe('linked');
  return syncLinkedAccess(db, A, state, NOW);
}

describe('repair: the address already belonged to her app account', () => {
  test('after the first payment her app account opens: a web row a day past the paid month', async () => {
    const db = memoryDb();
    expect(await repair(db, { expires_date: at(30) })).toEqual([`${B}:granted`]);
    expect(db.comp.get(B)).toEqual({ reason: 'web', until: at(31) });
    // The buyer's own row stays as 0021 writes it.
    expect(db.comp.get(A)).toEqual({ reason: 'web', until: at(31) });
  });

  test('a renewal extends her app account to the new period', async () => {
    const db = memoryDb();
    await repair(db, { expires_date: at(30) });
    await event(db, { period_type: 'normal', purchase_date: at(30), expires_date: at(60) });
    expect(db.comp.get(B)?.until).toBe(at(61));
  });

  test('a cancel keeps her access to the end of what she paid for, then it ends', async () => {
    const db = memoryDb();
    await repair(db, { expires_date: at(30) });
    await event(db, { expires_date: at(30), unsubscribe_detected_at: at(2) });
    expect(db.comp.get(B)).toEqual({ reason: 'web', until: at(31) });
    // RevenueCat's expiry, after the period.
    await event(db, { expires_date: at(30), unsubscribe_detected_at: at(2) }, new Date(at(32)));
    expect(db.comp.has(B)).toBe(false);
  });

  test('a refund removes her app access at once', async () => {
    const db = memoryDb();
    await repair(db, { expires_date: at(30) });
    await event(db, { expires_date: at(30), refunded_at: at(1) });
    expect(db.comp.has(B)).toBe(false);
    expect(db.links.get(A)).toMatchObject({ target: B, access: false, until: null });
  });

  test('a founder or an access-code row on her account is never touched', async () => {
    const db = memoryDb();
    db.comp.set(B, { reason: 'founder', until: null });
    expect(await repair(db, { expires_date: at(30) })).toEqual([`${B}:kept`]);
    await event(db, { expires_date: at(30), refunded_at: at(1) });
    expect(db.comp.get(B)).toEqual({ reason: 'founder', until: null });
  });

  test('her own web plan ending does not take away the linked one', async () => {
    const db = memoryDb();
    await repair(db, { expires_date: at(30) });
    // B also once bought on the web herself; that plan is refunded now.
    const own = webStateOf(record({ expires_date: at(30), refunded_at: at(1) }), NOW);
    await recordWebState(db, B, own);
    expect(db.comp.has(B)).toBe(false); // what 0021 does on its own …
    expect(await syncLinkedAccess(db, B, own, NOW)).toEqual([`${B}:granted`]); // … and the link puts it back
    expect(db.comp.get(B)?.until).toBe(at(31));
  });

  test('no link: nothing extra is written for an ordinary buyer', async () => {
    const db = memoryDb();
    const { synced } = await event(db, { expires_date: at(30) });
    expect(synced).toEqual([]);
    expect(db.comp.has(B)).toBe(false);
  });
});

describe('how long the linked account stays open', () => {
  test('the latest of the open links and her own open plan', () => {
    expect(
      linkedUntil(
        {
          links: [
            { access: true, until: at(10) },
            { access: true, until: at(40) },
            { access: false, until: at(90) },
          ],
          own: { status: 'active', period_end: at(20) },
        },
        NOW,
      ),
    ).toBe(at(40));
    expect(linkedUntil({ links: [{ access: true, until: at(5) }], own: { status: 'active', period_end: at(20) } }, NOW)).toBe(at(21));
  });

  test('nothing open: no row', () => {
    expect(linkedUntil({ links: [{ access: true, until: at(-1) }], own: { status: 'refunded', period_end: at(20) } }, NOW)).toBeNull();
    expect(linkedUntil({ links: [], own: null }, NOW)).toBeNull();
  });
});
