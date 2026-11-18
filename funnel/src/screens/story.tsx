import { useMemo, useState } from 'react';

import { url } from '../config';
import {
  firstName,
  goalLabels,
  kindOf,
  lifeFor,
  lifeLabels,
  PLAN_NAME,
  planLine,
  PROGRESS,
  shortDate,
  STEP,
  suggestedGoals,
  WHEN_LABEL,
} from '../flow';
import { track } from '../lib/analytics';
import { go } from '../router';
import { answer, update, useFunnel } from '../state';
import { Cta, MultiChoice, Page } from '../ui';

/** Her Walkito card: she has joined something, on Day 0, under her own name. */
export function Card() {
  const s = useFunnel();
  const [name, setName] = useState(s.name ?? '');
  const since = useMemo(() => shortDate(new Date()), []);
  const next = () => {
    update({ name: name.trim().slice(0, 30) });
    track('step_completed', { step: STEP.card });
    go(STEP.focus);
  };
  return (
    <Page progress={PROGRESS[STEP.card]} backTo={STEP.age}>
      <div className="stack gap-s center">
        <h1>Welcome to Walkito</h1>
        <p className="lead">Here’s your card.</p>
      </div>
      <div className="member pop" aria-label="Your Walkito card">
        <div className="top">
          <img src={url('/img/icon.webp')} alt="" width={40} height={40} />
          <span>Walkito</span>
        </div>
        <div className="mid">
          <span className="k">Day</span>
          <b>0</b>
        </div>
        <div className="bottom">
          <div>
            <span className="k">Name</span>
            <span className="v">{name.trim() === '' ? 'You' : name.trim()}</span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span className="k">Member since</span>
            <span className="v">{since}</span>
          </div>
        </div>
      </div>
      <label className="stack gap-s">
        <span className="small">What should we call you?</span>
        <input
          className="field"
          type="text"
          autoComplete="given-name"
          maxLength={30}
          placeholder="Your first name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && next()}
        />
      </label>
      <Cta>
        <button className="btn" type="button" onClick={next}>
          {name.trim() === '' ? 'Continue' : `Let’s go, ${name.trim()}`}
        </button>
      </Cta>
    </Page>
  );
}

/** How her feet get in the way: her day, never a list of symptoms. */
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
    <Page progress={PROGRESS[STEP.life]} backTo={STEP.minutes}>
      <div className="stack gap-s">
        <h2>How do your feet get in the way?</h2>
        <p className="small">Choose all that apply.</p>
      </div>
      <div className="stack">
        {lifeFor(s.answers).map((o) => (
          <MultiChoice key={o.value} icon={o.icon} checked={picked.includes(o.value)} onToggle={() => toggle(o.value)}>
            {o.label}
          </MultiChoice>
        ))}
        <MultiChoice icon="check" checked={picked.includes('none')} onToggle={() => toggle('none')}>
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

/** One big line, one picture: what is done to feet every day, and a study that shows it. */
export function Fault() {
  return (
    <Page progress={PROGRESS[STEP.fault]} backTo={STEP.life}>
      <div className="statement">
        <img className="hero" src={url('/img/mascot-balance.png')} alt="" />
        <h1>It’s not your fault</h1>
        <p className="lead">Chairs and cushioned shoes do the work your foot muscles were built to do. So those muscles get less work every day.</p>
      </div>
      <p className="caption center">
        When adults walked in flat, flexible shoes, their foot muscles grew stronger.{' '}
        <a href="https://pubmed.ncbi.nlm.nih.gov/30113521/" target="_blank" rel="noopener noreferrer">
          Ridge et al., Medicine &amp; Science in Sports &amp; Exercise, 2019
        </a>
      </p>
      <Cta>
        <button className="btn" type="button" onClick={() => (track('step_completed', { step: STEP.fault }), go(STEP.path))}>
          Continue
        </button>
      </Cta>
    </Page>
  );
}

/**
 * Real App Store reviews, word for word (App Store US, Nov 18, 2026). A
 * review is added here only from the store, never written or edited by us.
 */
