import { describe, expect, test } from 'bun:test';

import type { Answers } from './state';
import { guessOf, herTime, inboxLine, listOf, morningOf, NOT_QUITE, patternOf, permissionLine, planSentence, readyLine, releaseOf, spentAnchor, spentSaid, summaryOf, triedNouns, triedRow } from './words';

/**
 * What is said back to her is put together from her answers, so no reader of
 * the source sees every sentence it can make. These tests make all of them.
 */
const FOCUS = ['heel', 'flat', 'allday', 'moving', 'steady', undefined] as const;
const WHEN = ['morning', 'sitting', 'evening', 'running', 'allday', 'varies', undefined] as const;
const SINCE = ['new', 'months', 'year', 'years', undefined] as const;
const START = ['chair', 'bed', 'standing', undefined] as const;
const SAFETY = ['none', 'numb', undefined] as const;
const TRIED_VALUES = ['shoes', 'insoles', 'stretching', 'roller', 'pt', 'shot', 'splint', 'videos'];
const SPENT = ['under100', '100-500', '500-1000', 'over1000', 'unsure', undefined] as const;
const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** Every set of ticks on "What have you already tried?", "Nothing yet", no answer, and a value this build does not know. */
const TRIED: Array<string[] | undefined> = [
  undefined,
  [],
  ['nothing'],
  ['from_a_later_build'],
  ...Array.from({ length: 2 ** TRIED_VALUES.length - 1 }, (_, i) => TRIED_VALUES.filter((_, bit) => ((i + 1) >> bit) & 1)),
];

