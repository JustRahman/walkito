import { resolveDay, type ResolvedDay } from './adapt';
import { blockFor } from './blocks';
import { kindFor } from './day-templates';
import {
  currentDay,
  daysSinceLastSession,
  hoursBaseline,
  hoursOnFeetOn,
  painAverage,
  painOn,
  programState,
} from './state';

/**
 * Today's plan after the morning check-in has had its say.
 *
 * One place, so Home's task list and the Program screen's session always agree:
 * log a flare and both get the short offload day, not one of them the template.
 * Null past the final block, where maintenance supplies its own schedule.
 */
export function resolveToday(): ResolvedDay | null {
  const dayNumber = currentDay();
  const state = programState();
  const block = blockFor(dayNumber, state.planLength);
  if (block == null) return null;

  return resolveDay({
    dayNumber,
    block,
    kind: kindFor(dayNumber),
    painToday: painOn(dayNumber),
    pain7dAvg: painAverage(dayNumber, 7),
    hoursOnFeetYesterday: hoursOnFeetOn(dayNumber - 1),
    hoursBaseline: hoursBaseline(dayNumber),
    daysSinceLastSession: daysSinceLastSession(dayNumber),
    progressionOffset: state.progressionOffset,
  });
}
