import { useState, type ReactNode } from 'react';

import { url } from '../config';
import { PROGRESS, STEP } from '../flow';
import { track } from '../lib/analytics';
import { go } from '../router';
import { answer, useFunnel, type Answers } from '../state';
import { Carla, Choice, Cta, MultiChoice, Page, type IconName } from '../ui';

type Option<V> = { value: V; label: string; icon?: IconName; hint?: string; tag?: string };

/** One question, one tap: the answer is saved and the next screen follows. */
function Single<K extends keyof Answers>({
  path,
  field,
  title,
  sub,
  options,
  next,
  backTo,
}: {
  path: string;
  field: K;
  title: string;
  sub?: ReactNode;
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
      <div className="stack gap-s">
        <h2>{title}</h2>
        {sub != null && <p className="small">{sub}</p>}
      </div>
      <div className="stack">
        {options.map((o) => (
          <Choice key={String(o.value)} selected={picked === o.value} icon={o.icon} hint={o.hint} tag={o.tag} onClick={() => pick(o.value)}>
            {o.label}
          </Choice>
        ))}
      </div>
    </Page>
  );
}

const AGES: ReadonlyArray<Option<NonNullable<Answers['age']>>> = [
  { value: 'under55', label: 'Under 55' },
  { value: '55-64', label: '55–64' },
  { value: '65-74', label: '65–74' },
  { value: '75+', label: '75+' },
];

/** The first screen is the first question: the promise, then her age. */
export function Age() {
  const s = useFunnel();
  const pick = (value: NonNullable<Answers['age']>) => {
    answer({ age: value });
    track('step_completed', { step: STEP.age });
    setTimeout(() => go(STEP.focus), 180);
  };
  return (
    <Page footer>
      <div className="stack center">
        <img className="hero" src={url('/img/mascot-mobility.png')} alt="" />
        <h1>Foot exercises made for your age</h1>
        <p className="lead">5 minutes a day. From a chair.</p>
      </div>
      <div className="stack center">
        <span className="eyebrow">1-minute quiz</span>
        <h3>Select your age</h3>
      </div>
      <div className="grid2">
        {AGES.map((o) => (
          <Choice key={o.value} selected={s.answers.age === o.value} arrow onClick={() => pick(o.value)}>
            {o.label}
          </Choice>
        ))}
      </div>
      <div className="card">
        <Carla line="Physical therapist. Reviewed every exercise in Walkito." />
      </div>
      <p className="caption center">
        By choosing your age you agree to our <a href={url('/terms')}>Terms</a> and <a href={url('/privacy')}>Privacy Policy</a>.
      </p>
    </Page>
  );
}

export function Focus() {
  return (
    <Single
      path={STEP.focus}
      field="focus"
      backTo={STEP.age}
      title="What do you want help with first?"
      options={[
        { value: 'heel', label: 'Heel or arch', icon: 'foot' },
        { value: 'steady', label: 'Feeling steadier on my feet', icon: 'balance' },
        { value: 'flat', label: 'Flat feet', icon: 'sandal' },
        { value: 'allday', label: 'On my feet all day', icon: 'briefcase' },
        { value: 'moving', label: 'Keeping my feet moving', icon: 'runningShoe' },
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
        { value: 'morning', label: 'First steps in the morning', icon: 'sunrise' },
        { value: 'sitting', label: 'After sitting', icon: 'couch' },
        { value: 'evening', label: 'At the end of the day', icon: 'moon' },
        { value: 'allday', label: 'Most of the day', icon: 'sun' },
        { value: 'varies', label: 'It varies', icon: 'leafInWind' },
      ]}
      next={STEP.echo}
    />
  );
}

const ECHO: Readonly<Record<NonNullable<Answers['when']>, { title: string; plan: string }>> = {
  morning: { title: 'We’ll plan around your mornings', plan: 'Moves you can do on the edge of the bed, before your first steps.' },
  sitting: { title: 'We’ll plan around your chair', plan: 'Moves you can do sitting down, before you stand up.' },
  evening: { title: 'We’ll plan around your evenings', plan: 'Short, easy moves to wind down at the end of the day.' },
  allday: { title: 'We’ll keep it short', plan: 'Moves you can fit in anywhere, a few minutes at a time.' },
  varies: { title: 'We’ll keep it flexible', plan: 'Short moves you can do whenever suits you that day.' },
};

