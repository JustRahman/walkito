import { useState, type ReactNode } from 'react';

import { PROGRESS, STEP } from '../flow';
import { track } from '../lib/analytics';
import { go } from '../router';
import { answer, useFunnel, type Answers } from '../state';
import { Carla, Choice, MultiChoice, Page } from '../ui';

type Option<V> = { value: V; label: string };

/** One question, one tap: the answer is saved and the next screen follows. */
function Single<K extends keyof Answers>({
  path,
  field,
  title,
  intro,
  after,
  options,
  next,
  backTo,
}: {
  path: string;
  field: K;
  title: string;
  intro?: ReactNode;
  after?: ReactNode;
  options: ReadonlyArray<Option<NonNullable<Answers[K]>>>;
  next: string | ((value: NonNullable<Answers[K]>) => string | null);
  backTo?: string;
}) {
  const s = useFunnel();
  const [picked, setPicked] = useState<Answers[K] | undefined>(s.answers[field]);
  const pick = (value: NonNullable<Answers[K]>) => {
    setPicked(value);
    answer({ [field]: value } as Partial<Answers>);
    track('step_completed', { step: path });
    const target = typeof next === 'string' ? next : next(value);
    if (target != null) setTimeout(() => go(target), 220);
  };
  return (
    <Page progress={PROGRESS[path]} backTo={backTo}>
      {intro}
      <h2>{title}</h2>
      <div className="stack">
        {options.map((o) => (
          <Choice key={String(o.value)} selected={picked === o.value} onClick={() => pick(o.value)}>
            {o.label}
          </Choice>
        ))}
      </div>
      {after}
    </Page>
  );
}

export function Age() {
  return (
    <Single
      path={STEP.age}
      field="age"
      intro={
        <div className="stack">
          <h1>Short daily foot exercises you can do from a chair.</h1>
          <p className="lead">Answer a few questions. Try one 60-second move. See your first week.</p>
          <p className="caption">The quiz and the move are free. A paid plan is optional.</p>
        </div>
      }
      title="How old are you?"
      options={[
        { value: '75+', label: '75 or older' },
        { value: '65-74', label: '65 to 74' },
        { value: '55-64', label: '55 to 64' },
        { value: 'under55', label: 'Under 55' },
      ]}
      after={
        <div className="card outline" style={{ marginTop: '0.5rem' }}>
          <Carla line="Physical therapist. Reviewed every exercise in Walkito." />
        </div>
      }
      next={STEP.focus}
    />
  );
}

export function Focus() {
  return (
    <Single
      path={STEP.focus}
      field="focus"
      backTo={STEP.age}
      title="What would you like help with first?"
      options={[
        { value: 'heel', label: 'Heel or arch' },
        { value: 'steady', label: 'Feeling steadier on my feet' },
        { value: 'flat', label: 'Flat feet' },
        { value: 'allday', label: 'On my feet all day' },
        { value: 'moving', label: 'Keeping my feet moving' },
      ]}
      next={STEP.when}
    />
  );
}

export function When() {
  return (
    <Single
      path={STEP.when}
      field="when"
      backTo={STEP.focus}
      title="When do you notice it most?"
      options={[
        { value: 'morning', label: 'First steps in the morning' },
        { value: 'sitting', label: 'After sitting' },
        { value: 'evening', label: 'At the end of the day' },
        { value: 'allday', label: 'Most of the day' },
        { value: 'varies', label: 'It varies' },
      ]}
      next={STEP.echo}
    />
  );
}

const ECHO: Readonly<Record<NonNullable<Answers['when']>, { said: string; plan: string }>> = {
  morning: { said: 'You said mornings.', plan: 'Your first week starts with moves you can do on the edge of the bed, before your first steps.' },
  sitting: { said: 'You said after sitting.', plan: 'Your first week starts with moves you can do in your chair, before you stand up.' },
  evening: { said: 'You said the end of the day.', plan: 'Your first week has short, easy moves to wind down in the evening.' },
  allday: { said: 'You said most of the day.', plan: 'Your first week has short moves you can fit in anywhere, a few minutes at a time.' },
  varies: { said: 'You said it varies.', plan: 'Your first week has short moves you can do whenever suits you that day.' },
};

export function Echo() {
  const s = useFunnel();
  const echo = ECHO[s.answers.when ?? 'varies'];
  return (
    <Page progress={PROGRESS[STEP.echo]} backTo={STEP.when}>
      <div className="card stack" style={{ padding: '1.5rem 1.25rem' }}>
        <h2>{echo.said}</h2>
        <p className="lead">{echo.plan}</p>
      </div>
      <div className="spacer" />
      <button className="btn" type="button" onClick={() => (track('step_completed', { step: STEP.echo }), go(STEP.tried))}>
        Continue
      </button>
    </Page>
  );
}

