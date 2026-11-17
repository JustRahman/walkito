import { compUntil, type WebState } from './customer.ts';

/**
 * A web plan bought on one account (the anonymous one the funnel sold to)
 * and opened in the app on another (her real account, which already held
 * her address). See 0023_web_account_links.sql.
 *
 * The app reads `comp_access` for the account it is signed in to
 * (`src/entities/purchase/model/comp.ts`), so her real account gets a row
 * with reason 'web', kept in step with the purchase on every RevenueCat
 * event: a renewal extends it, a cancel keeps it to the period end, a refund
 * or an expiry removes it. Only reason 'web' is ever touched.
 */

// deno-lint-ignore no-explicit-any
type Db = { rpc: (fn: string, args?: Record<string, unknown>) => any };

export type LinkRow = { access: boolean; until: string | null };
export type TargetInputs = { links: LinkRow[]; own: { status: string; period_end: string | null } | null };

/** The live statuses of a web purchase: open until `period_end`. */
const OPEN: ReadonlySet<string> = new Set(['intro', 'active', 'cancelled', 'billing_issue']);

const ms = (iso: string | null | undefined): number => (iso == null ? Number.NaN : Date.parse(iso));

/**
 * How long her real account's 'web' row should run: the latest of every
 * linked purchase still giving access and her own web purchase (a day past
 * its period end, as 0021 writes it). Null when nothing gives access: the
 * row goes.
 */
export function linkedUntil(input: TargetInputs, now: Date = new Date()): string | null {
  let best: string | null = null;
  const consider = (until: string | null) => {
    if (until == null || !(ms(until) > now.getTime())) return;
    if (best == null || ms(until) > ms(best)) best = until;
  };
  for (const link of input.links) if (link.access) consider(link.until);
  const own = input.own;
  if (own != null && OPEN.has(own.status) && ms(own.period_end) > now.getTime()) consider(compUntil(own.period_end));
  return best;
}

/** What the source's access is, for its link: a day past the paid access, or nothing. */
export function linkStateOf(state: WebState | null): { access: boolean; until: string | null } {
  if (state == null || !state.access) return { access: false, until: null };
  return { access: true, until: compUntil(state.accessEnd) };
}

/** The account that holds an address, or null. */
export async function accountForEmail(db: Db, email: string): Promise<string | null> {
  const { data, error } = await db.rpc('web_account_for_email', { p_email: email });
  if (error != null || data == null) return null;
  return String(data);
}

/** Records the link from the buying account to her real account. */
export async function linkAccounts(db: Db, source: string, target: string, email: string): Promise<string> {
  const { data, error } = await db.rpc('web_link_account', { p_source: source, p_target: target, p_email: email });
  return error != null ? `failed: ${error.message}` : String(data ?? 'none');
}

/** Recomputes one target's 'web' row from its links and its own purchase. */
export async function syncTarget(db: Db, target: string, now: Date = new Date()): Promise<string> {
  const { data, error } = await db.rpc('web_target_inputs', { p_target: target });
  if (error != null) return `failed: ${error.message}`;
  const inputs = (data ?? { links: [], own: null }) as TargetInputs;
  const result = await db.rpc('web_set_linked_access', { p_target: target, p_until: linkedUntil(inputs, now) });
  return result.error != null ? `failed: ${result.error.message}` : String(result.data ?? 'none');
}

/**
 * After any change to one account's web purchase (`recordWebState`): every
 * account linked from it gets the new access, and if this account is itself
 * the target of a link, its own 'web' row is recomputed so its own refund or
 * expiry never wipes access a linked purchase still gives. Answers
 * `<account>:<result>` for each account written; nothing when there are no
 * links.
 */
export async function syncLinkedAccess(db: Db, userId: string, state: WebState | null, now: Date = new Date()): Promise<string[]> {
  const out: string[] = [];
  const link = linkStateOf(state);
  const { data, error } = await db.rpc('web_link_state', { p_source: userId, p_access: link.access, p_until: link.until });
  if (error != null) return [`${userId}:failed: ${error.message}`];
  for (const target of (data ?? []) as string[]) out.push(`${target}:${await syncTarget(db, String(target), now)}`);

  const self = await db.rpc('web_target_inputs', { p_target: userId });
  const links = (self.data as TargetInputs | null)?.links ?? [];
  if (self.error == null && links.length > 0) out.push(`${userId}:${await syncTarget(db, userId, now)}`);
  return out;
}