export function Echo() {
  const s = useFunnel();
  const echo = ECHO[s.answers.when ?? 'varies'];
  return (
    <Page progress={PROGRESS[STEP.echo]} backTo={STEP.when}>
      <div className="stack center" style={{ marginTop: '1rem' }}>
        <img className="hero pop" src={url('/img/mascot-balance.png')} alt="" />
        <h2>{echo.title}</h2>
        <p className="lead">{echo.plan}</p>
      </div>
      <Cta>
        <button className="btn" type="button" onClick={() => (track('step_completed', { step: STEP.echo }), go(STEP.tried))}>
          Continue
        </button>
      </Cta>
    </Page>
  );
}

const TRIED: ReadonlyArray<Option<string>> = [
  { value: 'stretching', label: 'Stretching on my own', icon: 'leg' },
  { value: 'insoles', label: 'Insoles or new shoes', icon: 'runningShoe' },
  { value: 'pt', label: 'Physical therapy', icon: 'healthWorker' },
  { value: 'roller', label: 'Massage or a foot roller', icon: 'softball' },
  { value: 'videos', label: 'Videos online', icon: 'bulb' },
  { value: 'nothing', label: 'Nothing yet', icon: 'seedling' },
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
      <div className="stack gap-s">
        <h2>What have you tried?</h2>
        <p className="small">Choose all that apply.</p>
      </div>
      <div className="stack">
        {TRIED.map((o) => (
          <MultiChoice key={o.value} icon={o.icon} checked={picked.includes(o.value)} onToggle={() => toggle(o.value)}>
            {o.label}
          </MultiChoice>
        ))}
      </div>
      <Cta>
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
      </Cta>
    </Page>
  );
}

export function Start() {
  return (
    <Single
      path={STEP.start}
      field="start"
      backTo={STEP.tried}
      title="Where would you like to start?"
      options={[
        { value: 'chair', label: 'In a chair', icon: 'couch' },
        { value: 'bed', label: 'On the edge of the bed', icon: 'bed' },
        { value: 'standing', label: 'Standing', hint: 'With a hand on a counter', icon: 'balance' },
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
        { value: 'surgery', label: 'Recent surgery or injury', icon: 'bandage' },
        { value: 'numb', label: 'Numbness or swelling', icon: 'feather' },
        { value: 'dizzy', label: 'Dizziness or a fall this year', icon: 'leafInWind' },
        { value: 'aid', label: 'I use a cane or walker', icon: 'crutch' },
        { value: 'none', label: 'None of these', icon: 'check' },
      ]}
      next={(value) => (value === 'none' ? STEP.who : '/s/7/note')}
    />
  );
}

export function SafetyNote() {
  return (
    <Page progress={PROGRESS[STEP.safety]} backTo={STEP.safety}>
      <div className="stack center" style={{ marginTop: '1rem' }}>
        <img className="hero s pop" src={url('/img/art-shield.webp')} alt="" />
        <h2>Thanks for telling us</h2>
        <p className="lead">We’ll keep your first week seated. Please check with your doctor or physical therapist before you start.</p>
      </div>
      <Cta>
        <button className="btn" type="button" onClick={() => go(STEP.who)}>
          Continue
        </button>
      </Cta>
    </Page>
  );
}

export function Who() {
  return (
    <Page progress={PROGRESS[STEP.who]} backTo={STEP.safety}>
      <div className="stack center">
        <span className="eyebrow">Who is behind your plan</span>
        <h2>Every exercise is reviewed by a physical therapist</h2>
      </div>
      <div className="card stack gap-l pop">
        <Carla big line="Physical therapist" />
        <ul className="ticks">
          <li>How each move is done</li>
          <li>How much to do</li>
          <li>What to do if it doesn’t feel right</li>
        </ul>
      </div>
      <Cta>
        <button className="btn" type="button" onClick={() => (track('step_completed', { step: STEP.who }), go(STEP.minutes))}>
          Continue
        </button>
      </Cta>
    </Page>
  );
}

export function Minutes() {
  return (
    <Single
      path={STEP.minutes}
      field="minutes"
      backTo={STEP.who}
      title="How much time each day?"
      options={[
        { value: 3, label: '3 minutes', hint: 'A gentle start', icon: 'feather' },
        { value: 5, label: '5 minutes', hint: 'What we suggest', icon: 'stopwatch', tag: 'Suggested' },
        { value: 10, label: '10 minutes', hint: 'A fuller session', icon: 'strength' },
      ]}
      next={STEP.before}
    />
  );
}
