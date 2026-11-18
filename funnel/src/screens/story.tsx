import { useState } from 'react';

import { PREVIEW, url } from '../config';
import { kindOf, lifeFor, mentionedGoals, PROGRESS, STEP } from '../flow';
import { track } from '../lib/analytics';
import { PLACEHOLDER_REVIEWS } from '../preview/placeholders';
import { go } from '../router';
import { answer, update, useFunnel } from '../state';
import { ADVANCE_MS, Choice, Cta, MultiChoice, Page, Slide } from '../ui';

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
            go(STEP.fault);
          }}
        >
          Continue
        </button>
      </Cta>
    </Page>
  );
}

const poster = (id: string) => url(`/posters/${id}.webp`);

/** Statement 1 of 3: the problem, with no blame on her. */
export function Fault() {
  const s = useFunnel();
  const runner = kindOf(s.answers) === 'runner';
  return (
    <Slide progress={PROGRESS[STEP.fault]} next={() => (track('step_completed', { step: STEP.fault }), go(STEP.path))}>
      <img className="still" src={poster('short_foot_seated')} alt="" />
      <h1>{runner ? 'Cushioned shoes leave your feet less to do.' : 'Sitting all day weakens your feet.'}</h1>
      <p>Chairs and soft shoes do your foot muscles’ job.</p>
    </Slide>
  );
}

/** Statement 2 of 3: it can change. */
export function Path() {
  return (
    <Slide progress={PROGRESS[STEP.path]} next={() => (track('step_completed', { step: STEP.path }), go(STEP.research))}>
      <img className="still" src={poster('big_toe_lift')} alt="" />
      <h1>It’s not your fault. And it can change.</h1>
      <p>Foot muscles respond to small daily work.</p>
    </Slide>
  );
}

/**
 * The journals the exercises come from: only ones walkito.site cites
 * (site/lib/citations.ts), as text, like QUITTR's press row.
 */
const JOURNALS = [
  'British Journal of Sports Medicine',
  'Journal of Orthopaedic & Sports Physical Therapy',
  'American Journal of Sports Medicine',
  'Medicine & Science in Sports & Exercise',
] as const;

/** Statement 3 of 3: where the exercises come from. */
export function Research() {
  return (
    <Slide progress={PROGRESS[STEP.research]} next={() => (track('step_completed', { step: STEP.research }), go(STEP.compare))}>
      <img className="still" src={poster('heel_raise_double')} alt="" />
      <h1>Built on published research</h1>
      <ul className="journals">
        {JOURNALS.map((j) => (
          <li key={j}>{j}</li>
        ))}
      </ul>
    </Slide>
  );
}

const WITHOUT = ['Random stretches from videos', 'Not sure what helps', 'Giving up after a week'] as const;
const WITH = ['A plan for your feet', '5 minutes, from a chair', 'A reminder every morning'] as const;

/** Without Walkito / With Walkito, as Flo's: two cards, the second marked. */
export function Compare() {
  return (
    <Page progress={PROGRESS[STEP.compare]}>
      <h2 className="center">With Walkito, you know what to do</h2>
      <div className="versus">
        <section className="without">
          <h3>Without Walkito</h3>
          <ul>
            {WITHOUT.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
        <section className="with">
          <h3>With Walkito</h3>
          <ul>
            {WITH.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
      </div>
      <Cta>
        <button className="btn" type="button" onClick={() => (track('step_completed', { step: STEP.compare }), go(STEP.reviews))}>
          Let’s do this!
        </button>
      </Cta>
    </Page>
  );
}

/**
 * Real App Store reviews, word for word (App Store US, Nov 18, 2026), each
 * with the name it was posted under. Added only from the store, never written
 * or edited by us. Both are 5 stars there. AhmetAZ's is its first two
 * sentences: the third says what the app did for a symptom, which is a
 * result claim wherever we print it.
 */
export const REVIEWS = [
  {
    author: 'Kolodi',
    text: 'honestly didn’t expect much but it’s pretty nice. answered a few questions about my feet and it made me a daily plan, takes like a few min. gonna try it for a couple weeks and see',
  },
  {
    author: 'AhmetAZ',
    text: 'Really liked this app. The interface is clean and easy to navigate, and programs are easy to follow.',
  },
] as const;

/** Its own screen: who already uses it, in their words. No counts. */
export function Reviews() {
  return (
    <Slide progress={PROGRESS[STEP.reviews]} next={() => (track('step_completed', { step: STEP.reviews }), go(STEP.goals))}>
      <h1>Made for people like you</h1>
      <div className="stack" style={{ width: '100%' }}>
        {(PREVIEW ? PLACEHOLDER_REVIEWS : REVIEWS).map((r) => (
          <figure className="review" key={r.author} data-placeholder={'mark' in r ? r.mark : undefined}>
            <div className="who">
              <span className="avatar">{r.author[0]}</span>
              <b>{r.author}</b>
              <span className="stars" aria-label="5 stars on the App Store">
                ★★★★★
              </span>
            </div>
            <blockquote>“{r.text}”</blockquote>
          </figure>
        ))}
        {!PREVIEW && <p className="caption">From the App Store</p>}
      </div>
    </Slide>
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
      <h2 className="center">What do you want back?</h2>
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
          These are my goals
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
