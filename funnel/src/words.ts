import {
  anchorLabel,
  burned,
  clockLabel,
  factsOf,
  nextMorning,
  patternName,
  sceneOf,
  sixtyPlus,
  spentALot,
  spentOf,
  START_LABEL,
  tickedCount,
  wakeOf,
  type Scene,
} from './flow';
import type { Move } from './engine/plan';
import type { Answers } from './state';

/**
 * Her own answers, said back to her: the guess after "When do you notice it
 * most?", what she tried, the paragraph half-way, her pattern, her plan in one
 * sentence. Everything here is built
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
 * Things to wear or have done, as they read after "You tried". They act on
 * the foot from outside. `insoles` was "insoles or new shoes" until v7: for an
 * answer stored then it still says insoles, and nothing about shoes.
 */
const THINGS: Readonly<Record<string, string>> = {
  shoes: 'special shoes',
  insoles: 'insoles',
  roller: 'a roller or massage',
  shot: 'a shot',
  splint: 'a night splint',
};

/** Everything she ticked on "What have you already tried?", as a list reads it. A doctor is not something she "tried". */
const TRIED_NOUN: Readonly<Record<string, string>> = {
  ...THINGS,
  stretching: 'stretching on your own',
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

/** All of it in one row, a doctor included: "insoles, a doctor or physical therapist". Empty when she tried nothing. */
export function triedRow(a: Answers): string {
  return [...triedNouns(a), ...(sawSomeone(a) ? ['a doctor or physical therapist'] : [])].join(', ');
}

/**
 * Her time, as she chose it: "with my morning coffee, 5 minutes" once she has
 * picked the moment her minutes follow, and until then (or for a visitor from
 * before v7) "5 minutes a day, in a chair".
 */
export function herTime(a: Answers): string {
  // Only the first letter comes down: "before I get out of bed" keeps its "I".
  const label = a.anchor != null ? anchorLabel(a.anchor, a) : null;
  if (label != null) return `${label[0]!.toLowerCase()}${label.slice(1)}, ${a.minutes ?? 5} minutes`;
  return `${a.minutes ?? 5} minutes a day, ${START_LABEL[a.start ?? 'chair'].toLowerCase()}`;
}

/** What she said she has spent, as it reads after "You've spent". Nothing for "I'd rather not add it up" or no answer. */
export function spentSaid(a: Answers): string | null {
  const spent = spentOf(a);
  return spent === 'under100'
    ? 'less than $100'
    : spent === '100-500'
      ? 'between $100 and $500'
      : spent === '500-1000'
        ? 'more than $500'
        : spent === 'over1000'
          ? 'more than $1,000'
          : null;
}

export type Release = { title: string; lines: string[]; cta: string };

/**
 * After "What have you already tried?": built from her own ticks, so it is
 * never the same three things for everyone. What she bought helps for a while
 * and trains nothing; what she did on her own came with no plan. Neither is
 * her doing. A doctor or physical therapist is never part of that list.
 *
 * Short on purpose: with every box ticked and $500 spent it is 70 words, so
 * the whole card is in view over the button (words.test.ts counts them).
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
  else if (things.length > 2) lines.push(`You tried ${listOf(things)}. It all helps for a while. None of it makes your foot stronger.`);

  if (things.length > 0) {
    // Said second, in a line: her list above is already long.
    if (stretched && videos) lines.push('Stretching and videos came with no plan.');
    else if (stretched) lines.push('The stretching came with no plan.');
    else if (videos) lines.push('The videos came with no plan.');
  } else if (stretched && videos) lines.push('You stretched and followed videos on your own. Nobody told you which moves were yours, or when to move on.');
  else if (stretched) lines.push('You stretched on your own, with no plan to follow.');
  else if (videos) lines.push('You followed videos online, and nobody told you which moves were yours.');

  const own = lines.length > 0;
  if (own) lines.push('That part’s been missing. Your plan starts there.');
  if (sawSomeone(a)) lines.push('Keep your doctor or physical therapist. Use this on the days in between.');
  if (spentALot(a)) lines.push('After that much money, doubt is fair. You don’t have to believe this yet.');

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
  const spent = spentSaid(a);
  if (spent != null) out.push(`You’ve spent ${spent} on your feet so far.`);
  out.push(`You want something you can do ${WHERE[a.start ?? 'chair']}, in about ${a.minutes ?? 5} minutes a day.`);
  if (factsOf(a).safetyFlag) out.push('And because of what you told us, your first week stays seated.');
  return out;
}

// ── /s/28: her pattern ─────────────────────────────────────────────────────

/**
 * Why each scene happens, as something she did not cause and can change, and
 * what her plan does about it. About 50 words each. Nothing here says what she
 * has: the card calls it a description of her answers, and says it is not a
 * diagnosis. Never the competitors' story of a foot that is injured again
 * every morning, never her age, never her weight.
 */
const WHY: Readonly<Record<Scene, string[]>> = {
  morning: [
    'It’s one of the most common kinds, and it’s not something you did.',
    'While you sleep or sit, the tissue under your foot tightens up. Then the first steps ask it to hold you up, cold.',
    'A well-known trial timed its stretches for that exact moment, so your plan starts there.',
  ],
  shift: [
    'You’re not weak, and you’re not being dramatic.',
    'Hours on hard floors ask more of two feet than anything ever trained them for. Shoes and insoles soften the floor. Nothing trains the muscles holding you up.',
    'So your plan is made for after the shoes come off, with rest days built in.',
  ],
  walks: [
    'You didn’t give up on walking. Your feet stopped you.',
    'Then less walking left them a little weaker, and every walk cost more. That’s a loop, and willpower has nothing to do with it.',
    'Your plan starts at home, a few minutes at a time, and works back toward your walk.',
  ],
  steady: [
    'Balance starts in your feet, and almost nobody is ever told that.',
    'Feet that don’t get much practice lose some of their strength and feel. That comes down to practice, and practice is something you can start from a chair.',
    'Your plan starts easy, with something to hold whenever you stand.',
  ],
  sport: [
    'You kept training. Your feet never got training of their own to match.',
    'Resting it helps for a bit. Getting the foot stronger is what lasts.',
    'So your plan adds the foot work, a few minutes before or after your runs.',
  ],
  general: [
    'Most of what people try for sore feet cushions them or rests them. Very little trains them.',
    'Your plan is the training part, a few minutes a day.',
  ],
};

export type Pattern = { title: string; lines: string[] };

/**
 * The pay-off of the ticks: her pattern, named the way a neighbor would. The
 * count is of what she ticked; with nothing ticked the name comes from her
 * earlier answers and says so. "Nothing's broken" opens the general card only,
 * and never for someone who told us about a recent surgery or injury.
 */
export function patternOf(a: Answers): Pattern {
  const scene = sceneOf(a);
  const n = tickedCount(a);
  const name = patternName(a);
  const lines = [...WHY[scene]];
  if (scene === 'general' && !factsOf(a).safetyFlag) lines.unshift('Nothing’s broken. Your feet just haven’t been asked to do any work in years.');
  // For someone who has tried everything: what all of it had in common. The shift and general cards already say it.
  if (burned(a) && scene !== 'shift' && scene !== 'general')
    lines.push('The things you tried held your foot or soothed it. This is the part that makes the foot itself stronger.');
  return { title: n > 0 ? `You ticked ${n}. That’s ${name}.` : `From what you told us, it’s ${name}.`, lines };
}

// ── /s/31: her plan in one sentence ────────────────────────────────────────

/**
 * Her minutes tied to something she already does, in her own first person, for
 * her to read and agree to. Null until she has picked that moment (a visitor
 * from before v7): the screen then asks the old question instead.
 */
export function planSentence(a: Answers): string | null {
  if (a.anchor == null) return null;
  const mine = `my ${a.minutes ?? 5} minutes`;
  // Told us about something to plan around: her first week is seated, wherever she chose.
  const standing = a.start === 'standing' && !factsOf(a).safetyFlag;
  const place = a.start === 'bed' ? 'on the edge of the bed' : standing ? 'at the counter' : 'in my chair';
  switch (a.anchor) {
    case 'bed':
      return standing ? `Right after I get out of bed, I do ${mine} at the counter.` : `Before I get out of bed, I do ${mine} on the edge of it.`;
    case 'coffee':
      return `After I pour my morning coffee, I do ${mine} ${place}.`;
    case 'home':
      return `When I get home and the shoes come off, I do ${mine} ${place}.`;
    case 'show':
      return `When my evening show starts, I do ${mine} ${place}.`;
    case 'walk':
      return `Before my ${sceneOf(a) === 'sport' ? 'run' : 'walk'}, I do ${mine} ${place}.`;
  }
}

// ── /s/18: the price ───────────────────────────────────────────────────────

/**
 * One line that says these minutes and this money may be for her, by group:
 * the first that fits. It goes near the top of the price page and never right
 * above the button, where a kind word reads as a push.
 */
export function permissionLine(a: Answers): string {
  if (sceneOf(a) === 'shift') return `You look after everyone else all day. These ${a.minutes ?? 5} minutes are yours.`;
  if (sceneOf(a) === 'steady' || sixtyPlus(a)) return 'Your feet carried you everywhere. This is for them.';
  return 'You’d pay this for someone you love without thinking twice. You’re allowed to do it for you.';
}

/**
 * What is waiting the moment she pays: today's session, or what is left of it
 * after the move she did in the quiz. The count and the minutes are the ones
 * /s/start shows. "Sitting down" only when every one of these moves is.
 */
export function readyLine(moves: readonly Move[], minutes: number, begun: boolean): string {
  const seated = moves.length > 0 && moves.every((m) => m.seated) ? ', sitting down' : '';
  const about = `about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  if (!begun) return `Your first session is ready the moment you start. It’s ${about}${seated}.`;
  return `The rest of today’s session is ready the moment you start: ${moves.length === 1 ? 'one move' : `${moves.length} moves`}, ${about}${seated}.`;
}

/**
 * What she told us she has spent, next to what today costs: her own number,
 * never a "was" price of ours. Only for $100 or more; under that, or with no
 * answer, there is nothing of hers to set the price against.
 */
export function spentAnchor(a: Answers, today: string): string | null {
  const spent = spentSaid(a);
  if (spent == null || spentOf(a) === 'under100') return null;
  return `You told us you’ve spent ${spent} on your feet so far. This is ${today} to find out whether training them is the missing part. And you can have it back.`;
}

// ── Her next morning, on the plan page and the price ───────────────────────

/**
 * Her next morning in words: "Tomorrow, around 7:30 AM" and "about 13 hours
 * from now". Before 4 AM it is "This morning", by the server's own rule
 * (`nextMorning`). Without a wake time of hers there is no clock time to say
 * and no hours to count: we never print a time she did not give.
 */
export function morningOf(a: Answers, now: Date): { when: string; away: string | null; byEmail: boolean } {
  const next = nextMorning(now, wakeOf(a));
  if (a.wake == null || wakeOf(a) !== a.wake) return { when: next.tomorrow ? 'Tomorrow morning' : 'This morning', away: null, byEmail: next.byEmail };
  return {
    when: `${next.tomorrow ? 'Tomorrow' : 'This morning'}, around ${clockLabel(a.wake)}`,
    away: next.hours >= 1 ? `about ${next.hours} ${next.hours === 1 ? 'hour' : 'hours'} from now` : null,
    byEmail: next.byEmail,
  };
}

/**
 * The price page's one real clock: start today, and the first-step routine is
 * in her inbox on her next morning. Null when the email could not be out by
 * then (she is up within a few hours): the page then says something else.
 */
export function inboxLine(a: Answers, now: Date): string | null {
  const morning = morningOf(a, now);
  if (!morning.byEmail) return null;
  const when = morning.when[0]!.toLowerCase() + morning.when.slice(1);
  return `Start today and your first-step routine is in your inbox ${when}.${morning.away != null ? ` That’s ${morning.away}.` : ''}`;
}
