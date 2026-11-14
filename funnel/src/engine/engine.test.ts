import { describe, expect, test } from 'bun:test';

import * as app from '@app/entities/program/model/plan/week';
import { firstWeek, moveOf, todayOf, TRY_MOVE, type Focus } from './plan';
import * as shim from './shims/state';

const NOW = new Date(2026, 10, 18, 20, 0);

describe('the plan engine in the browser', () => {
  test('the date helpers match the app (addDays and weekStartOf use them)', () => {
    expect(shim.toDateKey(NOW)).toBe('2026-11-18');
    expect(shim.daysBetween('2026-11-01', '2026-11-18')).toBe(17);
    expect(app.addDays('2026-11-18', 3)).toBe('2026-11-21');
    expect(app.weekStartOf('2026-11-18')).toBe('2026-11-16');
  });

  for (const focus of ['heel', 'steady', 'flat', 'allday', 'moving'] as Focus[]) {
    test(`${focus}: a first week with today in it and playable moves`, () => {
      const week = firstWeek({ focus, safetyFlag: false, numb: false, seated: true, minutes: 5 }, NOW);
      expect(week.weekIndex).toBe(1);
      const today = todayOf(week, NOW);
      expect(today).toBeDefined();
      for (const day of week.days) for (const e of day.exercises) expect(moveOf(e).clip).not.toBeNull();
      expect(moveOf({ id: TRY_MOVE[focus] }).seated).toBe(true);
    });
  }

  test('seated start keeps week one seated', () => {
    const week = firstWeek({ focus: 'steady', safetyFlag: true, numb: true, seated: true, minutes: 5 }, NOW);
    for (const day of week.days) for (const e of day.exercises) expect(moveOf(e).seated).toBe(true);
  });

  test('Day 1 is today and has moves, whatever the weekday', () => {
    for (let offset = 0; offset < 7; offset++) {
      const now = new Date(2026, 10, 16 + offset, 9, 0);
      const week = firstWeek({ focus: 'heel', safetyFlag: false, numb: false, seated: true, minutes: 5 }, now);
      const today = todayOf(week, now);
      expect(today?.date).toBe(shim.toDateKey(now));
      expect(today?.exercises.length).toBeGreaterThan(0);
      expect(week.days.filter((d) => d.exercises.length > 0).length).toBe(5);
    }
  });

  test('exercise names come from the app catalogue', () => {
    expect(moveOf({ id: 'fascia_stretch' }).title).toBe('Plantar stretch');
  });
});
