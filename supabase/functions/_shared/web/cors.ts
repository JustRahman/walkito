/**
 * Who may call the funnel's functions from a browser: the funnel itself, and
 * a dev server. `WEB_FUNNEL_ORIGINS` (comma-separated) adds more, such as a
 * preview deploy, without a code change.
 */

export const FUNNEL_ORIGINS: readonly string[] = ['https://start.walkito.site', 'http://localhost:3000'];

export function funnelOrigins(extra: string | null | undefined): string[] {
  const more = (extra ?? '')
    .split(',')
    .map((x) => x.trim().replace(/\/+$/, ''))
    .filter((x) => /^https?:\/\/[^/\s]+$/.test(x));
  return [...new Set([...FUNNEL_ORIGINS, ...more])];
}

export function hostsOf(origins: readonly string[]): string[] {
  return origins.map((o) => new URL(o).hostname);
}

/** Echoes an allowed origin back; any other origin gets no allow header, so its browser refuses the answer. */
export function corsHeaders(origin: string | null, allowed: readonly string[], methods: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origin != null && allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}
