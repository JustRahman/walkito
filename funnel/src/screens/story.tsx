import { useState } from 'react';

import bedMorning from '../assets/photos/bed-morning.jpg';
import chairWindow from '../assets/photos/chair-window.jpg';
import cozyEvening from '../assets/photos/cozy-evening.jpg';
import socksRug from '../assets/photos/socks-rug.jpg';
import { SOURCES_URL, url } from '../config';
import { factsOf, FOCUS_LABEL, lifeFor, mentionedGoals, PROGRESS, START_LABEL, STEP, WHEN_LABEL } from '../flow';
import { track } from '../lib/analytics';
import { go } from '../router';
import { answer, update, useFunnel } from '../state';
import { ADVANCE_MS, Choice, Cta, MultiChoice, Page, Reaction } from '../ui';

/**
 * Her first name, asked once the plan exists, for the plan's own headline.
 * She can skip it. Kept in this browser only.
 */
export function Name() {
  const s = useFunnel();
  const [name, setName] = useState(s.name ?? '');
  const next = () => {
    update({ name: name.trim().slice(0, 30) });
    track('step_completed', { step: STEP.name });
    go(STEP.plan);
  };
  return (
    <Page progress={PROGRESS[STEP.name]}>
      <h2>Your plan is ready. Who is it for?</h2>
      <input
        className="field"
        type="text"
        autoComplete="given-name"
        aria-label="First name"
        maxLength={30}
        placeholder="First name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && next()}
      />
      <Cta>
        <button className="btn" type="button" onClick={next}>
          See my plan
        </button>
        <button className="btn quiet" type="button" onClick={() => go(STEP.plan)}>
          Skip
        </button>
      </Cta>
    </Page>
  );
}

/** How her feet get in the way, as a question she answers: nothing here tells her what she has. */
export function Life() {
  const s = useFunnel();
  const [picked, setPicked] = useState<string[]>(s.answers.life ?? []);
  const toggle = (value: string) =>
    setPicked((now) => {
      if (value === 'none') return now.includes('none') ? [] : ['none'];
      const rest = now.filter((v) => v !== 'none');
      return rest.includes(value) ? rest.filter((v) => v !== value) : [...rest, value];
    });
  return (
    <Page progress={PROGRESS[STEP.life]}>
      <div className="stack gap-s">
        <h2>Does any of this sound familiar?</h2>
        <p className="small">Choose all that apply.</p>
      </div>
      <div className="stack">
        {lifeFor(s.answers).map((o) => (
          <MultiChoice key={o.value} checked={picked.includes(o.value)} onToggle={() => toggle(o.value)}>
            {o.label}
          </MultiChoice>
        ))}
        <MultiChoice checked={picked.includes('none')} onToggle={() => toggle('none')}>
          None of these
        </MultiChoice>
      </div>
      <Cta>
        <button
          className="btn"
          type="button"
          disabled={picked.length === 0}
          onClick={() => {
            answer({ life: picked });
            track('step_completed', { step: STEP.life });
            go(STEP.proof);
          }}
        >
          Continue
        </button>
      </Cta>
    </Page>
  );
}

/** The four photographs (assets/photos/SOURCES.md), each with the part that stays in a 16:10 frame: her feet. */
const PHOTO = {
  bed: { src: bedMorning, at: '50% 92%' },
  chair: { src: chairWindow, at: '50% 78%' },
  rug: { src: socksRug, at: '50% 68%' },
  evening: { src: cozyEvening, at: '50% 62%' },
} as const;

/** After "When do you notice it most?": her answer, and what the plan has for it. */
export function HeardWhen() {
  const when = useFunnel().answers.when;
  const said =
    when === 'morning'
      ? {
          photo: PHOTO.bed,
          title: 'Many people notice their feet most with the first steps of the day.',
          text: 'So your plan includes a 2-minute routine you can do on the edge of the bed.',
        }
      : when === 'sitting'
        ? { photo: PHOTO.chair, title: 'Got it.', text: 'Your plan has short moves you can do in the chair before you stand up.' }
        : when === 'evening'
          ? { photo: PHOTO.evening, title: 'Got it.', text: 'Sessions are short, so there’s one that fits after a long day.' }
          : { photo: PHOTO.rug, title: 'Got it.', text: 'One short session a day, at whatever time suits you.' };
  return (
    <Reaction step={STEP.heardWhen} photo={said.photo} title={said.title} next={STEP.since}>
      <p>{said.text}</p>
    </Reaction>
  );
}

