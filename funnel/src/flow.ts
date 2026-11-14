import { ONELINK } from './config';
import { firstWeek, moveOf, todayOf, TRY_MOVE, type Focus, type Move, type PlanFacts } from './engine/plan';
import type { Answers, FunnelState } from './state';

/**
 * The steps, by neutral path. A path says nothing about feet or health, so
 * neither does a URL in an ad report, a pixel event or a browser history.
 */
export const STEP = {
  age: '/s/1',
  focus: '/s/2',
  when: '/s/3',
  echo: '/s/4',
  tried: '/s/5',
  start: '/s/6',
  safety: '/s/7',
  who: '/s/8',
  minutes: '/s/9',
  before: '/s/10',
  move: '/s/11',
  after: '/s/12',
  balance: '/s/13',
  building: '/s/14',
  plan: '/s/15',
  email: '/s/16',
  code: '/s/17',
  price: '/s/18',
  start1: '/s/start',
  me: '/s/me',
  cancel: '/s/cancel',
} as const;

/** Fast early, slower later: the bar moves most on the first answers. */
export const PROGRESS: Readonly<Record<string, number>> = {
  [STEP.age]: 0.12,
  [STEP.focus]: 0.24,
  [STEP.when]: 0.34,
  [STEP.echo]: 0.41,
  [STEP.tried]: 0.48,
  [STEP.start]: 0.55,
  [STEP.safety]: 0.62,
  [STEP.who]: 0.68,
  [STEP.minutes]: 0.74,
  [STEP.before]: 0.79,
  [STEP.move]: 0.83,
  [STEP.after]: 0.87,
  [STEP.balance]: 0.9,
  [STEP.building]: 0.93,
  [STEP.plan]: 0.95,
  [STEP.email]: 0.97,
  [STEP.code]: 0.98,
};

export const FOCUS_LABEL: Readonly<Record<Focus, string>> = {
  heel: 'Heel and arch',
  steady: 'Feeling steadier on my feet',
  flat: 'Flat feet',
  allday: 'On my feet all day',
  moving: 'Keeping my feet moving',
};

/** The program name, as the plan and the receipt call it. */
export const PROGRAM: Readonly<Record<Focus, string>> = {
  heel: 'Heel & arch',
  steady: 'Steadier on your feet',
  flat: 'Flat feet',
  allday: 'On my feet all day',
  moving: 'Keep your feet moving',
};

export function factsOf(a: Answers): PlanFacts {
  return {
    focus: a.focus ?? 'heel',
    safetyFlag: a.safety != null && a.safety !== 'none',
    numb: a.safety === 'numb',
    seated: a.start !== 'standing',
    minutes: a.minutes ?? 5,
  };
}

/** Only for "steadier", with nothing to plan around, starting standing. */
export function offersBalance(a: Answers): boolean {
  return a.focus === 'steady' && a.safety === 'none' && a.start === 'standing';
}

export function tryMove(a: Answers): Move {
  return moveOf({ id: TRY_MOVE[a.focus ?? 'heel'] });
}

export type PlanView = {
  days: Array<{ date: string; label: string; rest: boolean; minutes: number; moves: Array<Move & { doneToday: boolean }> }>;
  facts: PlanFacts;
};


/** The week from today on, with today's first move the one she just tried. */
export function planView(s: FunnelState, now: Date = new Date()): PlanView {
  const facts = factsOf(s.answers);
  const week = firstWeek(facts, now);
  const today = todayOf(week, now)?.date;
  const tried = s.tryIt.seconds != null && s.tryIt.seconds > 0 && s.tryIt.skipped !== true;
  const trial = tryMove(s.answers);
  const days = week.days
    .filter((day) => today == null || day.date >= today)
    .map((day, i) => {
      const [y, m, d] = day.date.split('-').map(Number);
      const weekday = new Date(y!, m! - 1, d!).toLocaleDateString('en-US', { weekday: 'long' });
      const moves = day.exercises.map((e) => ({ ...moveOf(e), doneToday: false }));
      if (i === 0 && tried) {
        const rest = moves.filter((m) => m.id !== trial.id);
        moves.splice(0, moves.length, { ...trial, doneToday: true }, ...rest);
      }
      return {
        date: day.date,
        label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : weekday,
        rest: day.exercises.length === 0,
        minutes: day.minutes,
        moves,
      };
    });
  return { days, facts };
}

/** Session 1 after purchase: two moves from today that she has not just done. */
export function sessionOne(s: FunnelState, now: Date = new Date()): Move[] {
  const view = planView(s, now);
  const tried = s.tryIt.skipped !== true && (s.tryIt.seconds ?? 0) > 0 ? tryMove(s.answers).id : null;
  const pool = view.days.flatMap((d) => d.moves).filter((m) => m.id !== tried && m.clip != null);
  const unique = pool.filter((m, i) => pool.findIndex((x) => x.id === m.id) === i);
  return unique.slice(0, 2);
}

export function appLink(from: string): string {
  const url = new URL(ONELINK);
  url.searchParams.set('pid', 'web_funnel');
  url.searchParams.set('c', from);
  return url.toString();
}

/** Where a visitor without the earlier answers should be sent instead. */
export function missingStep(path: string, s: FunnelState): string | null {
  const order: Array<[string, (s: FunnelState) => boolean]> = [
    [STEP.age, (x) => x.answers.age != null],
    [STEP.focus, (x) => x.answers.focus != null],
    [STEP.when, (x) => x.answers.when != null],
    [STEP.tried, (x) => x.answers.tried != null],
    [STEP.start, (x) => x.answers.start != null],
    [STEP.safety, (x) => x.answers.safety != null],
    [STEP.minutes, (x) => x.answers.minutes != null],
  ];
  const needs: Readonly<Record<string, number>> = {
    [STEP.focus]: 1,
    [STEP.when]: 2,
    [STEP.echo]: 3,
    [STEP.tried]: 3,
    [STEP.start]: 4,
    [STEP.safety]: 5,
    [STEP.who]: 6,
    [STEP.minutes]: 6,
    [STEP.before]: 7,
    [STEP.move]: 7,
    [STEP.after]: 7,
    [STEP.balance]: 7,
    [STEP.building]: 7,
    [STEP.plan]: 7,
    [STEP.email]: 7,
    [STEP.code]: 7,
    [STEP.price]: 7,
  };
  const n = needs[path] ?? 0;
  for (const [step, done] of order.slice(0, n)) if (!done(s)) return step;
  if ((path === STEP.code || path === STEP.price) && s.email == null) return STEP.email;
  if (path === STEP.price && s.verified !== true) return STEP.code;
  return null;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function shortDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function longDate(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}
