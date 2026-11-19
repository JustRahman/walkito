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
  spent: '/s/39',
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
  anchor: '/s/41',
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
  STEP.spent,
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
  STEP.anchor,
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

/** What she tried that costs money. Stretching and videos do not. */
const PAID = ['shoes', 'insoles', 'roller', 'pt', 'shot', 'splint'];

export function paidFor(tried: readonly string[] | undefined): boolean {
  return tried?.some((value) => PAID.includes(value)) === true;
}

/** What she said she has spent, or nothing if her answers no longer include anything that costs money (she went back and changed them). */
export function spentOf(a: Answers): Answers['spent'] {
  return paidFor(a.tried) ? a.spent : undefined;
}

/** Whether she told us $500 or more. */
export function spentALot(a: Answers): boolean {
  const spent = spentOf(a);
  return spent === '500-1000' || spent === 'over1000';
}

/** A step she is not asked: the money question, when nothing she tried costs money. */
function passedOver(step: string, a: Answers): boolean {
  return step === STEP.spent && !paidFor(a.tried);
}

/**
 * The step before this one: where Back goes when the browser has nothing to go
 * back to (she opened a link, or reloaded). Never the loader, which would only
 * send her forward again, and never a question she was not asked.
 */
export function prevOf(path: string, a: Answers = {}): string | null {
  if (path.endsWith('/note')) return path.slice(0, -'/note'.length);
  for (let at = ORDER.indexOf(path) - 1; at >= 0; at -= 1) {
    const before = ORDER[at]!;
    if (before !== STEP.building && !passedOver(before, a)) return before;
  }
  return null;
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

/** How many moves today's session has on her plan page, the one she tried in the quiz among them: "move 1 of 3". */
export function todayCount(s: FunnelState, now: Date = new Date()): number {
  return planView(s, now).days[0]?.moves.length ?? 0;
}

/**
 * Session 1 after purchase: what is left of today's session, the move she did
 * in the quiz taken out. The same moves her plan page lists under Today, so
 * "move 1 of 3 done" there is "2 moves left" here.
 */
export function sessionOne(s: FunnelState, now: Date = new Date()): Move[] {
  return planView(s, now).days[0]?.moves.filter((m) => !m.doneToday && m.clip != null) ?? [];
}

/** The longest one move runs in the browser's session. */
export const MOVE_CAP = 120;

/** "About 3 minutes": how long these moves take in the browser, never under one. */
export function minutesOf(moves: readonly Move[]): number {
  return Math.max(1, Math.round(moves.reduce((sum, m) => sum + Math.min(MOVE_CAP, m.seconds), 0) / 60));
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

/**
 * Which of the six audiences her answers put her in. The first match wins. It
 * picks the private details she is shown, her pattern's name, her goals and
 * her plan's name. With an answer missing it falls through to `general`.
 *
 * Worked out in this browser and never sent to analytics: it follows her
 * health answers.
 */
export type Scene = 'morning' | 'shift' | 'walks' | 'steady' | 'sport' | 'general';

export function sceneOf(a: Answers): Scene {
  if (a.day === 'run_short' || a.day === 'run_long') return 'sport';
  if (a.focus === 'steady') return 'steady';
  if (a.when === 'morning' || a.when === 'sitting') return 'morning';
  if (a.day === 'feet' || a.focus === 'allday' || a.when === 'evening') return 'shift';
  if (a.when === 'running') return 'walks';
  return 'general';
}

/**
 * "Tried everything": a state on top of any scene, never a scene of its own.
 * On when she tried three or more things that cost money, or has had this a
 * year or longer and tried two or more things, or told us $500 or more.
 */
export function burned(a: Answers): boolean {
  const tried = (a.tried ?? []).filter((value) => value !== 'nothing');
  const long = a.since === 'year' || a.since === 'years';
  return tried.filter((value) => PAID.includes(value)).length >= 3 || (long && tried.length >= 2) || spentALot(a);
}

/** Sixty or older, in the decades asked since v6 and the bands asked before it. "55-64" is not: she may be 55. */
export function sixtyPlus(a: Answers): boolean {
  return a.age === '60-69' || a.age === '70+' || a.age === '65-74' || a.age === '75+';
}

/**
 * The plan the price page opens on. A plan she came with (`?plan=` on a link)
 * or tapped herself always wins. Otherwise the year, one known number, for the
 * steady scene and for sixty or older; and the smallest first payment for
 * everyone else, and for anyone who has tried everything, whatever her age.
 *
 * It only picks which card is marked. It is never stored and never tracked:
 * `plan_selected` is her own tap.
 */
export function defaultPlan(s: Pick<FunnelState, 'plan' | 'answers'>): 'monthly' | 'yearly' {
  if (s.plan != null) return s.plan;
  return (sceneOf(s.answers) === 'steady' || sixtyPlus(s.answers)) && !burned(s.answers) ? 'yearly' : 'monthly';
}

/**
 * The one-time $29.99 offer: shown once, and it stays until midnight of the
 * day it was first shown, in her own time zone. The price page says exactly
 * that, so this is what makes it true.
 *
 * `first`: never shown. `open`: first shown earlier today. `over`: shown on an
 * earlier day, or by a build that kept no time (v6), or she has bought.
 */
export function offerOf(s: Pick<FunnelState, 'offerShown' | 'offerShownAt' | 'purchased'>, now: Date): 'first' | 'open' | 'over' {
  if (s.purchased === true) return 'over';
  if (s.offerShown !== true && s.offerShownAt == null) return 'first';
  const shown = new Date(s.offerShownAt ?? Number.NaN);
  return shown.toDateString() === now.toDateString() ? 'open' : 'over';
}

/** Her plan's name, by scene. A name is where the plan is headed, never a promise. */
export const PLAN_NAME: Readonly<Record<Scene, string>> = {
  morning: 'First Steps Plan',
  shift: 'Long-Day Feet Plan',
  walks: 'Back to Your Walk Plan',
  steady: 'Steady Feet Plan',
  sport: 'Runner’s Feet',
  general: 'Daily Feet Reset',
};

/** "5 min a day · seated". No length: the plan is open-ended, as it is in the app. */
export function planLine(a: Answers): string {
  const where = sceneOf(a) === 'sport' ? 'before or after your runs' : a.start === 'standing' ? 'standing' : 'seated';
  return `${a.minutes ?? 5} min a day · ${where}`;
}

/**
 * What her pattern is called on /s/28, in the words a neighbor would use.
 * "Long-shift" is for someone on her feet most of the day; sore by the evening
 * without that is a long day.
 */
export function patternName(a: Answers): string {
  const scene = sceneOf(a);
  if (scene === 'shift') return a.day === 'feet' ? 'the long-shift kind' : 'the long-day kind';
  return { morning: 'the morning-stiff kind', walks: 'the shrinking-walks kind', steady: 'the watch-every-step kind', sport: 'the runner’s kind', general: 'the comes-and-goes kind' }[scene];
}

/**
 * What she can want back, as a picture of a day and never a promise of ours.
 * The values are stored. `evenings` was asked before v7 and is kept so a goal
 * stored then still reads.
 */
export const GOALS: Readonly<Record<string, string>> = {
  mornings: 'Getting out of bed without bracing for it',
  walk: 'My full walk, without paying for it later',
  dog: 'The dog’s whole walk',
  shift: 'A full day on my feet, with something left for the evening',
  grandkids: 'Keeping up with the grandkids',
  trips: 'Trips and outings without planning around my feet',
  stairs: 'Feeling sure of my step on stairs',
  shoes: 'Wearing the shoes I like',
  runs: 'My full run, without paying for it later',
  evenings: 'Evenings on my feet',
};

/** The six goals that fit each scene, the likeliest first. */
const SCENE_GOALS: Readonly<Record<Scene, readonly string[]>> = {
  morning: ['mornings', 'walk', 'stairs', 'shoes', 'trips', 'grandkids'],
  shift: ['shift', 'mornings', 'walk', 'shoes', 'trips', 'grandkids'],
  walks: ['walk', 'dog', 'trips', 'grandkids', 'mornings', 'shoes'],
  steady: ['stairs', 'walk', 'trips', 'grandkids', 'dog', 'shoes'],
  sport: ['runs', 'mornings', 'walk', 'shift', 'shoes', 'trips'],
  general: ['walk', 'mornings', 'shoes', 'trips', 'grandkids', 'shift'],
};

export type LifeOption = { value: string; label: string; goal?: string };

/**
 * The private details: things she does because of her feet and has not told
 * anyone, in the words people with each scene use for them. She ticks what is
 * true; we never say it is. Each has the goal it mirrors, where it has one.
 * The values are stored. `before` holds the three lines asked until v7 that no
 * scene asks now, so an answer stored then still mirrors its goal.
 */
const LIFE: Readonly<Record<Scene | 'burned' | 'before', readonly LifeOption[]>> = {
  morning: [
    { value: 'bed_edge', label: 'I sit on the edge of the bed for a moment before I stand', goal: 'mornings' },
    { value: 'bathroom', label: 'I know the shortest way to the bathroom', goal: 'mornings' },
    { value: 'wall', label: 'I hold the wall or the doorframe for the first steps', goal: 'stairs' },
    { value: 'bedside', label: 'I keep slippers or a ball by the bed', goal: 'mornings' },
    { value: 'older', label: 'For the first minutes I walk like someone much older than I am', goal: 'walk' },
  ],
  shift: [
    { value: 'countdown', label: 'By the last hours I’m counting down', goal: 'shift' },
    { value: 'shoe_after_shoe', label: 'I’ve bought shoe after shoe', goal: 'shoes' },
    { value: 'home_done', label: 'When I get home I don’t want to move', goal: 'shift' },
    { value: 'car', label: 'The walk to the car is the worst part', goal: 'walk' },
    { value: 'more_years', label: 'I’ve wondered how many more years I can do this', goal: 'shift' },
  ],
  walks: [
    { value: 'shorter', label: 'My walks have been getting shorter', goal: 'walk' },
    { value: 'turned_back', label: 'I’ve turned back halfway', goal: 'walk' },
    { value: 'go_ahead', label: 'I say “you go ahead”', goal: 'trips' },
    { value: 'costs_day', label: 'A walk costs me the rest of the day', goal: 'walk' },
    { value: 'errands', label: 'I plan errands around my feet', goal: 'trips' },
  ],
  steady: [
    { value: 'watch_step', label: 'I watch every step on stairs', goal: 'stairs' },
    { value: 'hold_rail', label: 'I hold the counter or the rail more than I used to', goal: 'stairs' },
    { value: 'out_less', label: 'I go out a little less than I did', goal: 'trips' },
    { value: 'just_age', label: 'I’ve been told it’s just my age' },
    { value: 'nobody_feet', label: 'Nobody ever mentioned my feet' },
  ],
  sport: [
    { value: 'runs', label: 'I cut my runs short', goal: 'runs' },
    { value: 'morning_after', label: 'The morning after is the worst', goal: 'mornings' },
    { value: 'rest_it', label: 'I’ve been told to rest it', goal: 'runs' },
    { value: 'gear', label: 'I’ve tried the whole gear aisle' },
    { value: 'miss_it', label: 'I miss it more than I say', goal: 'runs' },
  ],
  general: [
    { value: 'quiet', label: 'I’ve stopped mentioning it' },
    { value: 'shoes', label: 'I can’t wear the shoes I like', goal: 'shoes' },
    { value: 'evening', label: 'My feet are sore by evening', goal: 'shift' },
    { value: 'skip_things', label: 'I skip things I used to say yes to', goal: 'trips' },
    { value: 'plan_day', label: 'I think about my feet before I plan a day', goal: 'trips' },
  ],
  burned: [
    { value: 'drawer', label: 'I have a drawer of things that helped for two weeks' },
    { value: 'my_doing', label: 'I’ve wondered what I’m doing wrong' },
  ],
  before: [
    { value: 'mornings', label: 'I dread my first steps in the morning', goal: 'mornings' },
    { value: 'walks', label: 'I skip walks', goal: 'walk' },
    { value: 'shift', label: 'I can’t stand for long', goal: 'shift' },
  ],
};

/** The lines she is shown: her scene's five, and two more for someone who has tried everything. */
export function lifeFor(a: Answers): readonly LifeOption[] {
  return [...LIFE[sceneOf(a)], ...(burned(a) ? LIFE.burned : [])];
}

/** How many of the lines she ticked, whichever scene or build asked them. "None of these" is not one. */
export function tickedCount(a: Answers): number {
  return (a.life ?? []).filter((value) => value !== 'none').length;
}

/** The goals that mirror what she ticked, in the order she ticked: listed first and marked, never ticked for her. */
export function mentionedGoals(a: Answers): string[] {
  const all = Object.values(LIFE).flat();
  const goals = (a.life ?? []).map((value) => all.find((o) => o.value === value)?.goal).filter((goal): goal is string => goal != null);
  return [...new Set(goals)];
}

/**
 * The goals she can pick: the ones she mentioned first, then the rest of her
 * scene's six. Grandkids are not put to someone under 50 unless a line she
 * ticked brought them up.
 */
export function goalsFor(a: Answers): Array<{ value: string; label: string; mentioned: boolean }> {
  const mentioned = mentionedGoals(a);
  const rest = SCENE_GOALS[sceneOf(a)].filter((goal) => !mentioned.includes(goal) && !(goal === 'grandkids' && a.age === 'under50'));
  return [...mentioned.map((goal) => ({ goal, mentioned: true })), ...rest.map((goal) => ({ goal, mentioned: false }))].map((o) => ({
    value: o.goal,
    label: GOALS[o.goal]!,
    mentioned: o.mentioned,
  }));
}

/** Her goals in her words, in the order she tapped them: the first is the one that matters most. */
export function goalLabels(a: Answers): string[] {
  return (a.goals ?? []).map((goal) => GOALS[goal]).filter((label): label is string => label != null);
}

export type Anchor = NonNullable<Answers['anchor']>;

/** Something she already does every day, for her minutes to follow (/s/41). */
export const ANCHOR_LABEL: Readonly<Record<Anchor, string>> = {
  bed: 'Before I get out of bed',
  coffee: 'With my morning coffee',
  home: 'When I get home and the shoes come off',
  show: 'During my evening show',
  walk: 'Before my walk',
};

const SCENE_ANCHORS: Readonly<Record<Scene, readonly Anchor[]>> = {
  morning: ['bed', 'coffee', 'show', 'home', 'walk'],
  shift: ['home', 'show', 'coffee', 'bed', 'walk'],
  walks: ['walk', 'coffee', 'bed', 'show', 'home'],
  steady: ['coffee', 'bed', 'show', 'home', 'walk'],
  sport: ['walk', 'coffee', 'bed', 'home', 'show'],
  general: ['coffee', 'show', 'bed', 'home', 'walk'],
};

/** The same five moments for everyone, the likeliest for her scene first. A runner's walk is her run. */
export function anchorLabel(anchor: Anchor, a: Answers): string {
  return anchor === 'walk' && sceneOf(a) === 'sport' ? 'Before my run' : ANCHOR_LABEL[anchor];
}

export function anchorsFor(a: Answers): Array<{ value: Anchor; label: string }> {
  return SCENE_ANCHORS[sceneOf(a)].map((value) => ({ value, label: anchorLabel(value, a) }));
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

/** Before this hour a visit belongs to the evening before, as on the server (`NIGHT_ENDS` in `_shared/web/sequence.ts`). */
const NIGHT_ENDS = 4;
/** The welcome email goes first, and the next one waits three hours after it (`GAP_HOURS` there), so the first-step email is on time only this far ahead. */
const EMAIL_LEAD_HOURS = 4;

/**
 * Her next morning, by the rule the server sends the first-step email on
 * (`web_morning`): the day after she starts, at her wake time, where a start
 * before 4 AM counts as the evening before, so its morning is the same day's.
 *
 * `hours` is whole hours from now, for "about 13 hours from now": a number the
 * page prints once, never a ticking clock. `byEmail` is false when the email
 * could not be out by her wake time, and then no page promises it.
 */
export function nextMorning(now: Date, wake: string): { at: Date; tomorrow: boolean; hours: number; byEmail: boolean } {
  const [h, m] = wake.split(':').map(Number);
  const tomorrow = now.getHours() >= NIGHT_ENDS;
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (tomorrow ? 1 : 0), h, m);
  const ahead = (at.getTime() - now.getTime()) / 3_600_000;
  return { at, tomorrow, hours: Math.round(ahead), byEmail: ahead >= EMAIL_LEAD_HOURS };
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
