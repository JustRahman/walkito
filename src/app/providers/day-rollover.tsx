import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { AppState, DevSettings } from 'react-native';

import { currentDay } from '@/entities/program';

/**
 * Restarts the app when it comes back on a new program day.
 *
 * "Today" is read once at launch — `TODAY_INDEX`, `PROGRAM[TODAY_INDEX]` and
 * everything built on them — so an app left in the background overnight kept
 * showing yesterday in the brief, the player and the relief session while the
 * task list had already moved on. Reloading on return is the one place that
 * fixes all of them together. Only on a return to the foreground, never on a
 * timer, so a session running over midnight is not pulled out from under the
 * user.
 */
export function useDayRollover() {
  useEffect(() => {
    const launchedOn = currentDay();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active' || currentDay() === launchedOn) return;
      if (__DEV__) DevSettings.reload();
      else void Updates.reloadAsync().catch(() => {});
    });
    return () => subscription.remove();
  }, []);
}
