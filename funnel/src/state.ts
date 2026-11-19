import { useSyncExternalStore } from 'react';

import { DEFAULT_VARIANT } from './config';
import type { Focus } from './engine/plan';

/**
 * What she has told us so far, kept in this browser until she gives an email
 * (and, with her consent, saved with her account after that). One object, one
 * key, so a reload lands where she was.
 */
export type Answers = {
  /** Decades since v6. The four before it are what earlier visitors stored. */
  age?: 'under50' | '50-59' | '60-69' | '70+' | '75+' | '65-74' | '55-64' | 'under55';
  focus?: Focus;
  when?: 'morning' | 'sitting' | 'evening' | 'running' | 'allday' | 'varies';
  since?: 'new' | 'months' | 'year' | 'years';
  /** What she has already tried (/s/5). v7 added `shoes` and `shot`; `insoles` was "insoles or new shoes" before it. */
  tried?: string[];
  /** Roughly what she has spent on her feet so far (/s/39). Only asked of someone who tried something that costs money. */
  spent?: 'under100' | '100-500' | '500-1000' | 'over1000' | 'unsure';
  /** Her usual day: with her other answers it puts her in a scene (sceneOf in flow.ts). */
  day?: 'sit8' | 'sit4' | 'feet' | 'run_short' | 'run_long';
  start?: 'chair' | 'bed' | 'standing';
  safety?: 'surgery' | 'numb' | 'dizzy' | 'aid' | 'none';
  minutes?: 3 | 5 | 10;
  /** The private details she ticked as true for her (LIFE in flow.ts). v7 added the lines by scene; the six before it are kept. */
  life?: string[];
  /** What she wants back (GOALS in flow.ts), in the order she tapped them: the first is the one that matters most. */
  goals?: string[];
  /** When she usually gets up, "HH:MM", 24-hour: her first-step routine's time. */
  wake?: string;
  /** The thing she already does every day that her minutes follow (/s/41). */
  anchor?: 'bed' | 'coffee' | 'home' | 'show' | 'walk';
};

export type TryIt = {
  /** How the move felt, in her words: no number is asked any more. */
  felt?: 'lighter' | 'better' | 'same' | 'unsure';
  seconds?: number;
  skipped?: boolean;
  balance?: number | 'skipped';
};

export type FunnelState = {
  answers: Answers;
  /** Her first name, for her card and her plan. Kept in this browser only, never sent with her answers. */
  name?: string;
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
  plan?: 'monthly' | 'yearly';
  purchased?: boolean;
  utm?: Record<string, string>;
  askedWhy?: boolean;
  /** The one-time price offer was shown: never again, on this browser or (via web_leads) after a reload. */
  offerShown?: boolean;
  feeling?: 'easy' | 'ok' | 'hard';
  remindAt?: 'morning' | 'midday' | 'evening';
  remindBy?: 'email' | 'app';
  session1?: 'started' | 'done';
  /** The yearly upgrade after a monthly purchase, answered once. */
  upgrade?: 'switched' | 'declined';
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
