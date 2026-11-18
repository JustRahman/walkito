import { useState, type ReactNode } from 'react';

import hero from '../assets/photos/hero-socks-morning.jpg';
import { url } from '../config';
import { PROGRESS, STEP, wakeOf } from '../flow';
import { track } from '../lib/analytics';
import { go } from '../router';
import { answer, useFunnel, type Answers } from '../state';
import { ADVANCE_MS, Choice, Cta, MultiChoice, Page, type IconName } from '../ui';

type Option<V> = { value: V; label: string; icon?: IconName; hint?: string; tag?: string };

/** One question, one tap: the answer is saved and the next screen follows. */
function Single<K extends keyof Answers>({
  path,
  field,
  title,
  sub,
  options,
  next,
}: {
  path: string;
  field: K;
  title: string;
  sub?: ReactNode;
  options: ReadonlyArray<Option<NonNullable<Answers[K]>>>;
  next: string | ((value: NonNullable<Answers[K]>) => string | null);
}) {
  const s = useFunnel();
  const [picked, setPicked] = useState<Answers[K] | undefined>(s.answers[field]);
  const pick = (value: NonNullable<Answers[K]>) => {
    setPicked(value);
    answer({ [field]: value } as Partial<Answers>);
    track('step_completed', { step: path });
    const target = typeof next === 'string' ? next : next(value);
    if (target != null) setTimeout(() => go(target), ADVANCE_MS);
  };
  return (
    <Page progress={PROGRESS[path]}>
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
  { value: 'under50', label: 'Under 50' },
  { value: '50-59', label: '50–59' },
  { value: '60-69', label: '60–69' },
  { value: '70+', label: '70 or older' },
];

/**
 * The first screen is the first question: what this is, then her age. The four
 * cards are in view without scrolling on a 390 x 660 screen (Facebook's
 * browser), and it says before anything else that the plan is paid.
 */
export function Age() {
  const s = useFunnel();
  const pick = (value: NonNullable<Answers['age']>) => {
    answer({ age: value });
    track('step_completed', { step: STEP.age });
    setTimeout(() => go(STEP.card), ADVANCE_MS);
  };
  return (
    <Page footer>
      <div className="stack gap-s">
        <h1>
          Gentle daily foot exercises, made for <em>you</em>
        </h1>
        <p className="small">A few minutes a day, mostly from a chair. Answer a few questions to get your plan.</p>
      </div>
      <img className="photo" src={hero} alt="" width={666} height={1000} />
      <div className="stack">
        <h3>First, how old are you?</h3>
        <div className="grid2">
          {AGES.map((o) => (
            <Choice key={o.value} selected={s.answers.age === o.value} onClick={() => pick(o.value)}>
              {o.label}
            </Choice>
          ))}
        </div>
        <p className="caption">We ask so your plan starts at the right pace.</p>
      </div>
      <div className="stack gap-s">
        <p className="caption">The quiz is free. The plan is a paid subscription, and you’ll see the price before you decide.</p>
        <p className="caption">
          By choosing your age you agree to our <a href={url('/terms')}>Terms</a> and <a href={url('/privacy')}>Privacy Policy</a>.
        </p>
      </div>
    </Page>
  );
}

export function Focus() {
  return (
    <Single
      path={STEP.focus}
      field="focus"
      title="What bothers your feet most?"
      options={[
        { value: 'heel', label: 'My heel or arch', icon: 'foot' },
        { value: 'flat', label: 'Flat, tired arches', icon: 'sandal' },
        { value: 'allday', label: 'Sore after a day on my feet', icon: 'briefcase' },
        { value: 'moving', label: 'Stiff feet or ankles', icon: 'runningShoe' },
        { value: 'steady', label: 'Feeling unsteady on my feet', icon: 'balance' },
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
      title="When do you notice it most?"
      options={[
        { value: 'morning', label: 'First steps in the morning', icon: 'sunrise' },
        { value: 'sitting', label: 'Standing up after sitting', icon: 'couch' },
        { value: 'evening', label: 'After work, by evening', icon: 'moon' },
        { value: 'running', label: 'During or after runs', icon: 'runningShoe' },
        { value: 'allday', label: 'All day', icon: 'sun' },
        { value: 'varies', label: 'It varies', icon: 'leafInWind' },
      ]}
      next={STEP.wake}
    />
  );
}

/** When she gets up: her first-step routine is set for then. */
export function Wake() {
  const s = useFunnel();
  const [time, setTime] = useState(wakeOf(s.answers));
  return (
    <Page progress={PROGRESS[STEP.wake]}>
      <h2>When do you usually get up?</h2>
      <input
        className="field time"
        type="time"
        aria-label="Usual wake-up time"
        value={time}
        onChange={(e) => e.target.value !== '' && setTime(e.target.value)}
      />
      <Cta>
        <button
          className="btn"
          type="button"
          onClick={() => {
            answer({ wake: time });
            track('wake_time_set');
            track('step_completed', { step: STEP.wake });
            go(STEP.since);
          }}
        >
          Continue
        </button>
      </Cta>
    </Page>
  );
}

export function Since() {
  return (
    <Single
      path={STEP.since}
      field="since"
      title="How long has this been going on?"
      options={[
        { value: 'new', label: 'Less than 3 months' },
        { value: 'months', label: '3 to 12 months' },
        { value: 'year', label: '1 to 3 years' },
        { value: 'years', label: 'More than 3 years' },
      ]}
      next={STEP.tried}
    />
  );
}

const TRIED: ReadonlyArray<Option<string>> = [
  { value: 'stretching', label: 'Stretching on my own' },
  { value: 'insoles', label: 'Insoles or new shoes' },
  { value: 'pt', label: 'A doctor or physical therapist' },
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
    <Page progress={PROGRESS[STEP.tried]}>
      <div className="stack gap-s">
        <h2>What have you tried?</h2>
        <p className="small">Choose all that apply.</p>
      </div>
      <div className="stack">
        {TRIED.map((o) => (
          <MultiChoice key={o.value} checked={picked.includes(o.value)} onToggle={() => toggle(o.value)}>
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
            go(STEP.day);
          }}
        >
          Continue
        </button>
      </Cta>
    </Page>
  );
}

export function Day() {
  return (
    <Single
      path={STEP.day}
      field="day"
      title="What does your usual day look like?"
      options={[
        { value: 'sit8', label: 'Sitting most of the day', hint: '8 hours or more', icon: 'couch' },
        { value: 'sit4', label: 'Sitting part of the day', hint: '4 to 8 hours', icon: 'briefcase' },
        { value: 'feet', label: 'On my feet most of the day', icon: 'leg' },
        { value: 'run_short', label: 'I run', hint: 'Under 10 miles a week', icon: 'runningShoe' },
        { value: 'run_long', label: 'I run a lot', hint: '10 miles a week or more', icon: 'strength' },
      ]}
      next={STEP.start}
    />
  );
}

/** The ad that promises a seated week (Ad 1, "7-day seated foot plan") gets one: no standing start. */
const SEATED_ADS = ['ad1_plancard'];

export function Start() {
  const s = useFunnel();
  const seatedAd = SEATED_ADS.includes(s.utm?.utm_content ?? '');
  return (
    <Single
      path={STEP.start}
      field="start"
      title="Where would you like to start?"
      options={[
        { value: 'chair', label: 'In a chair', icon: 'couch' },
        { value: 'bed', label: 'On the edge of the bed', icon: 'bed' },
        ...(seatedAd ? [] : [{ value: 'standing' as const, label: 'Standing', hint: 'With a hand on a counter', icon: 'balance' as const }]),
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
      title="Anything we should plan around?"
      options={[
        { value: 'surgery', label: 'Recent surgery or injury' },
        { value: 'numb', label: 'Numbness or swelling' },
        { value: 'dizzy', label: 'Dizziness or a fall this year' },
        { value: 'aid', label: 'I use a cane or walker' },
        { value: 'none', label: 'None of these' },
      ]}
      next={(value) => (value === 'none' ? STEP.minutes : '/s/7/note')}
    />
  );
}

export function SafetyNote() {
  return (
    <Page progress={PROGRESS[STEP.safety]}>
      <div className="panel stack">
        <h2>Thanks for telling us</h2>
        <p>We’ll keep your first week seated. Please check with your doctor or physical therapist before you start.</p>
      </div>
      <Cta>
        <button className="btn" type="button" onClick={() => go(STEP.minutes)}>
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
      title="How much time each day?"
      options={[
        { value: 3, label: '3 minutes', hint: 'A gentle start', icon: 'feather' },
        { value: 5, label: '5 minutes', hint: 'What we suggest', icon: 'stopwatch', tag: 'Suggested' },
        { value: 10, label: '10 minutes', hint: 'A fuller session', icon: 'strength' },
      ]}
      next={STEP.life}
    />
  );
}
