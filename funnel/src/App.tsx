import { useEffect, type ComponentType } from 'react';

import { missingStep, STEP } from './flow';
import { track } from './lib/analytics';
import { go, usePath } from './router';
import { Cancel, Me } from './screens/account';
import { Code, Email } from './screens/email';
import { HealthData, Privacy, Terms } from './screens/legal';
import { Plan } from './screens/plan';
import { Price } from './screens/price';
import { Age, Echo, Focus, Minutes, Safety, SafetyNote, Start, Tried, When, Who } from './screens/quiz';
import { StartDay1 } from './screens/start';
import { After, Balance, Before, Building, TryMove } from './screens/try-it';
import { useFunnel } from './state';

const ROUTES: Readonly<Record<string, ComponentType>> = {
  '/': Age,
  [STEP.age]: Age,
  [STEP.focus]: Focus,
  [STEP.when]: When,
  [STEP.echo]: Echo,
  [STEP.tried]: Tried,
  [STEP.start]: Start,
  [STEP.safety]: Safety,
  '/s/7/note': SafetyNote,
  [STEP.who]: Who,
  [STEP.minutes]: Minutes,
  [STEP.before]: Before,
  [STEP.move]: TryMove,
  [STEP.after]: After,
  [STEP.balance]: Balance,
  [STEP.building]: Building,
  [STEP.plan]: Plan,
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