const REVIEWS = [
  {
    author: 'Kolodi',
    title: '👍👍👍',
    text: 'honestly didn’t expect much but it’s pretty nice. answered a few questions about my feet and it made me a daily plan, takes like a few min. gonna try it for a couple weeks and see',
  },
  {
    author: 'AhmetAZ',
    title: 'Easy to use',
    text: 'Really liked this app. The interface is clean and easy to navigate, and programs are easy to follow. Helped with my heel pain. Would recommend',
  },
] as const;

export function Path() {
  const s = useFunnel();
  const runner = kindOf(s.answers) === 'runner';
  return (
    <Page progress={PROGRESS[STEP.path]} backTo={STEP.fault}>
      <div className="statement">
        <img className="hero" src={url('/img/mascot-strength.png')} alt="" />
        <h1>There is a path</h1>
        <p className="lead">
          Feet respond to small daily work. A few minutes a day, {runner ? 'before or after your run' : 'from your chair'}.
        </p>
      </div>
      <section className="stack" aria-label="App Store reviews">
        <span className="eyebrow center">From the App Store</span>
        {REVIEWS.map((r) => (
          <figure className="review card" key={r.author}>
            <div className="stars" aria-label="5 stars">
              ★★★★★
            </div>
            {/[a-z]/i.test(r.title) && <b>{r.title}</b>}
            <blockquote>{r.text}</blockquote>
            <figcaption className="caption">{r.author}</figcaption>
          </figure>
        ))}
      </section>
      <Cta>
        <button className="btn" type="button" onClick={() => (track('step_completed', { step: STEP.path }), go(STEP.goals))}>
          Continue
        </button>
      </Cta>
    </Page>
  );
}

/** Her goals: the mirror of what she told us, already ticked, hers to change. */
export function Goals() {
  const s = useFunnel();
  const [picked, setPicked] = useState<string[]>(s.answers.goals ?? suggestedGoals(s.answers));
  const options = lifeFor(s.answers);
  const toggle = (goal: string) => setPicked((now) => (now.includes(goal) ? now.filter((g) => g !== goal) : [...now, goal]));
  return (
    <Page progress={PROGRESS[STEP.goals]} backTo={STEP.path}>
      <div className="stack gap-s">
        <h2>What do you want back?</h2>
        <p className="small">Pick your goals. Your plan keeps them in view.</p>
      </div>
      <div className="stack">
        {options.map((o) => (
          <MultiChoice key={o.goal} icon={o.icon} checked={picked.includes(o.goal)} onToggle={() => toggle(o.goal)}>
            {o.goalLabel}
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
            go(STEP.before);
          }}
        >
          These are my goals
        </button>
      </Cta>
    </Page>
  );
}

/** Where she is, where she wants to be, and the plan between: one screen, her own words. */
export function Summary() {
  const s = useFunnel();
  const name = firstName(s);
  const now = lifeLabels(s.answers);
  const where = now.length > 0 ? now : [WHEN_LABEL[s.answers.when ?? 'varies']];
  const goals = goalLabels(s.answers);
  return (
    <Page progress={PROGRESS[STEP.summary]} backTo={STEP.plan}>
      <h2 className="center">{name != null ? `${name}, here’s your path` : 'Here’s your path'}</h2>
      <section className="card stack gap-s">
        <span className="eyebrow">Today</span>
        <ul className="plain">
          {where.slice(0, 3).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
      <div className="down" aria-hidden="true" />
      <section className="card soft stack gap-s">
        <span className="eyebrow">Your goals</span>
        <ul className="ticks">
          {goals.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      </section>
      <div className="down" aria-hidden="true" />
      <section className="card stack gap-s">
        <span className="eyebrow">Your plan</span>
        <h3>{PLAN_NAME[kindOf(s.answers)]}</h3>
        <p className="small">{planLine(s.answers)}</p>
      </section>
      <Cta>
        <button className="btn" type="button" onClick={() => (track('step_completed', { step: STEP.summary }), go(STEP.email))}>
          Get my plan
        </button>
      </Cta>
    </Page>
  );
}

