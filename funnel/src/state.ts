import { useSyncExternalStore } from 'react';

import { DEFAULT_VARIANT } from './config';
import type { Focus } from './engine/plan';

/**
 * What she has told us so far, kept in this browser until she gives an email
 * (and, with her consent, saved with her account after that). One object, one
 * key, so a reload lands where she was.
 */
export type Answers = {
  age?: '75+' | '65-74' | '55-64' | 'under55';
  focus?: Focus;
  when?: 'morning' | 'sitting' | 'evening' | 'allday' | 'varies';
  tried?: string[];
  start?: 'chair' | 'bed' | 'standing';
  safety?: 'surgery' | 'numb' | 'dizzy' | 'aid' | 'none';
  minutes?: 3 | 5 | 10;
};

export type TryIt = {
  before?: number;
  after?: number;
  seconds?: number;
  skipped?: boolean;
  balance?: number | 'skipped';
};

export type FunnelState = {
  answers: Answers;
  tryIt: TryIt;
  email?: string;
  /** How the last code was sent: a new address on this browser's account, or a sign-in to an existing one. */
  codeMode?: 'create' | 'sign-in';
  /** The address already had an account (the app, or an earlier visit). */
  existing?: boolean;
  /** How she signed in, so the app hint names the same door. */
  via?: 'google' | 'email';
  verified?: boolean;
  consents?: { health: boolean; marketing: boolean };
  variant: string;
  plan?: 'monthly' | 'quarter' | 'yearly';
  purchased?: boolean;
  utm?: Record<string, string>;
  askedWhy?: boolean;
  feeling?: 'easy' | 'ok' | 'hard';
  remindAt?: 'morning' | 'midday' | 'evening';
  remindBy?: 'email' | 'app';
  session1?: 'started' | 'done';
};

const KEY = 'walkito-funnel-v1';

function read(): FunnelState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw != null) return { answers: {}, tryIt: {}, variant: DEFAULT_VARIANT, ...JSON.parse(raw) };
  } catch {
    // Private mode or a full disk: the funnel still works, it just forgets.
  }
  return { answers: {}, tryIt: {}, variant: DEFAULT_VARIANT };
}

let state: FunnelState = read();
const listeners = new Set<() => void>();

export function getState(): FunnelState {
  return state;
}

export function update(patch: Partial<FunnelState> | ((s: FunnelState) => Partial<FunnelState>)): void {
  const next = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...next };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // See read().
  }
  for (const listener of listeners) listener();
}

export function answer(patch: Partial<Answers>): void {
  update((s) => ({ answers: { ...s.answers, ...patch } }));
}

export function useFunnel(): FunnelState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

export function resetFunnel(): void {
  state = { answers: {}, tryIt: {}, variant: state.variant, utm: state.utm };
  update({});
}
