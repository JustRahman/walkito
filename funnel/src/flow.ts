import { ONELINK } from './config';
import { firstWeek, moveOf, todayOf, TRY_MOVE, type Focus, type Move, type PlanFacts } from './engine/plan';
import type { Answers, FunnelState } from './state';

/**
 * The steps, by neutral path. A path says nothing about feet or health, so
 * neither does a URL in an ad report, a pixel event or a browser history.
 */
export const STEP = {
  age: '/s/1',
  card: '/s/20',
  focus: '/s/2',
  when: '/s/3',
  wake: '/s/34',
  since: '/s/21',
  tried: '/s/5',
  day: '/s/22',
  start: '/s/6',
  safety: '/s/7',
  minutes: '/s/9',
  life: '/s/23',
  fault: '/s/24',
  path: '/s/25',
  research: '/s/28',
  compare: '/s/29',
  reviews: '/s/30',
  goals: '/s/26',
  before: '/s/10',
  move: '/s/11',
  after: '/s/12',
  felt: '/s/32',
  praise: '/s/33',
  routine: '/s/35',
  balance: '/s/13',
  building: '/s/14',
  sign: '/s/31',
  plan: '/s/15',
  email: '/s/16',
  code: '/s/17',
  price: '/s/18',
  start1: '/s/start',
  me: '/s/me',
  cancel: '/s/cancel',
} as const;

/** The funnel in order, up to the price. */
export const ORDER: readonly string[] = [
  STEP.age,
  STEP.card,
  STEP.focus,
  STEP.when,
  STEP.wake,
  STEP.since,
  STEP.tried,
  STEP.day,
  STEP.start,
  STEP.safety,
  STEP.minutes,
  STEP.life,
  STEP.fault,
  STEP.path,
  STEP.research,
  STEP.compare,
  STEP.reviews,
  STEP.goals,
  STEP.move,
  STEP.after,
  STEP.felt,
  STEP.praise,
  STEP.routine,
  STEP.balance,
  STEP.sign,
  STEP.building,
  STEP.plan,
  STEP.email,
  STEP.code,
  STEP.price,
];

/** Fast early, slower later: the bar moves most on the first answers. */
export const PROGRESS: Readonly<Record<string, number>> = Object.fromEntries(
  ORDER.slice(0, -1).map((step, i, all) => [step, Math.round((0.1 + 0.88 * Math.sqrt((i + 1) / all.length)) * 100) / 100]),
);

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
  const required: Array<[string, (s: FunnelState) => boolean]> = [
    [STEP.age, (x) => x.answers.age != null],
    [STEP.focus, (x) => x.answers.focus != null],
    [STEP.when, (x) => x.answers.when != null],
    [STEP.since, (x) => x.answers.since != null],
    [STEP.tried, (x) => x.answers.tried != null],
    [STEP.day, (x) => x.answers.day != null],
    [STEP.start, (x) => x.answers.start != null],
    [STEP.safety, (x) => x.answers.safety != null],
    [STEP.minutes, (x) => x.answers.minutes != null],
    [STEP.life, (x) => x.answers.life != null],
    [STEP.goals, (x) => x.answers.goals != null],
  ];
  const at = ORDER.indexOf(path);
  if (at > 0) for (const [step, done] of required) if (ORDER.indexOf(step) < at && !done(s)) return step;
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

/** Who the plan is for, from her usual day. */
export type Kind = 'desk' | 'runner' | 'feet';

export function kindOf(a: Answers): Kind {
  return a.day === 'run_short' || a.day === 'run_long' ? 'runner' : a.day === 'feet' ? 'feet' : 'desk';
}

export const PLAN_NAME: Readonly<Record<Kind, string>> = {
  desk: 'Desk Feet Reset',
  runner: 'Runner’s Feet',
  feet: 'On-Your-Feet Reset',
};

/** "5 min a day · seated". No length: the plan is open-ended, as it is in the app. */
export function planLine(a: Answers): string {
  const where = kindOf(a) === 'runner' ? 'before or after your runs' : a.start === 'standing' ? 'standing' : 'seated';
  return `${a.minutes ?? 5} min a day · ${where}`;
}

