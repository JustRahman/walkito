import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The quiz's copy is written where it is shown, in the screens, so this reads
 * the source as a reviewer would: every line of every file that can hold a
 * word she reads, comments left out. A health ad may not promise a result, so
 * none of the words below may appear, in any tense.
 *
 * Not read: the app's own engine and exercise catalogue, the generated icons,
 * Rahim's placeholder texts (never in a production build: preview.test.ts),
 * and the legal pages, which say what is kept and refunded in their own words.
 */
const SRC = import.meta.dir;
const SKIP = /\.test\.ts$|^icons\.gen\.ts$|^engine\/|^preview\/|^screens\/legal\.tsx$/;

const RULES: ReadonlyArray<[rule: string, pattern: RegExp]> = [
  ['a cure', /\bcur(e|es|ed|ing)\b/i],
  ['a fix', /\bfix(es|ed|ing)?\b/i],
  ['healing', /\bheal(s|ed|ing)?\b/i],
  ['relief', /\b(reliev(e|es|ed|ing)|relief)\b/i],
  ['pain-free', /\bpain[- ]?free\b/i],
  ['a result by a date', /\b(in|after) (just |only )?(\d+|a few|a couple of|one|two|three|four|six|eight|twelve) (day|week|month)s?\b/i],
  ['a length for the plan', /\b\d+[- ]weeks?\b|\bweeks \d/i],
  ['before and after', /\bbefore ?(and|&|\/|-) ?after\b/i],
  ['more than two words in capitals', /\b[A-Z]{2,}(?: [A-Z]{2,}){2,}\b/],
];

/** "Guarantee" belongs to the refund and to nothing else. */
const GUARANTEE = /\bguarantee[sd]?\b/i;
const REFUND_LINE = /money-back/;

/** Lines taken out for v6 (Nov 18, 2026). None may come back. */
const RETIRED = [
  'women across the US',
  '1,000+ women',
  'Foot pain changes your whole day',
  'Lighter, looser',
  'A little better',
  'feet waking up',
  'working toward',
  'redo your first move',
  'Helped with my heel pain',
  'A gift just for you',
  'per day',
  'weakens your feet',
  'not your fault',
  'it can change',
  'Day 1 of your plan is done',
  'Member since',
  'peek at your plan',
  'start Day 1 right here',
  'A short session every day',
];

type Line = { where: string; text: string };

function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, '')).replace(/(^|\s)\/\/.*$/gm, '$1');
}

function linesOf(name: string, text: string): Line[] {
  return text.split('\n').map((line, i) => ({ where: `${name}:${i + 1}`, text: line.trim() }));
}

const LINES: Line[] = [
  ...readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((name) => /\.tsx?$/.test(name) && !SKIP.test(name))
    .sort()
    .flatMap((name) => linesOf(name, withoutComments(readFileSync(join(SRC, name), 'utf8')))),
  ...linesOf('index.html', readFileSync(join(SRC, '../index.html'), 'utf8')),
];

describe('the quiz’s copy', () => {
  test('the screens are read', () => {
    expect(LINES.some((l) => l.where.startsWith('screens/price.tsx'))).toBe(true);
    expect(LINES.length).toBeGreaterThan(2000);
  });

  for (const [rule, pattern] of RULES)
    test(`never ${rule}`, () => {
      expect(LINES.filter((l) => pattern.test(l.text)).map((l) => `${l.where}: ${l.text}`)).toEqual([]);
    });

  test('"guarantee" only on the money-back line', () => {
    expect(LINES.filter((l) => GUARANTEE.test(l.text) && !REFUND_LINE.test(l.text)).map((l) => `${l.where}: ${l.text}`)).toEqual([]);
  });

  test('no line retired for v6 is back', () => {
    const back = RETIRED.flatMap((retired) =>
      LINES.filter((l) => l.text.toLowerCase().includes(retired.toLowerCase())).map((l) => `${l.where}: ${retired}`),
    );
    expect(back).toEqual([]);
  });
});

/**
 * Two rules of the look that a stylesheet can break without a word of copy
 * changing: sentence case typed in a screen and set in capitals by CSS, and
 * text too small for the people reading it.
 */
const CSS = linesOf('styles.css', withoutComments(readFileSync(join(SRC, 'styles.css'), 'utf8')));
const MIN_PX = 15;

describe('the quiz’s type', () => {
  test('nothing is set in capitals', () => {
    expect(CSS.filter((l) => /text-transform\s*:\s*uppercase|small-caps/i.test(l.text)).map((l) => `${l.where}: ${l.text}`)).toEqual([]);
  });

  test(`no text is under ${MIN_PX}px`, () => {
    const sizes = CSS.flatMap((l) => [...l.text.matchAll(/font-size\s*:\s*([^;}]+)/g)].map((m) => ({ where: l.where, value: m[1]!.trim() })));
    expect(sizes.length).toBeGreaterThan(30);
    const small = sizes.filter(({ value }) => {
      const m = value.match(/^([\d.]+)(rem|px)$/);
      // Anything but rem or px (em, %, clamp) cannot be checked here, so it is not allowed.
      return m == null || Number(m[1]) * (m[2] === 'rem' ? 16 : 1) < MIN_PX;
    });
    expect(small.map((s) => `${s.where}: ${s.value}`)).toEqual([]);
  });

  test('a size or a case is never set in a screen, where the two tests above cannot see it', () => {
    expect(LINES.filter((l) => /fontSize|textTransform|fontVariant/.test(l.text)).map((l) => `${l.where}: ${l.text}`)).toEqual([]);
  });
});
