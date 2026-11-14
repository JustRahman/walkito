import { useSyncExternalStore } from 'react';

import { BASE, url } from './config';

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

addEventListener('popstate', notify);

/** The path inside the funnel, without the base: "/s/3" for /go/s/3. */
function current(): string {
  const path = location.pathname.startsWith(BASE + '/') || location.pathname === BASE ? location.pathname.slice(BASE.length) : location.pathname;
  return path.replace(/\/+$/, '') || '/';
}

export function usePath(): string {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    current,
  );
}

export function go(path: string, options: { replace?: boolean } = {}): void {
  if (path === current()) return;
  if (options.replace === true) history.replaceState(null, '', url(path) + location.search);
  else history.pushState(null, '', url(path) + location.search);
  scrollTo(0, 0);
  notify();
}

export function back(fallback: string): void {
  if (history.state != null || history.length > 1) history.back();
  else go(fallback, { replace: true });
}