export type LifeOption = { value: string; label: string; goal: string; goalLabel: string };

/** How her feet get in her way, each with its mirror: the goal she can pick back. */
export const LIFE: readonly LifeOption[] = [
  { value: 'mornings', label: 'I dread my first steps in the morning', goal: 'mornings', goalLabel: 'Enjoy my mornings again' },
  { value: 'walks', label: 'I skip walks', goal: 'walk', goalLabel: 'Walk without thinking about my feet' },
  { value: 'shift', label: 'I can’t stand through my shift', goal: 'shift', goalLabel: 'Stand through my day' },
  { value: 'runs', label: 'I cut my runs short', goal: 'runs', goalLabel: 'Run longer' },
  { value: 'shoes', label: 'I can’t wear the shoes I like', goal: 'shoes', goalLabel: 'Wear the shoes I like' },
  { value: 'evening', label: 'My feet hurt by evening', goal: 'evenings', goalLabel: 'Enjoy my evenings on my feet' },
];

/** A runner sees running first. */
export function lifeFor(a: Answers): readonly LifeOption[] {
  if (kindOf(a) !== 'runner') return LIFE;
  return [...LIFE.filter((o) => o.value === 'runs'), ...LIFE.filter((o) => o.value !== 'runs')];
}

export function lifeLabels(a: Answers): string[] {
  return LIFE.filter((o) => a.life?.includes(o.value)).map((o) => o.label);
}

export function goalLabels(a: Answers): string[] {
  return LIFE.filter((o) => a.goals?.includes(o.goal)).map((o) => o.goalLabel);
}

/** The goals that mirror what she said gets in her way: listed first and marked, never ticked for her. */
export function mentionedGoals(a: Answers): string[] {
  return LIFE.filter((o) => a.life?.includes(o.value)).map((o) => o.goal);
}

export const WHEN_LABEL: Readonly<Record<NonNullable<Answers['when']>, string>> = {
  morning: 'First steps in the morning',
  sitting: 'Standing up after sitting',
  evening: 'After work, by evening',
  running: 'During or after runs',
  allday: 'All day',
  varies: 'It varies',
};

export const DAY_LABEL: Readonly<Record<NonNullable<Answers['day']>, string>> = {
  sit8: 'Sitting 8+ hours a day',
  sit4: 'Sitting 4–8 hours a day',
  feet: 'On your feet most of the day',
  run_short: 'Running under 10 miles a week',
  run_long: 'Running 10+ miles a week',
};

export const SINCE_LABEL: Readonly<Record<NonNullable<Answers['since']>, string>> = {
  new: 'Less than 3 months',
  months: '3 to 12 months',
  year: '1 to 3 years',
  years: 'More than 3 years',
};

/** Her first name as she typed it, or null. */
export function firstName(s: FunnelState): string | null {
  const name = s.name?.trim() ?? '';
  return name === '' ? null : name;
}

/** Her wake time, "HH:MM": 7:00 until she says otherwise. */
export const DEFAULT_WAKE = '07:00';

export function wakeOf(a: Answers): string {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(a.wake ?? '') ? a.wake! : DEFAULT_WAKE;
}

/** "07:00" -> "7:00 AM". */
export function clockLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h! + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h! < 12 ? 'AM' : 'PM'}`;
}

/**
 * The first-step routine: three moves done sitting up in bed or on its edge,
 * about 2 minutes, before her first step in the morning. The plantar fascia
 * stretch leads: DiGiovanni et al. (2003) had it done before the first step.
 */
export const FIRST_STEP_MOVES = ['fascia_stretch', 'big_toe_lift', 'short_foot_seated'] as const;

export const FIRST_STEP_SOURCE = {
  label: 'DiGiovanni et al., Journal of Bone and Joint Surgery, 2003',
  url: 'https://pubmed.ncbi.nlm.nih.gov/12837927/',
} as const;