/** What a line of hers may never be, whatever she answered. */
function check(where: string, text: string): void {
  expect(text, where).not.toMatch(/undefined|null|NaN|\[object/);
  expect(text, where).not.toMatch(/ {2}|\.\.| \.| ,|,,/);
  expect(text, where).toMatch(/[.?!]$/);
  // No em dash, no promise, no diagnosis word, nothing about her age or her weight.
  expect(text, where).not.toMatch(/—|–/);
  expect(text, where).not.toMatch(/\b(cure|fix|heal|relie[fv]|pain-free|guarantee|damage|tear|plantar|fasciitis|your age|weight)/i);
  // The shape the copy test bans in the source, here in what the source builds.
  expect(text, where).not.toMatch(/\b(?:is|are|was|were)(?:n’t| not)\b[^.!?]{0,90}[.!?]\s+(?:It|That|This|They)(?:’s|’re| is| are| was)\b/);
  expect(text, where).not.toMatch(/\bnot (?:just|only)\b/i);
}

describe('what is said back to her', () => {
  test('a list reads as a person would say it', () => {
    expect(listOf([])).toBe('');
    expect(listOf(['a ball'])).toBe('a ball');
    expect(listOf(['insoles', 'a shot'])).toBe('insoles and a shot');
    expect(listOf(['insoles', 'a shot', 'a ball'])).toBe('insoles, a shot and a ball');
    // An "or" inside an item takes a comma before the "and".
    expect(listOf(['insoles', 'a roller or massage'])).toBe('insoles, and a roller or massage');
    expect(listOf(['special shoes', 'a roller or massage', 'videos online'])).toBe('special shoes, a roller or massage, and videos online');
  });

  test('the guess: every answer has one, with what her plan has for it', () => {
    for (const focus of FOCUS)
      for (const when of WHEN) {
        const g = guessOf({ focus, when });
        const where = `${focus} / ${when}`;
        for (const text of [g.guess, g.heard, g.plan, ...(g.more != null ? [g.more] : [])]) check(where, text);
        expect(g.heard, where).toStartWith('It sounds like ');
        expect(g.plan, where).toMatch(/^Your (plan|sessions) /);
      }
    check('not quite', NOT_QUITE);
  });

  test('the guess answers what she just tapped, and feeling unsteady has its own', () => {
    expect(guessOf({ focus: 'heel', when: 'morning' }).guess).toContain('Around step twenty it eases');
    expect(guessOf({ focus: 'allday', when: 'evening' }).guess).toContain('By mid-afternoon');
    expect(guessOf({ focus: 'flat', when: 'running' }).guess).toContain('the walks have been getting shorter');
    expect(guessOf({ focus: 'steady', when: 'morning' }).guess).toContain('watching your step');
    // A visitor with no answer yet (an old link) still gets a card that reads.
    expect(guessOf({}).guess).toContain('It comes and goes');
  });

  test('"1 in 10 adults" is a heel pain figure, so only someone whose answer was her heel sees it', () => {
    expect(guessOf({ focus: 'heel', when: 'morning' }).more).toContain('About 1 in 10 adults gets heel pain');
    for (const focus of FOCUS)
      for (const when of WHEN) {
        if (focus === 'heel' && when === 'morning') continue;
        expect(guessOf({ focus, when }).more ?? '', `${focus} / ${when}`).not.toContain('1 in 10');
      }
  });

  test('what she tried: every set of ticks and every figure makes a card that reads, and none runs past 70 words', () => {
    let longest = 0;
    for (const tried of TRIED)
      for (const spent of SPENT) {
        const r = releaseOf({ tried, spent });
        const where = JSON.stringify({ tried, spent });
        expect(r.lines.length, where).toBeGreaterThan(0);
        for (const text of [r.title, ...r.lines]) check(where, text);
        expect(r.cta, where).not.toBe('');
        // A doctor or physical therapist is never something that "helps for a while".
        expect(r.lines.filter((l) => /for a while|stronger/.test(l)).join(' '), where).not.toMatch(/doctor|therapist/);
        // The whole card has to be in view over its button on a phone.
        longest = Math.max(longest, words(r.lines.join(' ')));
        expect(words(r.lines.join(' ')), where).toBeLessThanOrEqual(70);
      }
    // The longest card is every box ticked and $500 or more: it is the one the screenshot measures.
    expect(words(releaseOf({ tried: TRIED_VALUES, spent: 'over1000' }).lines.join(' '))).toBe(longest);
  });

  test('what she tried: built from her own ticks, never a fixed list', () => {
    // The founders' own example, word for word.
    expect(releaseOf({ tried: ['insoles', 'shot'] })).toEqual({
      title: 'You didn’t do anything wrong.',
      lines: ['You tried insoles and a shot. Both help for a while. Neither one makes your foot any stronger.', 'That part’s been missing. Your plan starts there.'],
      cta: 'Show me the part I haven’t tried',
    });
    expect(releaseOf({ tried: ['shoes'] }).lines[0]).toBe('You tried special shoes. That helps for a while. It doesn’t make your foot any stronger.');
    expect(releaseOf({ tried: ['shoes', 'insoles'] }).lines[0]).toBe('You tried special shoes and insoles. Both help for a while. Neither one makes your foot any stronger.');
    expect(releaseOf({ tried: ['shoes', 'insoles', 'roller', 'shot', 'splint'] }).lines[0]).toBe(
      'You tried special shoes, insoles, a roller or massage, a shot, and a night splint. It all helps for a while. None of it makes your foot stronger.',
    );
    // A shot and a night splint are a tick each, so one is never said for the other.
    expect(releaseOf({ tried: ['splint'] }).lines[0]).toBe('You tried a night splint. That helps for a while. It doesn’t make your foot any stronger.');
    expect(releaseOf({ tried: ['shot'] }).lines.join(' ')).not.toContain('splint');
    // An answer stored before v7, when the tick was "Insoles or new shoes": insoles, and not a word about shoes.
    expect(releaseOf({ tried: ['insoles'] }).lines.join(' ')).not.toMatch(/shoe/i);
    // On her own: a line of its own, or one short line after a list.
    expect(releaseOf({ tried: ['stretching'] }).lines[0]).toBe('You stretched on your own, with no plan to follow.');
    expect(releaseOf({ tried: ['roller', 'videos'] }).lines[1]).toBe('The videos came with no plan.');
    expect(releaseOf({ tried: ['roller', 'videos', 'stretching'] }).lines[1]).toBe('Stretching and videos came with no plan.');
    // She saw someone: said after her own list, or on its own. Never told to stop.
    const both = releaseOf({ tried: ['stretching', 'pt'] });
    expect(both.title).toBe('You didn’t do anything wrong.');
    expect(both.lines.at(-1)).toBe('Keep your doctor or physical therapist. Use this on the days in between.');
    const pt = releaseOf({ tried: ['pt'] });
    expect(pt.title).toBe('You did the right thing.');
    expect(pt.lines.length).toBe(1);
    // $500 or more: she has every reason to doubt, and is told so. Under that, or declined, nothing is said.
    expect(releaseOf({ tried: ['insoles'], spent: 'over1000' }).lines.at(-1)).toBe('After that much money, doubt is fair. You don’t have to believe this yet.');
    expect(releaseOf({ tried: ['pt'], spent: '500-1000' }).lines.length).toBe(2);
    for (const spent of ['under100', '100-500', 'unsure'] as const) expect(releaseOf({ tried: ['insoles'], spent }).lines.join(' ')).not.toContain('money');
    // A figure left over from before she unticked everything she paid for is not used.
    expect(releaseOf({ tried: ['stretching'], spent: 'over1000' }).lines.join(' ')).not.toContain('money');
    // Nothing yet, no answer, or only an answer from a later build.
    for (const tried of [['nothing'], [], undefined, ['from_a_later_build']]) expect(releaseOf({ tried }).title).toBe('A good place to start.');
  });

  test('the summary: one sentence per answer, for every answer she can give', () => {
    for (const focus of FOCUS)
      for (const when of WHEN)
        for (const since of SINCE)
          for (const start of START)
            for (const safety of SAFETY)
              for (const tried of [undefined, ['nothing'], ['pt'], ['stretching', 'insoles'], TRIED_VALUES]) {
                const a: Answers = { focus, when, since, start, safety, tried, spent: SPENT[(tried?.length ?? 0) % SPENT.length] };
                const sentences = summaryOf(a);
                const where = JSON.stringify(a);
                expect(sentences.length, where).toBeGreaterThan(0);
                for (const text of sentences) check(where, text);
                check(where, sentences.join(' '));
              }
  });

  test('the summary is her paragraph', () => {
    expect(
      summaryOf({ focus: 'heel', when: 'morning', since: 'year', tried: ['insoles', 'shoes', 'shot', 'pt'], spent: '500-1000', start: 'chair', safety: 'none', minutes: 5 }).join(' '),
    ).toBe(
      'Your heel bothers you most with the first steps of the morning. It’s been more than a year. You’ve tried special shoes, insoles and a shot, and you’ve seen a doctor or physical therapist. You’ve spent more than $500 on your feet so far. You want something you can do from a chair, in about 5 minutes a day.',
    );
    // "I'd rather not add it up" is respected: no figure is said back.
    expect(summaryOf({ focus: 'heel', tried: ['insoles'], spent: 'unsure' }).join(' ')).not.toContain('spent');
    expect(summaryOf({ focus: 'steady', when: 'varies', since: 'new', tried: ['nothing'], start: 'standing', safety: 'dizzy', minutes: 3 }).join(' ')).toBe(
      'You feel unsteady on your feet on some days more than others. It started in the last 3 months. You haven’t tried anything for it yet. You want something you can do standing, with a hand on a counter, in about 3 minutes a day. And because of what you told us, your first week stays seated.',
    );
    // Yesterday's visitor, by a link, with nothing stored: still a sentence, never a gap.
    expect(summaryOf({})).toEqual(['You want something you can do from a chair, in about 5 minutes a day.']);
  });

  test('the list of what she tried leaves out a doctor, "Nothing yet" and anything unknown', () => {
    expect(triedNouns({ tried: ['pt', 'videos', 'stretching'] })).toEqual(['stretching on your own', 'videos online']);
    expect(triedNouns({ tried: ['nothing'] })).toEqual([]);
    expect(triedNouns({})).toEqual([]);
  });

  test('the loader and the plan page read back the same story: what she tried, and her time', () => {
    expect(triedRow({ tried: ['insoles', 'pt'] })).toBe('insoles, a doctor or physical therapist');
    expect(triedRow({ tried: ['nothing'] })).toBe('');
    expect(triedRow({})).toBe('');
    expect(herTime({ minutes: 10, start: 'bed' })).toBe('10 minutes a day, on the edge of the bed');
    expect(herTime({ minutes: 3, start: 'standing' })).toBe('3 minutes a day, standing, with a hand on a counter');
    // No answer stored: the plan's own defaults, as the engine uses them.
    expect(herTime({})).toBe('5 minutes a day, in a chair');
    // Once she has picked the moment her minutes follow, that is her time.
    expect(herTime({ minutes: 5, start: 'chair', anchor: 'coffee' })).toBe('with my morning coffee, 5 minutes');
    expect(herTime({ minutes: 10, anchor: 'walk', day: 'run_short' })).toBe('before my run, 10 minutes');
    expect(herTime({ minutes: 5, anchor: 'bed' })).toBe('before I get out of bed, 5 minutes');
    expect(herTime({ minutes: 5, anchor: 'home' })).toBe('when I get home and the shoes come off, 5 minutes');
  });

  test('what she spent is said back only as she gave it', () => {
    expect(SPENT.map((spent) => spentSaid({ tried: ['insoles'], spent }))).toEqual(['less than $100', 'between $100 and $500', 'more than $500', 'more than $1,000', null, null]);
    expect(spentSaid({ tried: ['stretching'], spent: 'over1000' })).toBeNull();
  });

  test('her pattern: every scene, with and without ticks, reads and stays short', () => {
    const scenes: Answers[] = [
      { focus: 'heel', when: 'morning' },
      { focus: 'allday', when: 'evening', day: 'feet' },
      { focus: 'flat', when: 'evening' },
      { focus: 'heel', when: 'running' },
      { focus: 'steady' },
      { day: 'run_short' },
      { focus: 'moving', when: 'varies' },
      {},
    ];
    for (const scene of scenes)
      for (const life of [undefined, ['none'], ['bathroom'], ['bathroom', 'wall', 'drawer']])
        for (const tried of [undefined, ['nothing'], ['shoes', 'insoles', 'shot']])
          for (const safety of ['none', 'surgery'] as const) {
            const a: Answers = { ...scene, life, tried, safety };
            const p = patternOf(a);
            const where = JSON.stringify(a);
            for (const text of [p.title, ...p.lines]) check(where, text);
            expect(words(p.lines.join(' ')), where).toBeLessThanOrEqual(72);
            expect(p.title, where).toMatch(/ kind\.$/);
            // Never what she has, never the story of a foot injured again each morning.
            expect(p.lines.join(' '), where).not.toMatch(/you have|diagnos|inflam|injur|degenerat|spur/i);
          }
  });

  test('her pattern: the count is hers, the name is her scene’s, and "Nothing’s broken" is never said after a surgery or an injury', () => {
    expect(patternOf({ focus: 'heel', when: 'morning', life: ['bathroom', 'wall', 'bed_edge'] }).title).toBe('You ticked 3. That’s the morning-stiff kind.');
    expect(patternOf({ focus: 'heel', when: 'morning', life: ['none'] }).title).toBe('From what you told us, it’s the morning-stiff kind.');
    expect(patternOf({ day: 'feet', life: ['countdown'] }).title).toBe('You ticked 1. That’s the long-shift kind.');
    expect(patternOf({ focus: 'moving', safety: 'none' }).lines[0]).toBe('Nothing’s broken. Your feet just haven’t been asked to do any work in years.');
    for (const safety of ['surgery', 'numb', 'dizzy', 'aid'] as const) expect(patternOf({ focus: 'moving', safety }).lines.join(' ')).not.toContain('broken');
    for (const scene of [{ when: 'morning' }, { day: 'feet' }, { when: 'running' }, { focus: 'steady' }, { day: 'run_short' }] as Answers[])
      expect(patternOf(scene).lines.join(' ')).not.toContain('broken');
    // Tried everything: one more line, where the card does not already say it.
    expect(patternOf({ when: 'morning', tried: ['shoes', 'insoles', 'shot'] }).lines.at(-1)).toBe('The things you tried held your foot or soothed it. This is the part that makes the foot itself stronger.');
    expect(patternOf({ when: 'morning', tried: ['shoes'] }).lines.join(' ')).not.toContain('The things you tried');
  });

  test('her plan in one sentence: her minutes, after something she already does, in the place she chose', () => {
    expect(planSentence({ anchor: 'coffee', minutes: 5, start: 'chair' })).toBe('After I pour my morning coffee, I do my 5 minutes in my chair.');
    expect(planSentence({ anchor: 'bed', minutes: 5, start: 'chair' })).toBe('Before I get out of bed, I do my 5 minutes on the edge of it.');
    expect(planSentence({ anchor: 'bed', minutes: 3, start: 'standing' })).toBe('Right after I get out of bed, I do my 3 minutes at the counter.');
    expect(planSentence({ anchor: 'home', minutes: 10, start: 'bed' })).toBe('When I get home and the shoes come off, I do my 10 minutes on the edge of the bed.');
    expect(planSentence({ anchor: 'show', start: 'standing' })).toBe('When my evening show starts, I do my 5 minutes at the counter.');
    expect(planSentence({ anchor: 'walk', day: 'run_short' })).toBe('Before my run, I do my 5 minutes in my chair.');
    // Something to plan around: her first week is seated, so the sentence never has her standing.
    expect(planSentence({ anchor: 'show', start: 'standing', safety: 'dizzy' })).toBe('When my evening show starts, I do my 5 minutes in my chair.');
    expect(planSentence({ anchor: 'bed', start: 'standing', safety: 'aid' })).toBe('Before I get out of bed, I do my 5 minutes on the edge of it.');
    // A visitor from before v7 has not picked a moment: no sentence, and the screen asks the old question.
    expect(planSentence({ minutes: 5, start: 'chair' })).toBeNull();
    for (const anchor of ['bed', 'coffee', 'home', 'show', 'walk'] as const)
      for (const start of START)
        for (const safety of SAFETY) check(`${anchor} / ${start} / ${safety}`, planSentence({ anchor, start, safety })!);
  });

  test('the price page’s kind line: hers by group, with her own minutes', () => {
    expect(permissionLine({ day: 'feet', minutes: 3 })).toBe('You look after everyone else all day. These 3 minutes are yours.');
    expect(permissionLine({ when: 'evening' })).toBe('You look after everyone else all day. These 5 minutes are yours.');
    expect(permissionLine({ focus: 'steady' })).toBe('Your feet carried you everywhere. This is for them.');
    expect(permissionLine({ when: 'morning', age: '70+' })).toBe('Your feet carried you everywhere. This is for them.');
    expect(permissionLine({ when: 'morning', age: '50-59' })).toBe('You’d pay this for someone you love without thinking twice. You’re allowed to do it for you.');
    expect(permissionLine({})).toBe('You’d pay this for someone you love without thinking twice. You’re allowed to do it for you.');
  });

  test('her spend beside today’s price: only a figure she gave, only from $100, and never without something she paid for', () => {
    expect(spentAnchor({ tried: ['insoles'], spent: 'over1000' }, '$4.99')).toBe(
      'You told us you’ve spent more than $1,000 on your feet so far. This is $4.99 to find out whether training them is the missing part. And you can have it back.',
    );
    expect(spentAnchor({ tried: ['shoes'], spent: '100-500' }, '$49.99')).toContain('spent between $100 and $500 on your feet so far. This is $49.99 to');
    expect(spentAnchor({ tried: ['shoes'], spent: '500-1000' }, '$4.99')).toContain('more than $500');
    for (const spent of ['under100', 'unsure', undefined] as const) expect(spentAnchor({ tried: ['shoes'], spent }, '$4.99')).toBeNull();
    // She went back and unticked everything that costs money: the figure is no longer hers.
    expect(spentAnchor({ tried: ['stretching'], spent: 'over1000' }, '$4.99')).toBeNull();
    for (const tried of TRIED)
      for (const spent of SPENT) {
        const line = spentAnchor({ tried, spent }, '$4.99');
        if (line != null) check(`${tried} / ${spent}`, line);
      }
  });

  test('what is waiting when she pays: the count and minutes /s/start shows, and "sitting down" only when every move is', () => {
    const move = (seated: boolean) => ({ id: 'x', title: '', cue: '', seated, seconds: 60, dose: '', clip: null, poster: '' });
    expect(readyLine([move(true), move(true)], 3, true)).toBe('The rest of today’s session is ready the moment you start: 2 moves, about 3 minutes, sitting down.');
    expect(readyLine([move(true)], 1, true)).toBe('The rest of today’s session is ready the moment you start: one move, about 1 minute, sitting down.');
    expect(readyLine([move(true), move(false)], 4, true)).toBe('The rest of today’s session is ready the moment you start: 2 moves, about 4 minutes.');
    expect(readyLine([move(true), move(true), move(true)], 5, false)).toBe('Your first session is ready the moment you start. It’s about 5 minutes, sitting down.');
    expect(readyLine([move(false)], 2, false)).toBe('Your first session is ready the moment you start. It’s about 2 minutes.');
  });

  test('her next morning: the time she gave, hours and never minutes, and no promise the email cannot keep', () => {
    const evening = new Date(2026, 10, 19, 18, 30);
    expect(morningOf({ wake: '07:30' }, evening)).toEqual({ when: 'Tomorrow, around 7:30 AM', away: 'about 13 hours from now', byEmail: true });
    expect(inboxLine({ wake: '07:30' }, evening)).toBe('Start today and your first-step routine is in your inbox tomorrow, around 7:30 AM. That’s about 13 hours from now.');
    // Before 4 AM her next morning is this one.
    const night = new Date(2026, 10, 20, 1, 30);
    expect(morningOf({ wake: '05:30' }, night)).toEqual({ when: 'This morning, around 5:30 AM', away: 'about 4 hours from now', byEmail: true });
    expect(inboxLine({ wake: '05:30' }, night)).toBe('Start today and your first-step routine is in your inbox this morning, around 5:30 AM. That’s about 4 hours from now.');
    // Up in an hour: the plan page still says when, the price page does not promise an email by then.
    expect(morningOf({ wake: '05:30' }, new Date(2026, 10, 20, 3, 45)).away).toBe('about 2 hours from now');
    expect(morningOf({ wake: '04:30' }, new Date(2026, 10, 20, 3, 20)).away).toBe('about 1 hour from now');
    expect(inboxLine({ wake: '05:30' }, new Date(2026, 10, 20, 3, 45))).toBeNull();
    // No wake time of hers (a visitor from before the question, or "Not now"): no clock time and no hours.
    expect(morningOf({}, evening)).toEqual({ when: 'Tomorrow morning', away: null, byEmail: true });
    expect(inboxLine({}, evening)).toBe('Start today and your first-step routine is in your inbox tomorrow morning.');
    expect(morningOf({ wake: 'soon' }, night).when).toBe('This morning');
    for (let hour = 0; hour < 24; hour++)
      for (const wake of ['05:30', '06:30', '07:30', '08:30', '09:30', '12:05', undefined]) {
        const line = inboxLine({ wake }, new Date(2026, 10, 19, hour, 20));
        if (line != null) check(`${hour}:20 / ${wake}`, line);
        expect(line ?? '', `${hour}:20 / ${wake}`).not.toMatch(/minute|second|\b0 hours|-\d/);
      }
  });
});
