import { describe, expect, test } from 'bun:test';

import { ROUTES } from './App';
import { PRICE_OFFER, PRICE_VARIANTS, yearlySaving } from './config';
import { lifeFor, mentionedGoals, missingStep, ORDER, planLine, prevOf, RETIRED, sectionOf, STEP } from './flow';
import type { Answers, FunnelState } from './state';

const ANSWERS: Answers = {
  age: '55-64',
  focus: 'heel',
  when: 'morning',
  since: 'new',
  tried: ['nothing'],
  day: 'sit8',
  start: 'chair',
  safety: 'none',
  minutes: 5,
  life: ['mornings', 'shoes'],
  goals: ['walk'],
};

const state = (answers: Answers, rest: Partial<FunnelState> = {}): FunnelState => ({ answers, tryIt: {}, variant: 'b', ...rest });

/** She stopped after each question in turn: no answers, the first one, the first two… */
const PARTWAY = Object.keys(ANSWERS).map((_, i, keys) => state(Object.fromEntries(keys.slice(0, i).map((k) => [k, ANSWERS[k as keyof Answers]]))));

describe('the funnel’s paths', () => {
  test('every step in the order has a path of its own', () => {
    expect(new Set(ORDER).size).toBe(ORDER.length);
  });

  test('a path says nothing about feet or health: /s/<number>', () => {
    for (const path of ORDER) expect(path).toMatch(/^\/s\/\d+$/);
  });

  test('every step has a screen', () => {
    for (const path of [...ORDER, ...Object.values(STEP)]) expect(ROUTES[path] != null, path).toBe(true);
  });

  test('the paths that emails and the account pages link to stay where they are', () => {
    expect(STEP.price).toBe('/s/18');
    expect(STEP.start1).toBe('/s/start');
    expect(STEP.me).toBe('/s/me');
    expect(STEP.cancel).toBe('/s/cancel');
  });

  test('a visitor without an earlier answer is sent back to a step that exists, never forward', () => {
    let sent = 0;
    for (const s of [...PARTWAY, state(ANSWERS), state(ANSWERS, { email: 'sam@example.com' })])
      for (const path of ORDER) {
        const to = missingStep(path, s);
        if (to == null) continue;
        sent += 1;
        expect(ROUTES[to] != null, `${path} -> ${to}`).toBe(true);
        expect(ORDER.includes(to), `${path} -> ${to}`).toBe(true);
        expect(ORDER.indexOf(to), `${path} -> ${to}`).toBeLessThan(ORDER.indexOf(path));
      }
    expect(sent).toBeGreaterThan(ORDER.length);
  });

  test('every step is in one of the four parts named over the progress bar', () => {
    for (const path of ORDER) expect(sectionOf(path), path).not.toBeNull();
    expect(sectionOf(STEP.focus)).toBe('About you');
    expect(sectionOf('/s/7/note')).toBe('About you');
    expect(sectionOf(STEP.summary)).toBe('About you');
    expect(sectionOf(STEP.life)).toBe('Your goals');
    expect(sectionOf(STEP.goals)).toBe('Your goals');
    expect(sectionOf(STEP.move)).toBe('Your first move');
    expect(sectionOf(STEP.felt)).toBe('Your first move');
    expect(sectionOf(STEP.wake)).toBe('Your plan');
    expect(sectionOf(STEP.email)).toBe('Your plan');
    expect(sectionOf(STEP.me)).toBeNull();
    expect(sectionOf('/terms')).toBeNull();
  });

  test('a path the quiz no longer has sends its visitor to a step that exists, never to screen 1', () => {
    for (const [old, to] of Object.entries(RETIRED)) {
      expect(ROUTES[old], old).toBeUndefined();
      expect(ORDER.includes(old), old).toBe(false);
      expect(ORDER.includes(to), `${old} -> ${to}`).toBe(true);
      expect(to, old).not.toBe(STEP.age);
    }
    // Every path v5 had is either still a screen or redirected.
    for (const n of [1, 2, 3, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 21, 22, 23, 24, 25, 26, 28, 29, 30, 31, 32, 33, 34, 35]) {
      const path = `/s/${n}`;
      expect(ROUTES[path] != null || RETIRED[path] != null, path).toBe(true);
    }
  });

  test('Back is the step before, never the loader, and nothing on the first screen', () => {
    expect(prevOf(STEP.age)).toBeNull();
    expect(prevOf(STEP.focus)).toBe(STEP.age);
    expect(prevOf('/s/7/note')).toBe(STEP.safety);
    expect(prevOf(STEP.wake)).toBe(STEP.felt);
    expect(prevOf(STEP.name)).toBe(STEP.commit);
    expect(prevOf(STEP.me)).toBeNull();
    for (const path of ORDER.slice(1)) {
      expect(ORDER.indexOf(prevOf(path)!), path).toBeLessThan(ORDER.indexOf(path));
      expect(prevOf(path), path).not.toBe(STEP.building);
    }
  });

  test('the order is the one the founders approved', () => {
    expect(ORDER.join(' ')).toBe(
      '/s/1 /s/2 /s/3 /s/36 /s/21 /s/5 /s/37 /s/22 /s/6 /s/7 /s/9 /s/38 /s/23 /s/28 /s/26 /s/11 /s/12 /s/32 /s/34 /s/35 /s/31 /s/14 /s/20 /s/15 /s/16 /s/17 /s/18',
    );
  });

  test('the price needs her email, and the code where one was sent', () => {
    expect(missingStep(STEP.price, state(ANSWERS))).toBe(STEP.email);
    expect(missingStep(STEP.price, state(ANSWERS, { email: 'sam@example.com' }))).toBe(STEP.code);
    expect(missingStep(STEP.price, state(ANSWERS, { email: 'sam@example.com', verified: true }))).toBeNull();
  });
});

describe('what the plan and the price say', () => {
  test('the plan has no length', () => {
    expect(planLine(ANSWERS)).toBe('5 min a day · seated');
    expect(planLine({ ...ANSWERS, start: 'standing', minutes: 10 })).toBe('10 min a day · standing');
  });

  test('running is only asked of a runner', () => {
    expect(lifeFor(ANSWERS).some((o) => o.value === 'runs')).toBe(false);
    expect(lifeFor({ ...ANSWERS, day: 'run_short' }).some((o) => o.value === 'runs')).toBe(true);
    expect(lifeFor({ ...ANSWERS, day: 'run_long' }).some((o) => o.value === 'runs')).toBe(true);
  });

  test('her goals are listed from what she mentioned, and the list is empty when she mentioned nothing', () => {
    expect(mentionedGoals(ANSWERS)).toEqual(['mornings', 'shoes']);
    expect(mentionedGoals({ ...ANSWERS, life: ['none'] })).toEqual([]);
  });

  test('the prices are Rahman’s: $4.99 then $9.99 a month, $49.99 a year, $29.99 for the one offer', () => {
    const v = PRICE_VARIANTS.b!;
    expect([v.monthly.intro, v.monthly.price, v.yearly.price, PRICE_OFFER.intro, PRICE_OFFER.price]).toEqual([4.99, 9.99, 49.99, 29.99, 49.99]);
  });

  test('the yearly saving is the same twelve months paid monthly, less the year', () => {
    expect(yearlySaving(PRICE_VARIANTS.b!)).toBe(64.89);
    const dearer = { ...PRICE_VARIANTS.b!, yearly: { ...PRICE_VARIANTS.b!.yearly, price: 120 } };
    expect(yearlySaving(dearer)).toBeLessThan(0);
  });
});
