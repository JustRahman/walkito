import { describe, expect, test } from 'bun:test';

import type { Answers } from './state';
import { guessOf, listOf, NOT_QUITE, releaseOf, summaryOf, triedNouns } from './words';

/**
 * What is said back to her is put together from her answers, so no reader of
 * the source sees every sentence it can make. These tests make all of them.
 */
const FOCUS = ['heel', 'flat', 'allday', 'moving', 'steady', undefined] as const;
const WHEN = ['morning', 'sitting', 'evening', 'running', 'allday', 'varies', undefined] as const;
const SINCE = ['new', 'months', 'year', 'years', undefined] as const;
const START = ['chair', 'bed', 'standing', undefined] as const;
const SAFETY = ['none', 'numb', undefined] as const;
const TRIED_VALUES = ['stretching', 'insoles', 'pt', 'roller', 'videos'];

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
    expect(listOf(['new insoles or shoes', 'a roller or massage'])).toBe('new insoles or shoes, and a roller or massage');
    expect(listOf(['stretching on your own', 'new insoles or shoes', 'videos online'])).toBe('stretching on your own, new insoles or shoes, and videos online');
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

  test('what she tried: every set of ticks makes a card that reads', () => {
    for (const tried of TRIED) {
      const r = releaseOf({ tried });
      const where = JSON.stringify(tried);
      expect(r.lines.length, where).toBeGreaterThan(0);
      for (const text of [r.title, ...r.lines]) check(where, text);
      expect(r.cta, where).not.toBe('');
      // A doctor or physical therapist is never something that "helps for a while".
      expect(r.lines.filter((l) => /for a while|stronger/.test(l)).join(' '), where).not.toMatch(/doctor|therapist/);
    }
  });

  test('what she tried: built from her own ticks, never a fixed list', () => {
    expect(releaseOf({ tried: ['insoles'] })).toEqual({
      title: 'You didn’t do anything wrong.',
      lines: ['You tried new insoles or shoes. That helps for a while. It doesn’t make your foot any stronger.', 'That part’s been missing, and it’s where your plan starts.'],
      cta: 'Show me the part I haven’t tried',
    });
    expect(releaseOf({ tried: ['insoles', 'roller'] }).lines[0]).toBe(
      'You tried new insoles or shoes, and a roller or massage. Both help for a while. Neither one makes your foot any stronger.',
    );
    expect(releaseOf({ tried: ['stretching'] }).lines[0]).toBe('You stretched on your own, with no plan to follow.');
    expect(releaseOf({ tried: ['roller', 'videos'] }).lines[1]).toBe('You followed videos online too, and nobody told you which moves were yours.');
    // She saw someone: said after her own list, or on its own, and Walkito never replaces them.
    const both = releaseOf({ tried: ['stretching', 'pt'] });
    expect(both.title).toBe('You didn’t do anything wrong.');
    expect(both.lines.at(-1)).toStartWith('Walkito doesn’t replace your doctor or physical therapist.');
    const pt = releaseOf({ tried: ['pt'] });
    expect(pt.title).toBe('You did the right thing.');
    expect(pt.lines.length).toBe(1);
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
                const a: Answers = { focus, when, since, start, safety, tried };
                const sentences = summaryOf(a);
                const where = JSON.stringify(a);
                expect(sentences.length, where).toBeGreaterThan(0);
                for (const text of sentences) check(where, text);
                check(where, sentences.join(' '));
              }
  });

  test('the summary is her paragraph', () => {
    expect(
      summaryOf({ focus: 'heel', when: 'morning', since: 'year', tried: ['insoles', 'pt'], start: 'chair', safety: 'none', minutes: 5 }).join(' '),
    ).toBe(
      'Your heel bothers you most with the first steps of the morning. It’s been more than a year. You’ve tried new insoles or shoes, and you’ve seen a doctor or physical therapist. You want something you can do from a chair, in about 5 minutes a day.',
    );
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
});
