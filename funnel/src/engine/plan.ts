import { EQUIPMENT, planMeta } from '@app/entities/program/model/plan/catalogue-meta';
import { doseSeconds } from '@app/entities/program/model/plan/dose';
import { MAX_ACTIVE_GOALS } from '@app/entities/program/model/plan/goals';
import { goalsForOutcome, outcomeFor } from '@app/entities/program/model/plan/outcome';
import {
  DEFAULT_LEVELS,
  buildWeek,
  type PlanDay,
  type PlannedExercise,
  type WeekPlan,
} from '@app/entities/program/model/plan/week';
import { exerciseById } from '@app/entities/program/model/exercises';
import { doseLabel } from '@app/entities/program/model/prescription';
import { CLIPS } from '@app/shared/config/clip-manifest';

import { toDateKey } from './shims/state';

/** Vite's base ("/go/"), or "/" under the Bun tests. */
const ASSETS: string = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

export type Focus = 'heel' | 'steady' | 'flat' | 'allday' | 'moving';

export type PlanFacts = {
  focus: Focus;
  /** Any answer on the "plan around" screen except "none". */
  safetyFlag: boolean;
  /** Numbness or swelling: no hopping, no balancing with eyes closed. */
  numb: boolean;
  /** Starts in a chair or on the bed. */
  seated: boolean;
  minutes: 3 | 5 | 10;
};

/** What the onboarding's goal question would have been for each focus. */
const GOAL: Readonly<Record<Focus, string | null>> = {
  heel: null,
  steady: 'steady',
  flat: 'flatfeet',
  allday: 'allday',
  moving: null,
};

/**
 * The first week, built by the app's own engine from what she told us, as the
 * app builds it on the first day: week one (settling), nothing at home, seated
 * only when she starts seated or named something to plan around.
 *
 * The week is laid from today rather than from Monday, so Day 1 is always
 * today and always a training day: the funnel ends with "Start Day 1 now",
 * which a Sunday visitor could not do on the app's Monday-based shape.
 * `PlanDay.weekday` is then the day's index from today, not Monday-based.
 */
export function firstWeek(facts: PlanFacts, now: Date = new Date()): WeekPlan {
  const today = toDateKey(now);
  const outcome = outcomeFor(
    { goal: GOAL[facts.focus], sport: null, areas: facts.focus === 'heel' ? ['heel'] : [], rigidFoot: false },
    today,
  );
  const goals = goalsForOutcome(outcome, [], today, MAX_ACTIVE_GOALS);
  return buildWeek({
    weekStart: today,
    weekIndex: 1,
    today,
    planStart: today,
    goals,
    steps: outcome.steps,
    daysPerWeek: 5,
    defaultMinutes: facts.minutes,
    eligibility: {
      clips: new Set(Object.keys(CLIPS)),
      equipmentMissing: [...EQUIPMENT],
      cantDo: new Set(),
      painLast14: [],
      shortFootStandingSessions: 0,
      ...(facts.seated || facts.safetyFlag ? { seatedOnly: true } : {}),
      ...(facts.numb ? { protectFeet: true } : {}),
    },
    levels: { ...DEFAULT_LEVELS },
    lastWeekFeedback: [],
    painLastWeek: [],
    painWeekBefore: [],
    painStart: null,
    previousFocus: null,
    seenBefore: null,
    testDue: null,
  });
}

export type Move = {
  id: string;
  title: string;
  cue: string;
  seated: boolean;
  /** Seconds the dose takes. */
  seconds: number;
  /** "10 × 10 s each side", in words. */
  dose: string;
  clip: string | null;
  poster: string;
};

export function moveOf(item: Pick<PlannedExercise, 'id' | 'dose'> | { id: string; dose?: PlannedExercise['dose'] }): Move {
  const exercise = exerciseById(item.id);
  const dose = item.dose;
  return {
    id: item.id,
    title: exercise.title,
    cue: exercise.cue,
    seated: planMeta(item.id)?.position === 'seated',
    seconds: dose != null ? Math.round(doseSeconds(dose)) : 60,
    dose: dose != null ? doseLabel(dose.sets, dose.reps, dose.holdSec, dose.perSide) : '',
    clip: CLIPS[item.id] != null ? `${ASSETS}clips/${item.id}.mp4` : null,
    poster: `${ASSETS}posters/${item.id}.webp`,
  };
}

/** The day of the week that is today, from a built week. */
export function todayOf(week: WeekPlan, now: Date = new Date()): PlanDay | undefined {
  const key = toDateKey(now);
  return week.days.find((day) => day.date === key);
}

/** The move she tries in the funnel: seated, and the one her plan opens on. */
export const TRY_MOVE: Readonly<Record<Focus, string>> = {
  heel: 'fascia_stretch',
  steady: 'short_foot_seated',
  flat: 'short_foot_seated',
  allday: 'fascia_stretch',
  moving: 'fascia_stretch',
};
