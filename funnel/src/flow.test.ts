import { describe, expect, test } from 'bun:test';

import { ROUTES } from './App';
import { PRICE_OFFER, PRICE_VARIANTS, yearlySaving } from './config';
import { mentionedGoals, missingStep, ORDER, planLine, STEP } from './flow';
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
