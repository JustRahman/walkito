import { factsOf } from './flow';
import type { Answers } from './state';

/**
 * Her own answers, said back to her: the guess after "When do you notice it
 * most?", what she tried, the paragraph half-way. Everything here is built
 * from what she tapped and nothing else, and every function works with any
 * answer missing (a visitor from before v7, or one who came in by a link).
 *
 * None of it is sent anywhere. Which of these she saw follows a health
 * answer, so analytics never hears it.
 */

/**
 * "a", "a and b", "a, b and c". Where an item has an "or" of its own
 * ("new insoles or shoes"), a comma goes before the "and" so the list still
 * reads one way.
 */
export function listOf(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  const comma = items.some((item) => item.includes(' or '));
  if (items.length === 2) return `${items[0]}${comma ? ',' : ''} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}${comma ? ',' : ''} and ${items[items.length - 1]}`;
}

// ── /s/36: the guess ───────────────────────────────────────────────────────

export type Guess = {
  /** What we guess her day is like, before she has described it. */
  guess: string;
  /** After "Yes, that's it": what it sounds like, in one line. */
  heard: string;
  /** One more line: she is not the only one. */
  more?: string;
  /** What her plan has for it. Also the answer to "Not quite". */
  plan: string;
};

const STEADY: Guess = {
  guess: 'Nothing dramatic happened. You just started watching your step, on the stairs and when you get up at night.',
  heard: 'It sounds like you trust your feet a little less than you used to.',
  more: 'That’s more common than anyone admits, and feet are the part nobody mentions.',
  plan: 'Your plan starts easy. You can do it sitting down, or standing with a hand on a counter.',
};

const GENERAL: Guess = {
  guess: 'It comes and goes, so it’s hard to explain to anyone. Some days you almost forget. Then you stand up, and there it is.',
  heard: 'It sounds like you’ve stopped mentioning it.',
  plan: 'Your plan is one short session a day, at whatever time suits you.',
};

const BY_WHEN: Readonly<Partial<Record<NonNullable<Answers['when']>, Guess>>> = {
  morning: {
    guess: 'The first few steps are the worst. Around step twenty it eases. And when you’ve sat for a while, it’s back.',
    heard: 'It sounds like you’ve been bracing for that first step for a while.',
    more: 'You’re not the only one. Mornings are when a lot of people notice their feet most.',
    plan: 'Your plan starts right there, with 2 minutes on the edge of the bed before your feet touch the floor.',
  },
  sitting: {
    guess: 'The longer you sit, the worse the first steps. Getting out of the car is one of the worst. And mornings aren’t great either.',
    heard: 'It sounds like you plan your sitting around your feet.',
    more: 'A lot of people do, and almost nobody says it out loud.',
    plan: 'Your plan has moves you do in the chair, before you stand up.',
  },
  evening: {
    guess: 'The first hours are fine. By mid-afternoon you’re counting what’s left. And when you finally sit down, your feet throb.',
    heard: 'It sounds like your feet are done before your day is.',
    more: 'You’re not being dramatic. Long hours on hard floors are a lot to ask of two feet.',
    plan: 'Your sessions are short, and they’re made for after the shoes come off.',
  },
  running: {
    guess: 'The walk itself goes fine. You pay for it afterwards. So the walks have been getting shorter.',
    heard: 'It sounds like your walks have been shrinking a little at a time.',
    more: 'Sore feet do that to anyone.',
    plan: 'Your plan starts small, a few minutes at home, and works its way back out the door.',
  },
  allday: {
    guess: 'It’s there when you get up, and it’s still there at night. Some days are worse than others. You’ve mostly stopped bringing it up.',
    heard: 'It sounds like you’ve been carrying this around all day, every day.',
    more: 'That wears anyone down.',
    plan: GENERAL.plan,
  },
};

/**
 * The guess for her answer. Feeling unsteady has its own, whenever she notices
 * it. "About 1 in 10 adults" is said only to someone whose answer was her
 * heel: it is a figure for heel pain (La Trobe University, 2024) and for
 * nothing else.
 */
export function guessOf(a: Answers): Guess {
  if (a.focus === 'steady') return STEADY;
  const said = (a.when != null ? BY_WHEN[a.when] : undefined) ?? GENERAL;
  if (a.when === 'morning' && a.focus === 'heel')
    return {
      ...said,
      more: 'You’re not the only one. About 1 in 10 adults gets heel pain at some point, and the first steps of the morning are the classic time to feel it.',
    };
  return said;
}

/** The answer to "Not quite": no second guess, only what the plan has. */
export const NOT_QUITE = 'Thanks. That helps us get it right.';

// ── /s/37: what she tried ──────────────────────────────────────────────────

/**
 * Things to wear or use, as they read after "You tried". They act on the foot
 * from outside. `insoles` still means "insoles or new shoes", as its answer
 * card says.
 */
const THINGS: Readonly<Record<string, string>> = {
  insoles: 'new insoles or shoes',
  roller: 'a roller or massage',
};

