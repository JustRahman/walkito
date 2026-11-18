import { useEffect, type ComponentType } from 'react';

import { missingStep, STEP } from './flow';
import { track } from './lib/analytics';
import { go, usePath } from './router';
import { Cancel, Me } from './screens/account';
import { Code, Email } from './screens/email';
import { HealthData, Privacy, Terms } from './screens/legal';
import { Plan } from './screens/plan';
import { Price } from './screens/price';
import { Age, Day, Focus, Minutes, Safety, SafetyNote, Since, Start, Tried, When } from './screens/quiz';
import { StartDay1 } from './screens/start';
import { Card, Fault, Goals, Life, Path, Summary } from './screens/story';
import { After, Balance, Before, Building, TryMove } from './screens/try-it';
import { useFunnel } from './state';

const ROUTES: Readonly<Record<string, ComponentType>> = {
  '/': Age,
  [STEP.age]: Age,
  [STEP.card]: Card,
  [STEP.focus]: Focus,
  [STEP.when]: When,
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
  [STEP.goals]: Goals,
  [STEP.before]: Before,
  [STEP.move]: TryMove,
  [STEP.after]: After,
  [STEP.balance]: Balance,
  [STEP.building]: Building,
  [STEP.plan]: Plan,
  [STEP.summary]: Summary,
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
