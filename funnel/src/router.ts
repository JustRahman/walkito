import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

addEventListener('popstate', notify);

export function usePath(): string {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => location.pathname.replace(/\/+$/, '') || '/',
  );
}

export function go(path: string, options: { replace?: boolean } = {}): void {
  if (path === location.pathname) return;
  if (options.replace === true) history.replaceState(null, '', path + location.search);
  else history.pushState(null, '', path + location.search);
  scrollTo(0, 0);
  notify();
}

export function back(fallback: string): void {
  if (history.state != null || history.length > 1) history.back();
  else go(fallback, { replace: true });
}