/** Everything she ticked on "What have you already tried?", as a list reads it. A doctor is not something she "tried". */
const TRIED_NOUN: Readonly<Record<string, string>> = {
  stretching: 'stretching on your own',
  ...THINGS,
  videos: 'videos online',
};

export function triedNouns(a: Answers): string[] {
  return Object.keys(TRIED_NOUN)
    .filter((value) => a.tried?.includes(value))
    .map((value) => TRIED_NOUN[value]!);
}

export function sawSomeone(a: Answers): boolean {
  return a.tried?.includes('pt') === true;
}

export type Release = { title: string; lines: string[]; cta: string };

/**
 * After "What have you already tried?": built from her own ticks, so it is
 * never the same three things for everyone. What she bought helps for a while
 * and trains nothing; what she did on her own came with no plan. Neither is
 * her doing. A doctor or physical therapist is never part of that list:
 * Walkito does not replace one.
 */
export function releaseOf(a: Answers): Release {
  const tried = a.tried ?? [];
  const things = Object.keys(THINGS)
    .filter((value) => tried.includes(value))
    .map((value) => THINGS[value]!);
  const stretched = tried.includes('stretching');
  const videos = tried.includes('videos');
  const lines: string[] = [];

  if (things.length === 1) lines.push(`You tried ${things[0]}. That helps for a while. It doesn’t make your foot any stronger.`);
  else if (things.length === 2) lines.push(`You tried ${listOf(things)}. Both help for a while. Neither one makes your foot any stronger.`);
  else if (things.length > 2) lines.push(`You tried ${listOf(things)}. They all help for a while. None of them makes your foot any stronger.`);

  const too = things.length > 0 ? ' too' : '';
  if (stretched && videos) lines.push(`You stretched and followed videos on your own${too}. Nobody told you which moves were yours, or when to move on.`);
  else if (stretched) lines.push(`You stretched on your own${too}, with no plan to follow.`);
  else if (videos) lines.push(`You followed videos online${too}, and nobody told you which moves were yours.`);

  const own = lines.length > 0;
  if (own) lines.push('That part’s been missing, and it’s where your plan starts.');
  if (sawSomeone(a))
    lines.push(
      'Walkito doesn’t replace your doctor or physical therapist. Use it on the days in between, for the part there’s never time for in an appointment.',
    );

  if (own) return { title: 'You didn’t do anything wrong.', lines, cta: 'Show me the part I haven’t tried' };
  if (sawSomeone(a)) return { title: 'You did the right thing.', lines, cta: 'Keep going' };
  return {
    title: 'A good place to start.',
    lines: ['Lots of people spend years on insoles and shoes before anyone shows them how to make their feet stronger.', 'You’re starting with that part.'],
    cta: 'Keep going',
  };
}

// ── /s/38: what we heard ───────────────────────────────────────────────────

const BOTHERS: Readonly<Record<NonNullable<Answers['focus']>, string>> = {
  heel: 'Your heel bothers you',
  flat: 'Your arches bother you',
  allday: 'Your feet get sore',
  moving: 'Your feet or ankles feel stiff',
  steady: 'You feel unsteady on your feet',
};

const NOTICED: Readonly<Record<NonNullable<Answers['when']>, string>> = {
  morning: 'most with the first steps of the morning',
  sitting: 'most when you stand up after sitting',
  evening: 'most by the evening',
  running: 'most during or after a walk or run',
  allday: 'all day',
  varies: 'on some days more than others',
};

const HOW_LONG: Readonly<Record<NonNullable<Answers['since']>, string>> = {
  new: 'It started in the last 3 months.',
  months: 'It’s been going on for 3 to 12 months.',
  year: 'It’s been more than a year.',
  years: 'It’s been more than 3 years.',
};

const WHERE: Readonly<Record<NonNullable<Answers['start']>, string>> = {
  chair: 'from a chair',
  bed: 'on the edge of the bed',
  standing: 'standing, with a hand on a counter',
};

/**
 * Half-way: what she told us as one paragraph, a sentence per answer, for her
 * to confirm. Her words for each answer, nothing concluded from them. A
 * sentence whose answer is missing is left out.
 */
export function summaryOf(a: Answers): string[] {
  const out: string[] = [];
  if (a.focus != null) out.push(`${BOTHERS[a.focus]}${a.when != null ? ` ${NOTICED[a.when]}` : ''}.`);
  if (a.since != null) out.push(HOW_LONG[a.since]);
  const tried = triedNouns(a);
  if (tried.length > 0) out.push(`You’ve tried ${listOf(tried)}${sawSomeone(a) ? ', and you’ve seen a doctor or physical therapist' : ''}.`);
  else if (sawSomeone(a)) out.push('You’ve seen a doctor or physical therapist about it.');
  else if (a.tried?.includes('nothing') === true) out.push('You haven’t tried anything for it yet.');
  out.push(`You want something you can do ${WHERE[a.start ?? 'chair']}, in about ${a.minutes ?? 5} minutes a day.`);
  if (factsOf(a).safetyFlag) out.push('And because of what you told us, your first week stays seated.');
  return out;
}
