import { env } from '../config';

const KEY = 'walkito-funnel-people';

/**
 * How many people finished the quiz or bought, from the server
 * (`web_funnel_people()`, 0022_funnel_round2.sql): one number, nothing about
 * anyone. Read with the public key over plain fetch, so the plan page does not
 * load the Supabase client early, and kept for this browser session. Null when
 * it cannot be read: the line that uses it stays hidden.
 */
export async function peopleCount(): Promise<number | null> {
  try {
    const cached = sessionStorage.getItem(KEY);
    if (cached != null) return Number(cached);
  } catch {
    // Private mode: read it every time.
  }
  if (env.supabaseUrl === '' || env.supabaseAnonKey === '') return null;
  try {
    const res = await fetch(`${env.supabaseUrl}/rest/v1/rpc/web_funnel_people`, {
      method: 'POST',
      headers: { apikey: env.supabaseAnonKey, Authorization: `Bearer ${env.supabaseAnonKey}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) return null;
    const value = Number(await res.json());
    if (!Number.isFinite(value)) return null;
    try {
      sessionStorage.setItem(KEY, String(value));
    } catch {
      // See above.
    }
    return value;
  } catch {
    return null;
  }
}
