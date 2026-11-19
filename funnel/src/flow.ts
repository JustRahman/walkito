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
  heardWhen: '/s/36',
  since: '/s/21',
  tried: '/s/5',
  heardTried: '/s/37',
  day: '/s/22',
  start: '/s/6',
  safety: '/s/7',
  minutes: '/s/9',
  summary: '/s/38',
  life: '/s/23',
  proof: '/s/28',
  goals: '/s/26',
  move: '/s/11',
  after: '/s/12',
  felt: '/s/32',
  wake: '/s/34',
  routine: '/s/35',
  commit: '/s/31',
  building: '/s/14',
  name: '/s/20',
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
  STEP.focus,
  STEP.when,
  STEP.heardWhen,
  STEP.since,
  STEP.tried,
  STEP.heardTried,
  STEP.day,
  STEP.start,
  STEP.safety,
  STEP.minutes,
  STEP.summary,
  STEP.life,
  STEP.proof,
  STEP.goals,
  STEP.move,
  STEP.after,
  STEP.felt,
  STEP.wake,
  STEP.routine,
  STEP.commit,
  STEP.building,
  STEP.name,
  STEP.plan,
  STEP.email,
  STEP.code,
  STEP.price,
];

/**
 * The ads whose first screen carries on from them, by the `utm_content` their
 * links have. Any other visitor gets the default first screen.
 */
export const ADS = ['ad1_plancard', 'ad2_v1morning', 'ad3_receipt'] as const;
export type Ad = (typeof ADS)[number];

export function adOf(s: Pick<FunnelState, 'utm'>): Ad | null {
  const content = s.utm?.utm_content;
  return ADS.find((ad) => ad === content) ?? null;
}

/**
 * Paths the quiz no longer has, each with where its visitor goes now. Somebody
 * part-way through when a new order ships, or coming back to a saved link,
 * would otherwise land on the first screen.
 */
export const RETIRED: Readonly<Record<string, string>> = {
  // v6 (Nov 2026): the statements, with/without, the reviews screen, "Day 1 is done" and the balance check.
  '/s/24': STEP.proof,
  '/s/25': STEP.proof,
  '/s/29': STEP.goals,
  '/s/30': STEP.goals,
  '/s/33': STEP.wake,
  '/s/13': STEP.commit,
  // Earlier: the 0-10 rating before the try-it move.
  '/s/10': STEP.move,
};

/**
 * The step before this one: where Back goes when the browser has nothing to go
 * back to (she opened a link, or reloaded). Never the loader, which would only
 * send her forward again.
 */
export function prevOf(path: string): string | null {
  if (path.endsWith('/note')) return path.slice(0, -'/note'.length);
  const at = ORDER.indexOf(path);
  if (at <= 0) return null;
  const before = ORDER[at - 1]!;
  return before === STEP.building ? (ORDER[at - 2] ?? null) : before;
}

/** The quiz in four parts, each named above the progress bar from its first step on. */
const SECTIONS: ReadonlyArray<readonly [from: string, label: string]> = [
  [STEP.age, 'About you'],
  [STEP.life, 'Your goals'],
  [STEP.move, 'Your first move'],
  [STEP.wake, 'Your plan'],
];

/** Where she is, in words: "About you", "Your goals"… Null off the quiz. */
export function sectionOf(path: string): string | null {
  const at = ORDER.indexOf(path.replace(/\/note$/, ''));
  let label: string | null = null;
  for (const [from, name] of SECTIONS) if (at >= 0 && ORDER.indexOf(from) <= at) label = name;
  return label;
}

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

/**
 * How her feet get in her way, each with its mirror: the goal she can pick
 * back. The values are stored; the words are v6's, hers for what she wants
 * and never a promise of ours.
 */
export const LIFE: readonly LifeOption[] = [
  { value: 'mornings', label: 'I dread my first steps in the morning', goal: 'mornings', goalLabel: 'Easier mornings on my feet' },
  { value: 'walks', label: 'I skip walks', goal: 'walk', goalLabel: 'Walking without thinking about my feet' },
  { value: 'shift', label: 'I can’t stand for long', goal: 'shift', goalLabel: 'Standing for longer' },
  { value: 'shoes', label: 'I can’t wear the shoes I like', goal: 'shoes', goalLabel: 'Wearing the shoes I like' },
  { value: 'evening', label: 'My feet are sore by evening', goal: 'evenings', goalLabel: 'Evenings on my feet' },
  { value: 'runs', label: 'I cut my runs short', goal: 'runs', goalLabel: 'Running longer' },
];

/** Running is only asked of a runner. */
export function lifeFor(a: Answers): readonly LifeOption[] {
  return kindOf(a) === 'runner' ? LIFE : LIFE.filter((o) => o.value !== 'runs');
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
  evening: 'By the evening',
  running: 'During or after a walk or run',
  allday: 'All day',
  varies: 'It varies',
};

export const DAY_LABEL: Readonly<Record<NonNullable<Answers['day']>, string>> = {
  sit8: 'Mostly sitting',
  sit4: 'Some sitting, some standing',
  feet: 'On your feet most of the day',
  run_short: 'Running regularly',
  // No longer asked (v6 has one answer for runners); kept for a visitor who chose it before.
  run_long: 'Running regularly',
};

export const START_LABEL: Readonly<Record<NonNullable<Answers['start']>, string>> = {
  chair: 'In a chair',
  bed: 'On the edge of the bed',
  standing: 'Standing, with a hand on a counter',
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

/** "07:30" -> "7:30 AM". */
export function clockLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h! + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h! < 12 ? 'AM' : 'PM'}`;
}

/** When she gets up, as hours she can tap. Each is stored as the middle of its hour, in the same "HH:MM" an exact time is. */
export const WAKE_TIMES: ReadonlyArray<{ value: string; label: string }> = [
  { value: '05:30', label: 'Before 6 AM' },
  { value: '06:30', label: '6–7 AM' },
  { value: '07:30', label: '7–8 AM' },
  { value: '08:30', label: '8–9 AM' },
  { value: '09:30', label: 'After 9 AM' },
];

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

/**
 * Behind "expect several weeks or months, and the outlook is good" on the plan
 * page: the best practice guide for plantar heel pain tells clinicians to
 * "adopt a realistic tone as recovery may take several weeks or months but
 * stress the positive prognosis". Said about heel pain only, to someone whose
 * answer was her heel, and never about Walkito.
 */
export const OUTLOOK_SOURCE = {
  label: 'Morrissey et al., British Journal of Sports Medicine, 2021',
  url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8458083/',
} as const;