/** After "What have you already tried?": the effort was hers, and Walkito's part is only the plan. */
export function HeardTried() {
  const a = useFunnel().answers;
  const tried = a.tried ?? [];
  const said = tried.includes('pt')
    ? {
        title: 'Good.',
        text: 'Walkito doesn’t replace your doctor or physical therapist. It gives you a short routine for the days in between.',
      }
    : tried.length === 0 || tried.includes('nothing')
      ? { title: 'A good place to start.', text: 'Your first week is kept gentle.' }
      : { title: 'You’ve already put effort in.', text: 'Walkito’s part is the plan: which moves, in what order, for how long.' };
  // Never the photograph she saw two screens ago.
  return (
    <Reaction step={STEP.heardTried} photo={a.when === 'evening' ? PHOTO.rug : PHOTO.evening} title={said.title} next={STEP.day}>
      <p>{said.text}</p>
    </Reaction>
  );
}

/** Half-way: her own answers in rows, to confirm or go back and change. No score, nothing we concluded. */
export function Summary() {
  const a = useFunnel().answers;
  const rows: Array<[string, string]> = [
    ['Focus', FOCUS_LABEL[a.focus ?? 'heel']],
    ['Noticed most', WHEN_LABEL[a.when ?? 'varies']],
    ['Where', START_LABEL[a.start ?? 'chair']],
    ['Time each day', `${a.minutes ?? 5} minutes`],
    ...(factsOf(a).safetyFlag ? [['First week', 'Seated'] as [string, string]] : []),
  ];
  return (
    <Page progress={PROGRESS[STEP.summary]}>
      <h2>Here’s what we have so far</h2>
      <dl className="card facts">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="caption">To change an answer, go back.</p>
      <Cta>
        <button className="btn" type="button" onClick={() => (track('step_completed', { step: STEP.summary }), go(STEP.life))}>
          That’s right
        </button>
      </Cta>
    </Page>
  );
}

/**
 * The one proof card: where the exercises come from, with the sources a tap
 * away. It says what the physical therapists' heel pain guideline includes
 * (Koc et al., JOSPT 2023, in the site's citations), never what Walkito does
 * for anyone: Walkito itself has not been tested in a trial.
 */
export function Proof() {
  return (
    <Reaction step={STEP.proof} photo={{ src: url('/posters/heel_raise_double.webp') }} title="Built on published research" next={STEP.goals}>
      <p>Walkito’s exercises are chosen from published physical therapy research.</p>
      <p>For heel pain, for example, the physical therapists’ guideline includes stretching and foot-strengthening exercises.</p>
      <p>
        <a href={SOURCES_URL} target="_blank" rel="noopener noreferrer">
          See the sources
        </a>
      </p>
    </Reaction>
  );
}

/** Her goals. None is ticked for her: the mirror of what she told us comes first, and says so. */
export function Goals() {
  const s = useFunnel();
  const [picked, setPicked] = useState<string[]>(s.answers.goals ?? []);
  const toggle = (goal: string) => setPicked((now) => (now.includes(goal) ? now.filter((g) => g !== goal) : [...now, goal]));
  const mentioned = mentionedGoals(s.answers);
  const options = lifeFor(s.answers);
  const hersFirst = [...options.filter((o) => mentioned.includes(o.goal)), ...options.filter((o) => !mentioned.includes(o.goal))];
  return (
    <Page progress={PROGRESS[STEP.goals]}>
      <h2>What would you like to get back to?</h2>
      <div className="stack">
        {hersFirst.map((o) => (
          <MultiChoice key={o.goal} checked={picked.includes(o.goal)} onToggle={() => toggle(o.goal)}>
            {o.goalLabel}
            {mentioned.includes(o.goal) && <span className="hint">You mentioned this</span>}
          </MultiChoice>
        ))}
      </div>
      <Cta>
        <button
          className="btn"
          type="button"
          disabled={picked.length === 0}
          onClick={() => {
            answer({ goals: picked });
            track('step_completed', { step: STEP.goals });
            go(STEP.move);
          }}
        >
          Continue
        </button>
      </Cta>
    </Page>
  );
}

/** A small yes before the plan: one tap, and either answer goes on. Nothing is kept. */
export function Commit() {
  const s = useFunnel();
  const [picked, setPicked] = useState<string | null>(null);
  const pick = (value: string) => {
    setPicked(value);
    track('step_completed', { step: STEP.commit });
    setTimeout(() => go(STEP.building), ADVANCE_MS);
  };
  return (
    <Page progress={PROGRESS[STEP.commit]}>
      <h2>Can you give your feet {s.answers.minutes ?? 5} minutes a day?</h2>
      <div className="stack">
        <Choice selected={picked === 'yes'} onClick={() => pick('yes')}>
          Yes, I can
        </Choice>
        <Choice selected={picked === 'best'} onClick={() => pick('best')}>
          I’ll do my best
        </Choice>
      </div>
    </Page>
  );
}