const TRIED: ReadonlyArray<Option<string>> = [
  { value: 'stretching', label: 'Stretching on my own' },
  { value: 'insoles', label: 'Insoles or new shoes' },
  { value: 'pt', label: 'Physical therapy' },
  { value: 'roller', label: 'Massage or a foot roller' },
  { value: 'videos', label: 'Videos online' },
  { value: 'nothing', label: 'Nothing yet' },
];

export function Tried() {
  const s = useFunnel();
  const [picked, setPicked] = useState<string[]>(s.answers.tried ?? []);
  const toggle = (value: string) =>
    setPicked((now) => {
      if (value === 'nothing') return now.includes('nothing') ? [] : ['nothing'];
      const rest = now.filter((v) => v !== 'nothing');
      return rest.includes(value) ? rest.filter((v) => v !== value) : [...rest, value];
    });
  return (
    <Page progress={PROGRESS[STEP.tried]} backTo={STEP.echo}>
      <div className="stack">
        <h2>What have you tried?</h2>
        <p className="small">Pick all that apply.</p>
      </div>
      <div className="stack">
        {TRIED.map((o) => (
          <MultiChoice key={o.value} checked={picked.includes(o.value)} onToggle={() => toggle(o.value)}>
            {o.label}
          </MultiChoice>
        ))}
      </div>
      <button
        className="btn"
        type="button"
        disabled={picked.length === 0}
        onClick={() => {
          answer({ tried: picked });
          track('step_completed', { step: STEP.tried });
          go(STEP.start);
        }}
      >
        Continue
      </button>
    </Page>
  );
}

export function Start() {
  return (
    <Single
      path={STEP.start}
      field="start"
      backTo={STEP.tried}
      title="How would you like to start?"
      options={[
        { value: 'chair', label: 'In a chair' },
        { value: 'bed', label: 'On the edge of the bed' },
        { value: 'standing', label: 'Standing, with a hand on a counter' },
      ]}
      next={STEP.safety}
    />
  );
}

export function Safety() {
  return (
    <Single
      path={STEP.safety}
      field="safety"
      backTo={STEP.start}
      title="Anything we should plan around?"
      options={[
        { value: 'surgery', label: 'Recent surgery or injury' },
        { value: 'numb', label: 'Numbness or swelling' },
        { value: 'dizzy', label: 'Dizziness or a fall this year' },
        { value: 'aid', label: 'I use a cane or walker' },
        { value: 'none', label: 'None of these' },
      ]}
      next={(value) => (value === 'none' ? STEP.who : '/s/7/note')}
    />
  );
}

export function SafetyNote() {
  return (
    <Page progress={PROGRESS[STEP.safety]} backTo={STEP.safety}>
      <div className="card stack" style={{ padding: '1.5rem 1.25rem' }}>
        <h2>Thank you for telling us.</h2>
        <p className="lead">
          Please check with your doctor or physical therapist before you start. We will keep today’s move seated, and your
          first week will be seated too.
        </p>
      </div>
      <div className="spacer" />
      <button className="btn" type="button" onClick={() => go(STEP.who)}>
        Continue
      </button>
    </Page>
  );
}

export function Who() {
  return (
    <Page progress={PROGRESS[STEP.who]} backTo={STEP.safety}>
      <h2>Who is behind Walkito</h2>
      <div className="card stack">
        <Carla />
        <p className="lead">
          Carla is a physical therapist. She reviewed every exercise in Walkito: how it is done, how much, and what to do if
          it does not feel right.
        </p>
      </div>
      <div className="card outline stack">
        <p>
          <b>We are a new app.</b> We will not show you invented reviews.
        </p>
        <p className="lead">
          Research on foot exercises exists. Those studies did not test Walkito. What we can promise is short, clear moves
          and an honest plan.
        </p>
      </div>
      <div className="spacer" />
      <button className="btn" type="button" onClick={() => (track('step_completed', { step: STEP.who }), go(STEP.minutes))}>
        Continue
      </button>
    </Page>
  );
}

export function Minutes() {
  return (
    <Single
      path={STEP.minutes}
      field="minutes"
      backTo={STEP.who}
      title="How long each day?"
      options={[
        { value: 3, label: '3 minutes' },
        { value: 5, label: '5 minutes' },
        { value: 10, label: '10 minutes' },
      ]}
      next={STEP.before}
    />
  );
}
