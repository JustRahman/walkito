/**
 * What Meta may match her by once she has given her email: SHA-256 of the
 * address and of our account id, never the values themselves. The pixel gets
 * these two hashes; our server works out the same two on its own from her
 * token (`supabase/functions/_shared/web/capi.ts`), so both copies of an
 * event carry the same `em` and `external_id`.
 */
export type Match = { em: string; external_id: string };

const KEY = 'walkito-funnel-meta-match';
const SHA256 = /^[0-9a-f]{64}$/;

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Trimmed and in lowercase first, as Meta asks and as the server does. Null when either is missing, or the browser has no SubtleCrypto (a page not on HTTPS). */
export async function matchOf(userId: string, email: string): Promise<Match | null> {
  const address = email.trim().toLowerCase();
  const id = userId.trim().toLowerCase();
  if (!address.includes('@') || id === '') return null;
  try {
    return { em: await sha256Hex(address), external_id: await sha256Hex(id) };
  } catch {
    return null;
  }
}

/** Kept so a later visit starts the pixel with it. Only the hashes, and only what looks like them. */
export function storedMatch(): Match | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Match> | null;
    if (typeof raw?.em === 'string' && SHA256.test(raw.em) && typeof raw.external_id === 'string' && SHA256.test(raw.external_id)) {
      return { em: raw.em, external_id: raw.external_id };
    }
  } catch {
    // Private mode: the pixel goes without.
  }
  return null;
}

export function storeMatch(match: Match | null): void {
  try {
    if (match == null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(match));
  } catch {
    // See storedMatch().
  }
}
