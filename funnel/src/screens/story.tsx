import { useEffect, useMemo, useRef, useState } from 'react';

import { PREVIEW, url } from '../config';
import { kindOf, lifeFor, mentionedGoals, PROGRESS, shortDate, STEP } from '../flow';
import { track } from '../lib/analytics';
import { PLACEHOLDER_REVIEWS } from '../preview/placeholders';
import { go } from '../router';
import { answer, update, useFunnel } from '../state';
import { Cta, MultiChoice, Page, Slide } from '../ui';

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
      <h1 className="center">Here’s your Walkito card</h1>
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
      <input
        className="field"
        type="text"
        autoComplete="given-name"
        aria-label="Your first name"
        maxLength={30}
        placeholder="Your first name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && next()}
      />
      <Cta>
        <button className="btn" type="button" onClick={next}>
          {name.trim() === '' ? 'Continue' : `Let’s go, ${name.trim()}`}
        </button>
      </Cta>
    </Page>
  );
}

/** How her feet get in the way: a warm banner on top, her day underneath (QUITTR's symptoms screen). */
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
      <p className="alert">Foot pain changes your whole day.</p>
      <h3>Choose all that apply:</h3>
      <div className="stack">
        {lifeFor(s.answers).map((o) => (
          <MultiChoice key={o.value} className="warm" checked={picked.includes(o.value)} onToggle={() => toggle(o.value)}>
            {o.label}
          </MultiChoice>
        ))}
        <MultiChoice className="warm" checked={picked.includes('none')} onToggle={() => toggle('none')}>
          None of these
        </MultiChoice>
      </div>
      <Cta>
        <button
          className="btn warm"
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

/** Card 1 of 3: the problem, with no blame on her. */
export function Fault() {
  const s = useFunnel();
  const runner = kindOf(s.answers) === 'runner';
  return (
    <Slide tone="warm" dots={{ at: 0, of: 3 }} next={() => (track('step_completed', { step: STEP.fault }), go(STEP.path))}>
      <img className="still" src={poster('short_foot_seated')} alt="" />
      <h1>{runner ? 'Cushioned shoes leave your feet less to do.' : 'Sitting all day weakens your feet.'}</h1>
      <p>Chairs and soft shoes do your foot muscles’ job.</p>
    </Slide>
  );
}

/** Card 2 of 3: it can change. */
export function Path() {
  return (
    <Slide tone="deep" dots={{ at: 1, of: 3 }} next={() => (track('step_completed', { step: STEP.path }), go(STEP.research))}>
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

/** Card 3 of 3: where the exercises come from. */
export function Research() {
  return (
    <Slide tone="sky" dots={{ at: 2, of: 3 }} next={() => (track('step_completed', { step: STEP.research }), go(STEP.compare))}>
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

/** Without Walkito / With Walkito, as Flo's: two cards, the second raised. */
export function Compare() {
  return (
    <Page progress={PROGRESS[STEP.compare]} backTo={STEP.research}>
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
 * or edited by us. Both are 5 stars there.
 */
export const REVIEWS = [
  {
    author: 'Kolodi',
    text: 'honestly didn’t expect much but it’s pretty nice. answered a few questions about my feet and it made me a daily plan, takes like a few min. gonna try it for a couple weeks and see',
  },
  {
    author: 'AhmetAZ',
    text: 'Really liked this app. The interface is clean and easy to navigate, and programs are easy to follow. Helped with my heel pain. Would recommend',
  },
] as const;

/** Its own screen, as QUITTR's: who already uses it, in their words. No counts. */
export function Reviews() {
  return (
    <Slide tone="night" next={() => (track('step_completed', { step: STEP.reviews }), go(STEP.goals))}>
      <h1>Made for people like you</h1>
      <div className="stack" style={{ width: '100%' }}>
        {(PREVIEW ? PLACEHOLDER_REVIEWS : REVIEWS).map((r) => (
          <figure className="review-dark" key={r.author} data-placeholder={'mark' in r ? r.mark : undefined}>
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
        {!PREVIEW && <p className="caption-light">From the App Store</p>}
      </div>
    </Slide>
  );
}

/** Her goals: coloured pills with a check, as QUITTR's. None is ticked for her: the mirror of what she told us comes first, and says so. */
export function Goals() {
  const s = useFunnel();
  const [picked, setPicked] = useState<string[]>(s.answers.goals ?? []);
  const toggle = (goal: string) => setPicked((now) => (now.includes(goal) ? now.filter((g) => g !== goal) : [...now, goal]));
  const mentioned = mentionedGoals(s.answers);
  const options = lifeFor(s.answers);
  const hersFirst = [...options.filter((o) => mentioned.includes(o.goal)), ...options.filter((o) => !mentioned.includes(o.goal))];
  return (
    <Page progress={PROGRESS[STEP.goals]} backTo={STEP.reviews}>
      <h2 className="center">What do you want back?</h2>
      <div className="stack">
        {hersFirst.map((o) => (
          <MultiChoice
            key={o.goal}
            className="goal"
            style={{ background: o.color }}
            icon={o.icon}
            checked={picked.includes(o.goal)}
            onToggle={() => toggle(o.goal)}
          >
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

/** A promise to herself, signed with a finger (QUITTR). Nothing of the drawing is kept. */
export function Sign() {
  const s = useFunnel();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const c = canvas.current;
    if (c == null) return;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.clientWidth * ratio;
    c.height = c.clientHeight * ratio;
    const ctx = c.getContext('2d')!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111114';
    let down = false;
    const at = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top] as const;
    };
    const start = (e: PointerEvent) => {
      down = true;
      c.setPointerCapture(e.pointerId);
      const [x, y] = at(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
    };
    const move = (e: PointerEvent) => {
      if (!down) return;
      const [x, y] = at(e);
      ctx.lineTo(x, y);
      ctx.stroke();
      setDrawn(true);
    };
    const end = () => {
      down = false;
    };
    c.addEventListener('pointerdown', start);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    return () => {
      c.removeEventListener('pointerdown', start);
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', end);
      c.removeEventListener('pointercancel', end);
    };
  }, []);
  const clear = () => {
    const c = canvas.current;
    c?.getContext('2d')?.clearRect(0, 0, c.width, c.height);
    setDrawn(false);
  };
  return (
    <main className="slide night">
      <div className="slide-body sign">
        <h2>Sign your commitment</h2>
        <p>Promise yourself {s.answers.minutes ?? 5} minutes a day for your feet.</p>
        <canvas ref={canvas} className="pad" aria-label="Sign here with your finger" />
        <div className="pad-foot">
          <button type="button" className="link-light" onClick={clear}>
            Clear
          </button>
        </div>
        <p className="caption-light">Draw on the open space above</p>
      </div>
      <button
        className="btn"
        type="button"
        disabled={!drawn}
        onClick={() => {
          track('step_completed', { step: STEP.sign });
          go(STEP.building);
        }}
      >
        Finish
      </button>
    </main>
  );
}

