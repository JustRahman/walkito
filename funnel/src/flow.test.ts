import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { dayOf, nextWebEmail, type WebPerson } from '../../supabase/functions/_shared/web/sequence.ts';
import { ROUTES } from './App';
import { PRICE_OFFER, PRICE_VARIANTS, yearlyPerMonth, yearlySaving } from './config';
import {
  adOf,
  anchorsFor,
  burned,
  clockLabel,
  defaultPlan,
  goalLabels,
  goalsFor,
  lifeFor,
  mentionedGoals,
  minutesOf,
  missingStep,
  nextMorning,
  offerOf,
  MOVE_CAP,
  ORDER,
  paidFor,
  patternName,
  PLAN_NAME,
  planLine,
  planView,
  prevOf,
  remindAtFor,
  RETIRED,
  savedPlan,
  sceneOf,
  sectionOf,
  sessionOne,
  sixtyPlus,
  spentALot,
  spentOf,
  STEP,
  tickedCount,
  todayCount,
  WAKE_TIMES,
} from './flow';
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
    expect(sectionOf(STEP.spent)).toBe('About you');
    expect(sectionOf(STEP.anchor)).toBe('Your plan');
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
    expect(prevOf(STEP.commit)).toBe(STEP.anchor);
    expect(prevOf(STEP.anchor)).toBe(STEP.routine);
    expect(prevOf(STEP.me)).toBeNull();
    for (const path of ORDER.slice(1)) {
      expect(ORDER.indexOf(prevOf(path)!), path).toBeLessThan(ORDER.indexOf(path));
      expect(prevOf(path), path).not.toBe(STEP.building);
    }
  });

  test('the order is the one the founders approved: v6’s, with /s/39 after what she tried and /s/41 before her sentence', () => {
    expect(ORDER.join(' ')).toBe(
      '/s/1 /s/2 /s/3 /s/36 /s/21 /s/5 /s/39 /s/37 /s/22 /s/6 /s/7 /s/9 /s/38 /s/23 /s/28 /s/26 /s/11 /s/12 /s/32 /s/34 /s/35 /s/41 /s/31 /s/14 /s/20 /s/15 /s/16 /s/17 /s/18',
    );
  });

  test('what it cost is only asked of someone who paid for something, and Back passes over it for anyone else', () => {
    expect(paidFor(['stretching', 'videos'])).toBe(false);
    expect(paidFor(['nothing'])).toBe(false);
    expect(paidFor(undefined)).toBe(false);
    for (const paid of ['shoes', 'insoles', 'roller', 'pt', 'shot', 'splint']) expect(paidFor(['stretching', paid]), paid).toBe(true);
    expect(prevOf(STEP.heardTried, { tried: ['stretching'] })).toBe(STEP.tried);
    expect(prevOf(STEP.heardTried, { tried: ['nothing'] })).toBe(STEP.tried);
    expect(prevOf(STEP.heardTried, {})).toBe(STEP.tried);
    expect(prevOf(STEP.heardTried, { tried: ['insoles'] })).toBe(STEP.spent);
    expect(prevOf(STEP.spent, { tried: ['insoles'] })).toBe(STEP.tried);
    // She told us a figure, then went back and unticked everything she paid for: the figure is not hers any more.
    expect(spentOf({ tried: ['insoles'], spent: 'over1000' })).toBe('over1000');
    expect(spentOf({ tried: ['stretching'], spent: 'over1000' })).toBeUndefined();
    expect(spentALot({ tried: ['stretching'], spent: 'over1000' })).toBe(false);
    expect(spentALot({ tried: ['pt'], spent: '500-1000' })).toBe(true);
    expect(spentALot({ tried: ['pt'], spent: '100-500' })).toBe(false);
    expect(spentALot({ tried: ['pt'], spent: 'unsure' })).toBe(false);
  });

  test('no new answer is required: a visitor from before v7 is never sent back for one', () => {
    // Yesterday's stored state: v6's answers and nothing else, as an email's link to the price finds it.
    const yesterday = state(ANSWERS, { email: 'sam@example.com', verified: true, tryIt: { seconds: 60, felt: 'lighter' } });
    expect(yesterday.answers.spent).toBeUndefined();
    expect(yesterday.answers.anchor).toBeUndefined();
    for (const path of ORDER) expect(missingStep(path, yesterday), path).toBeNull();
    // The same with every tick of v6's on it.
    const full = state({ ...ANSWERS, tried: ['stretching', 'insoles', 'pt', 'roller', 'videos'], life: ['mornings', 'walks', 'shift', 'shoes', 'evening', 'runs'], goals: ['mornings', 'walk', 'shift', 'shoes', 'evenings', 'runs'] });
    expect(goalLabels(full.answers).length).toBe(6);
    expect(mentionedGoals(full.answers).length).toBeGreaterThan(3);
    expect(tickedCount(full.answers)).toBe(6);
    expect(goalsFor(full.answers).every((o) => typeof o.label === 'string' && o.label !== '')).toBe(true);
    expect(PLAN_NAME[sceneOf(full.answers)]).toBe('First Steps Plan');
  });

  test('an ad has a first screen of its own only under the utm_content its links carry', () => {
    expect(adOf(state(ANSWERS, { utm: { utm_content: 'ad1_plancard' } }))).toBe('ad1_plancard');
    expect(adOf(state(ANSWERS, { utm: { utm_content: 'ad2_v1morning' } }))).toBe('ad2_v1morning');
    expect(adOf(state(ANSWERS, { utm: { utm_content: 'ad3_receipt', utm_source: 'fb' } }))).toBe('ad3_receipt');
    // Anything else is the default screen: another ad, no ad, a visitor from before v7.
    expect(adOf(state(ANSWERS, { utm: { utm_content: 'ad4_new' } }))).toBeNull();
    expect(adOf(state(ANSWERS, { utm: { utm_source: 'fb' } }))).toBeNull();
    expect(adOf(state(ANSWERS))).toBeNull();
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

  test('the plan page’s week is seven days from today, with the move she tried first and done', () => {
    const now = new Date(2026, 10, 18, 9, 0);
    const tried = state(ANSWERS, { tryIt: { seconds: 60, felt: 'lighter' } });
    const view = planView(tried, now);
    expect(view.days.length).toBe(7);
    expect(view.days[0]!.label).toBe('Today');
    expect(view.days[0]!.rest).toBe(false);
    expect(view.days[0]!.moves[0]!.doneToday).toBe(true);
    expect(view.days[0]!.moves.filter((m) => m.doneToday).length).toBe(1);
    // "Not now" in the quiz: nothing is marked done.
    const skipped = planView(state(ANSWERS, { tryIt: { skipped: true } }), now);
    expect(skipped.days.flatMap((d) => d.moves).some((m) => m.doneToday)).toBe(false);
    // After payment she is offered what is left, never the move she did.
    const left = sessionOne(tried, now);
    expect(left.length).toBeGreaterThan(0);
    expect(left.some((m) => m.id === view.days[0]!.moves[0]!.id)).toBe(false);
  });

  test('after payment the session is the rest of today’s: "move 1 of N done" on the plan page is N - 1 moves left', () => {
    const now = new Date(2026, 10, 18, 9, 0);
    for (const focus of ['heel', 'steady', 'flat', 'allday', 'moving'] as const)
      for (const start of ['chair', 'bed', 'standing'] as const)
        for (const safety of ['none', 'numb', 'aid'] as const)
          for (const minutes of [3, 5, 10] as const) {
            const answers = { ...ANSWERS, focus, start, safety, minutes };
            const tried = state(answers, { tryIt: { seconds: 60 } });
            const today = planView(tried, now).days[0]!.moves;
            expect(sessionOne(tried, now).map((m) => m.id)).toEqual(today.slice(1).map((m) => m.id));
            expect(sessionOne(tried, now).length).toBe(todayCount(tried, now) - 1);
            // "Not now" in the quiz: nothing is done, so all of today is left.
            const skipped = state(answers, { tryIt: { skipped: true } });
            expect(sessionOne(skipped, now).length).toBe(todayCount(skipped, now));
            expect(sessionOne(skipped, now).length).toBeGreaterThan(0);
          }
    const two = sessionOne(state(ANSWERS, { tryIt: { seconds: 60 } }), now);
    expect(minutesOf(two)).toBe(Math.max(1, Math.round(two.reduce((sum, m) => sum + Math.min(MOVE_CAP, m.seconds), 0) / 60)));
    expect(minutesOf([])).toBe(1);
  });

  test('a wake time reads as a clock, for the hours she can tap and for an exact one', () => {
    expect(WAKE_TIMES.map((w) => clockLabel(w.value))).toEqual(['5:30 AM', '6:30 AM', '7:30 AM', '8:30 AM', '9:30 AM']);
    expect(clockLabel('12:05')).toBe('12:05 PM');
    expect(clockLabel('00:15')).toBe('12:15 AM');
  });

  test('her scene: the first rule that fits, and general when nothing does', () => {
    // A runner first, whatever else she said.
    expect(sceneOf({ day: 'run_short', focus: 'steady', when: 'morning' })).toBe('sport');
    expect(sceneOf({ day: 'run_long', focus: 'heel', when: 'evening' })).toBe('sport');
    // Then feeling unsteady, before any time of day.
    expect(sceneOf({ focus: 'steady', when: 'morning', day: 'feet' })).toBe('steady');
    // Then stiff after rest: the morning, or standing up after sitting.
    expect(sceneOf({ focus: 'heel', when: 'morning', day: 'feet' })).toBe('morning');
    expect(sceneOf({ focus: 'allday', when: 'sitting' })).toBe('morning');
    // Then the long day: on her feet, sore after a day on them, or by the evening.
    expect(sceneOf({ focus: 'heel', when: 'running', day: 'feet' })).toBe('shift');
    expect(sceneOf({ focus: 'allday', when: 'varies' })).toBe('shift');
    expect(sceneOf({ focus: 'flat', when: 'evening', day: 'sit8' })).toBe('shift');
    // Then her walks.
    expect(sceneOf({ focus: 'heel', when: 'running', day: 'sit4' })).toBe('walks');
    // Anything else, and anyone with answers missing.
    expect(sceneOf({ focus: 'moving', when: 'allday', day: 'sit8' })).toBe('general');
    expect(sceneOf({ focus: 'flat', when: 'varies' })).toBe('general');
    expect(sceneOf({})).toBe('general');
  });

  test('"tried everything" is a layer on any scene: three paid things, or a year and two things, or $500', () => {
    expect(burned({})).toBe(false);
    expect(burned({ tried: ['nothing'], since: 'years' })).toBe(false);
    expect(burned({ tried: ['shoes', 'insoles'], since: 'months' })).toBe(false);
    expect(burned({ tried: ['shoes', 'insoles', 'shot'], since: 'new' })).toBe(true);
    // Stretching and videos cost nothing, so three things with one paid is not it in the first year.
    expect(burned({ tried: ['stretching', 'videos', 'insoles'], since: 'months' })).toBe(false);
    expect(burned({ tried: ['stretching', 'videos'], since: 'year' })).toBe(true);
    expect(burned({ tried: ['stretching'], since: 'years' })).toBe(false);
    expect(burned({ tried: ['pt'], since: 'new', spent: '500-1000' })).toBe(true);
    expect(burned({ tried: ['pt'], since: 'new', spent: 'over1000' })).toBe(true);
    expect(burned({ tried: ['pt'], since: 'new', spent: '100-500' })).toBe(false);
    // An answer from before v7: "insoles or new shoes" is one thing.
    expect(burned({ tried: ['insoles', 'roller'], since: 'months' })).toBe(false);
  });

  test('each scene has its plan’s name, its pattern’s name and five private details; two more for someone who has tried everything', () => {
    const scenes: Array<[Answers, string, string, string]> = [
      [{ focus: 'heel', when: 'morning' }, 'First Steps Plan', 'the morning-stiff kind', 'I know the shortest way to the bathroom'],
      [{ focus: 'allday', when: 'evening', day: 'feet' }, 'Long-Day Feet Plan', 'the long-shift kind', 'By the last hours I’m counting down'],
      [{ focus: 'flat', when: 'evening', day: 'sit8' }, 'Long-Day Feet Plan', 'the long-day kind', 'When I get home I don’t want to move'],
      [{ focus: 'heel', when: 'running' }, 'Back to Your Walk Plan', 'the shrinking-walks kind', 'I’ve turned back halfway'],
      [{ focus: 'steady', when: 'varies' }, 'Steady Feet Plan', 'the watch-every-step kind', 'Nobody ever mentioned my feet'],
      [{ focus: 'heel', when: 'morning', day: 'run_short' }, 'Runner’s Feet', 'the runner’s kind', 'I cut my runs short'],
      [{ focus: 'moving', when: 'varies' }, 'Daily Feet Reset', 'the comes-and-goes kind', 'I’ve stopped mentioning it'],
    ];
    for (const [a, plan, pattern, line] of scenes) {
      expect(PLAN_NAME[sceneOf(a)], pattern).toBe(plan);
      expect(patternName(a)).toBe(pattern);
      const lines = lifeFor(a);
      expect(lines.length, pattern).toBe(5);
      expect(lines.some((o) => o.label === line), line).toBe(true);
      const more = lifeFor({ ...a, tried: ['shoes', 'insoles', 'shot'] });
      expect(more.length, pattern).toBe(7);
      expect(more.at(-2)!.label).toBe('I have a drawer of things that helped for two weeks');
    }
    // No stored value means two things.
    const values = scenes.flatMap(([a]) => lifeFor({ ...a, tried: ['shoes', 'insoles', 'shot'] }).map((o) => `${o.value}|${o.label}`));
    expect(new Set([...new Set(values)].map((v) => v.split('|')[0])).size).toBe(new Set(values).size);
  });

  test('her goals: six that fit her scene, what she mentioned first, kept in the order she tapped', () => {
    const morning: Answers = { focus: 'heel', when: 'morning', age: '60-69' };
    expect(goalsFor(morning).map((o) => o.value)).toEqual(['mornings', 'walk', 'stairs', 'shoes', 'trips', 'grandkids']);
    expect(goalsFor(morning)[0]!.label).toBe('Getting out of bed without bracing for it');
    // She ticked holding the wall (stairs) and walking like someone older (her walk): those two lead, and are marked.
    const ticked = goalsFor({ ...morning, life: ['wall', 'older'] });
    expect(ticked.map((o) => o.value)).toEqual(['stairs', 'walk', 'mornings', 'shoes', 'trips', 'grandkids']);
    expect(ticked.map((o) => o.mentioned)).toEqual([true, true, false, false, false, false]);
    // Grandkids are not put to someone under 50.
    expect(goalsFor({ ...morning, age: 'under50' }).some((o) => o.value === 'grandkids')).toBe(false);
    // The dog's walk is for the walks, the run for a runner.
    expect(goalsFor({ focus: 'heel', when: 'running' }).map((o) => o.value)).toContain('dog');
    expect(goalsFor({ focus: 'heel', when: 'running' }).some((o) => o.value === 'runs')).toBe(false);
    expect(goalsFor({ day: 'run_short' })[0]!.value).toBe('runs');
    // The first one she tapped is first, wherever it is in the list.
    expect(goalLabels({ goals: ['trips', 'mornings'] })).toEqual(['Trips and outings without planning around my feet', 'Getting out of bed without bracing for it']);
    expect(goalLabels({ goals: ['from_a_later_build', 'dog'] })).toEqual(['The dog’s whole walk']);
    expect(goalLabels({})).toEqual([]);
  });

  test('the moment her minutes follow: the same five for everyone, her scene’s likeliest first', () => {
    expect(anchorsFor({ focus: 'heel', when: 'morning' })[0]).toEqual({ value: 'bed', label: 'Before I get out of bed' });
    expect(anchorsFor({ day: 'feet' })[0]!.label).toBe('When I get home and the shoes come off');
    expect(anchorsFor({ when: 'running' })[0]!.label).toBe('Before my walk');
    expect(anchorsFor({ day: 'run_short' })[0]).toEqual({ value: 'walk', label: 'Before my run' });
    for (const a of [{}, { focus: 'steady' }, { day: 'feet' }, { day: 'run_long' }] as Answers[])
      expect(anchorsFor(a).map((o) => o.value).sort()).toEqual(['bed', 'coffee', 'home', 'show', 'walk']);
  });

  test('"move 1 of N" is the number of moves her plan page shows for today', () => {
    const now = new Date(2026, 10, 18, 9, 0);
    const tried = state(ANSWERS, { tryIt: { seconds: 60, felt: 'lighter' } });
    expect(todayCount(tried, now)).toBe(planView(tried, now).days[0]!.moves.length);
    expect(todayCount(tried, now)).toBeGreaterThan(1);
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

  test('the plan that is marked: hers if she has one, Monthly for everyone else, sixty and over and steady included', () => {
    const fifty: Answers = { ...ANSWERS, age: '50-59' };
    expect(defaultPlan(state(fifty))).toBe('monthly');
    expect(defaultPlan(state({ ...fifty, focus: 'steady' }))).toBe('monthly');
    for (const age of ['60-69', '70+', '65-74', '75+'] as const) {
      expect(sixtyPlus({ ...ANSWERS, age })).toBe(true);
      expect(defaultPlan(state({ ...ANSWERS, age }))).toBe('monthly');
    }
    // 55-64 was asked before v6 and may be 55; with no age at all she is not put in a group.
    for (const age of ['under50', '50-59', '55-64', 'under55', undefined] as const) {
      expect(sixtyPlus({ ...ANSWERS, age })).toBe(false);
      expect(defaultPlan(state({ ...ANSWERS, age }))).toBe('monthly');
    }
    expect(defaultPlan(state({}))).toBe('monthly');
    const tired: Answers = { ...ANSWERS, age: '70+', focus: 'steady', tried: ['insoles', 'shoes', 'shot'] };
    expect(burned(tired)).toBe(true);
    expect(defaultPlan(state(tired))).toBe('monthly');
    // A link's ?plan= (main.tsx stores it) or her own tap always wins, both ways.
    expect(defaultPlan(state(tired, { plan: 'yearly' }))).toBe('yearly');
    expect(defaultPlan(state({ ...ANSWERS, age: '70+' }, { plan: 'monthly' }))).toBe('monthly');
  });

  test('marking a plan for her is not her choosing it: plan_selected is sent from her tap and nowhere else', () => {
    const price = readFileSync(join(import.meta.dir, 'screens/price.tsx'), 'utf8');
    expect(price.match(/plan_selected/g)?.length).toBe(1);
    const choose = price.slice(price.indexOf('const choose = (id: PlanId) => {'), price.indexOf('const checkout = '));
    expect(choose.includes("track('plan_selected', { plan: id });")).toBe(true);
    expect(price.includes('useState<PlanId>(() => defaultPlan(s))')).toBe(true);
  });

  test('"each with a video": every move of every first week has one', () => {
    const now = new Date(2026, 10, 18, 9, 0);
    for (const focus of ['heel', 'steady', 'flat', 'allday', 'moving'] as const)
      for (const start of ['chair', 'standing'] as const)
        for (const safety of ['none', 'numb'] as const)
          for (const minutes of [3, 5, 10] as const)
            expect(planView(state({ ...ANSWERS, focus, start, safety, minutes }), now).days.flatMap((d) => d.moves).every((m) => m.clip != null)).toBe(true);
  });

  test('her next morning is the server’s: the day after she starts, at her wake time, and before 4 AM the same morning', () => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const evening = nextMorning(new Date(2026, 10, 19, 18, 30), '07:30');
    expect([localDay(evening.at), evening.tomorrow, evening.hours, evening.byEmail]).toEqual(['2026-11-20', true, 13, true]);
    const night = nextMorning(new Date(2026, 10, 20, 1, 30), '07:30');
    expect([localDay(night.at), night.tomorrow, night.hours, night.byEmail]).toEqual(['2026-11-20', false, 6, true]);
    // Up within the hour: the email cannot be out by then, so no page promises it.
    expect(nextMorning(new Date(2026, 10, 20, 3, 30), '04:15').byEmail).toBe(false);
    // Just past 4 AM her day has begun: the email is tomorrow's, as on the server.
    expect(nextMorning(new Date(2026, 10, 20, 4, 5), '07:30').hours).toBe(27);

    // Every half hour of two days (the night the clocks change in the US among them), against the server's own decision.
    for (const start of [new Date(2026, 10, 19, 0, 10), new Date(2026, 9, 31, 0, 10), new Date(2027, 2, 13, 0, 10)]) {
      for (let i = 0; i < 96; i++) {
        const now = new Date(start.getTime() + i * 30 * 60_000);
        for (const wake of ['05:30', '07:30', '09:30', '11:45']) {
          const next = nextMorning(now, wake);
          // The same day: the one after the day her purchase belongs to.
          const day1 = dayOf(now.toISOString(), zone);
          const [y, m, d] = day1.split('-').map(Number);
          expect(localDay(next.at)).toBe(localDay(new Date(y!, m! - 1, d! + 1)));
          expect(clockLabel(wake)).toBe(clockLabel(`${String(next.at.getHours()).padStart(2, '0')}:${String(next.at.getMinutes()).padStart(2, '0')}`));
          if (!next.byEmail) continue;
          // She pays now, the welcome goes within the quarter hour: the server sends the first-step email at that minute, and not before it.
          const person = (at: Date): WebPerson => ({
            userId: 'u',
            email: 'linda@example.com',
            zone,
            unsubscribed: false,
            checkoutOpenedAt: null,
            wakeTime: wake,
            customer: { productId: 'none', status: 'intro', periodEnd: null, introEndsAt: null, firstPurchaseAt: now.toISOString() },
            log: [{ key: 'web_welcome', sentAt: new Date(now.getTime() + 15 * 60_000).toISOString(), status: 'sent' }],
          });
          const just = (minutes: number) => new Date(next.at.getTime() + minutes * 60_000);
          expect(nextWebEmail(person(just(1)), just(1)).decision?.kind).toBe('web_morning');
          expect(nextWebEmail(person(just(-1)), just(-1)).decision).toBeNull();
        }
      }
    }
  });

  test('the $29.99 offer: shown once, still there at 11 PM, gone the next morning, never after a purchase', () => {
    const shownAt = new Date(2026, 10, 19, 14, 5);
    expect(offerOf({}, shownAt)).toBe('first');
    const shown = { offerShown: true, offerShownAt: shownAt.toISOString() };
    // The same day it is the same offer, still there: never a first showing again.
    expect(offerOf(shown, new Date(2026, 10, 19, 14, 6))).toBe('open');
    expect(offerOf(shown, new Date(2026, 10, 19, 23, 0))).toBe('open');
    expect(offerOf(shown, new Date(2026, 10, 19, 23, 59, 59))).toBe('open');
    // Midnight, the next morning, a week on, and the same date a month later.
    expect(offerOf(shown, new Date(2026, 10, 20, 0, 0, 0))).toBe('over');
    expect(offerOf(shown, new Date(2026, 10, 20, 8, 0))).toBe('over');
    expect(offerOf(shown, new Date(2026, 10, 26, 14, 5))).toBe('over');
    expect(offerOf(shown, new Date(2026, 11, 19, 14, 5))).toBe('over');
    // Shown a minute before midnight: one minute of it.
    const late = { offerShown: true, offerShownAt: new Date(2026, 10, 19, 23, 59).toISOString() };
    expect(offerOf(late, new Date(2026, 10, 19, 23, 59, 30))).toBe('open');
    expect(offerOf(late, new Date(2026, 10, 20, 0, 0, 1))).toBe('over');
    // Never after a purchase, shown before or not.
    expect(offerOf({ purchased: true }, shownAt)).toBe('over');
    expect(offerOf({ ...shown, purchased: true }, new Date(2026, 10, 19, 15, 0))).toBe('over');
    // v6 marked it shown and kept no time: for her it has ended. A time that cannot be read ends it too.
    expect(offerOf({ offerShown: true }, shownAt)).toBe('over');
    expect(offerOf({ offerShown: true, offerShownAt: 'yesterday' }, shownAt)).toBe('over');
  });

  test('the price page asks that rule before it shows the offer, counts the first showing only, and asks again at the tap', () => {
    const price = readFileSync(join(import.meta.dir, 'screens/price.tsx'), 'utf8');
    const show = price.slice(price.indexOf('const showOffer = (): void => {'), price.indexOf("/** The one-time offer's checkout"));
    expect(show.includes("const offer = offerOf(s, new Date());\n    if (!offerReady || offer === 'over') return;")).toBe(true);
    // An offer that is still open is put back on screen and nothing more: one stored time, one event.
    expect(show.indexOf("if (offer === 'open') return;")).toBeGreaterThan(0);
    expect(show.indexOf("if (offer === 'open') return;")).toBeLessThan(show.indexOf('update({ offerShown: true, offerShownAt: at })'));
    expect(price.match(/exit_gift_shown/g)?.length).toBe(1);
    expect(price.match(/offerShown: true/g)?.length).toBe(1);
    expect(price.includes("if (offerOf(s, new Date()) === 'over') return (setOfferShownNow(false), null);\n            return buyOffer(consentText);")).toBe(true);
    // The deadline lives in her browser only, so the page names none: no "midnight", no "tonight", no "expires".
    expect(price.includes('<p className="small">This offer is shown once.</p>')).toBe(true);
    const shown = price.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(/midnight|tonight|expires|ends today|left today/i.test(shown)).toBe(false);
  });

  test('after Day 1: her 0-10 number is saved only with her health consent, and a skip is never saved as a number', () => {
    const answers: Answers = { minutes: 5, focus: 'arch' };
    const agreed = { health: true, marketing: false };
    expect(savedPlan(state(answers, { consents: agreed, feeling: 'ok', firstSteps: 6, remindAt: 'morning', remindBy: 'email' }))).toEqual({
      minutes: 5,
      focus: 'arch',
      remindAt: 'morning',
      remindBy: 'email',
      feeling: 'ok',
      firstSteps: 6,
    });
    // Zero is an answer.
    expect(savedPlan(state(answers, { consents: agreed, firstSteps: 0 })).firstSteps).toBe(0);
    expect(savedPlan(state(answers, { consents: agreed, firstSteps: 'skipped' })).firstSteps).toBeUndefined();
    for (const consents of [undefined, { health: false, marketing: true }]) {
      const row = savedPlan(state(answers, { consents, feeling: 'hard', firstSteps: 8, remindAt: 'evening' }));
      expect([row.firstSteps, row.feeling, row.focus]).toEqual([undefined, undefined, undefined]);
      expect([row.minutes, row.remindAt]).toEqual([5, 'evening']);
    }
  });

  test('/s/start sends analytics four events and the number is in none of them', () => {
    const start = readFileSync(join(import.meta.dir, 'screens/start.tsx'), 'utf8');
    const calls = [...start.matchAll(/track\(([^;]*)\);/g)].map((m) => m[1]!);
    expect(calls.map((c) => c.split("'")[1]).sort()).toEqual(['access_confirmed', 'reminder_chosen', 'session1_completed', 'session1_started']);
    for (const call of calls) expect(/firstSteps|feeling/.test(call)).toBe(false);
    // The number goes two places only: this browser's state, and the plan row savedPlan guards.
    expect(start.match(/firstSteps: /g)?.length).toBe(2);
    expect(start.includes('void saveAnswers({ plan: savedPlan({ ...s, ...patch }) });')).toBe(true);
    const analytics = readFileSync(join(import.meta.dir, 'lib/analytics.ts'), 'utf8');
    expect(/first_?steps/i.test(analytics)).toBe(false);
  });

  test('the reminder’s time comes from the moment she picked: morning for bed and coffee, evening for home and her show, asked for a walk', () => {
    expect(remindAtFor({ anchor: 'bed' })).toBe('morning');
    expect(remindAtFor({ anchor: 'coffee' })).toBe('morning');
    expect(remindAtFor({ anchor: 'home' })).toBe('evening');
    expect(remindAtFor({ anchor: 'show' })).toBe('evening');
    expect(remindAtFor({ anchor: 'walk' })).toBeUndefined();
    // A visitor from before v7 never picked one: she is asked, as before.
    expect(remindAtFor({})).toBeUndefined();
  });

  test('/s/start leads with the rest of today’s session, and the app comes after it', () => {
    const start = readFileSync(join(import.meta.dir, 'screens/start.tsx'), 'utf8');
    const first = start.slice(start.indexOf('<h1>You’re in.</h1>'), start.indexOf('Move {index + 1} of {moves.length}'));
    expect(first.indexOf('today’s session:')).toBeGreaterThan(0);
    expect(first.indexOf('today’s session:')).toBeLessThan(first.indexOf('<GetTheApp'));
    expect(first.indexOf("{begun ? 'Finish today’s session' : 'Start today’s session'}")).toBeLessThan(first.indexOf('<GetTheApp'));
  });

  test('the prices are Rahman’s: $4.99 then $9.99 a month, $49.99 a year, $29.99 for the one offer', () => {
    const v = PRICE_VARIANTS.b!;
    expect([v.monthly.intro, v.monthly.price, v.yearly.price, PRICE_OFFER.intro, PRICE_OFFER.price]).toEqual([4.99, 9.99, 49.99, 29.99, 49.99]);
  });

  test('the year as a monthly figure is $4.17, as Ad 3 says it', () => {
    expect(yearlyPerMonth(PRICE_VARIANTS.b!)).toBe(4.17);
  });

  test('the yearly saving is the same twelve months paid monthly, less the year', () => {
    expect(yearlySaving(PRICE_VARIANTS.b!)).toBe(64.89);
    const dearer = { ...PRICE_VARIANTS.b!, yearly: { ...PRICE_VARIANTS.b!.yearly, price: 120 } };
    expect(yearlySaving(dearer)).toBeLessThan(0);
  });
});
