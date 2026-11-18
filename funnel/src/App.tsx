import { useEffect, type ComponentType } from 'react';

import { missingStep, STEP } from './flow';
import { track } from './lib/analytics';
import { go, usePath } from './router';
import { Cancel, Me } from './screens/account';
import { Code, Email } from './screens/email';
import { HealthData, Privacy, Terms } from './screens/legal';
import { Plan } from './screens/plan';
import { Price } from './screens/price';
import { Age, Day, Focus, Minutes, Safety, SafetyNote, Since, Start, Tried, Wake, When } from './screens/quiz';
import { StartDay1 } from './screens/start';
import { Card, Compare, Fault, Goals, Life, Path, Research, Reviews, Sign } from './screens/story';
import { After, Balance, Building, FeltAnswer, Praise, Routine, TryMove } from './screens/try-it';
import { useFunnel } from './state';

export const ROUTES: Readonly<Record<string, ComponentType>> = {
  '/': Age,
  [STEP.age]: Age,
  [STEP.card]: Card,
  [STEP.focus]: Focus,
  [STEP.when]: When,
  [STEP.wake]: Wake,
  [STEP.since]: Since,
  [STEP.tried]: Tried,
  [STEP.day]: Day,
  [STEP.start]: Start,
  [STEP.safety]: Safety,
  '/s/7/note': SafetyNote,
  [STEP.minutes]: Minutes,
  [STEP.life]: Life,
  [STEP.fault]: Fault,
  [STEP.path]: Path,
  [STEP.research]: Research,
  [STEP.compare]: Compare,
  [STEP.reviews]: Reviews,
  [STEP.goals]: Goals,
  [STEP.before]: TryMove,
  [STEP.move]: TryMove,
  [STEP.after]: After,
  [STEP.felt]: FeltAnswer,
  [STEP.praise]: Praise,
  [STEP.routine]: Routine,
  [STEP.balance]: Balance,
  [STEP.building]: Building,
  [STEP.plan]: Plan,
  [STEP.sign]: Sign,
  [STEP.email]: Email,
  [STEP.code]: Code,
  [STEP.price]: Price,
  [STEP.start1]: StartDay1,
  [STEP.me]: Me,
  [STEP.cancel]: Cancel,
  '/terms': Terms,
  '/privacy': Privacy,
  '/health-data': HealthData,
};

export function App() {
  const path = usePath();
  const s = useFunnel();
  const redirect = missingStep(path, s);
  useEffect(() => {
    if (redirect != null) go(redirect, { replace: true });
  }, [redirect]);
  useEffect(() => {
    if (redirect == null) track('step_viewed', { step: ROUTES[path] != null ? path : 'unknown' });
  }, [path, redirect]);
  const Screen = ROUTES[path] ?? Age;
  if (redirect != null) return null;
  return <Screen />;
}
