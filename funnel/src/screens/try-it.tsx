import { useEffect, useRef, useState } from 'react';

import { moveOf } from '../engine/plan';
import { APP_STORE_RATING } from '../config';
import {
  DAY_LABEL,
  FIRST_STEP_MOVES,
  FIRST_STEP_SOURCE,
  FOCUS_LABEL,
  goalLabels,
  kindOf,
  PLAN_NAME,
  PROGRESS,
  sessionOne,
  STEP,
  tryMove,
  WHEN_LABEL,
} from '../flow';
import { track } from '../lib/analytics';
import { go } from '../router';
import { update, useFunnel, type TryIt } from '../state';
import { ADVANCE_MS, Choice, clock, Clip, Cta, Page, Reaction } from '../ui';

const LENGTH = 60;

export function TryMove() {
  const s = useFunnel();
  const move = tryMove(s.answers);
  const [state, setState] = useState<'ready' | 'running' | 'paused'>('ready');
  const [left, setLeft] = useState(LENGTH);
  const leftRef = useRef(LENGTH);

  useEffect(() => {
    if (state !== 'running') return;
    const timer = setInterval(() => {
      leftRef.current -= 1;
      setLeft(leftRef.current);
      if (leftRef.current <= 0) {
        clearInterval(timer);
        finish(false);
      }
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const finish = (early: boolean) => {
    const seconds = LENGTH - Math.max(0, leftRef.current);
    update((x) => ({ tryIt: { ...x.tryIt, seconds, skipped: false } }));
    track('tryit_finished', { stopped_early: early });
    go(STEP.after, { replace: true });
  };

  return (
    <Page progress={PROGRESS[STEP.move]}>
      <div className="stack gap-s">
        <span className="eyebrow">60 seconds</span>
        <h2>{move.title}</h2>
        <p className="small">Before we build your plan, try the first move in it. You can do it sitting down.</p>
      </div>
      {move.clip != null && <Clip src={move.clip} poster={move.poster} playing={state !== 'paused'} label={`${move.title}: ${move.cue}`} />}
      <p className="card" aria-live="polite">
        {move.cue}
      </p>
      {state === 'ready' ? (
        <>
          <p className="small">Sit at the front of a sturdy chair, feet on the floor. Stop if anything hurts.</p>
          <Cta>
            <button
              className="btn"
              type="button"
              onClick={() => {
                track('tryit_started');
                setState('running');
              }}
            >
              Start 60 seconds
            </button>
            <button
              className="btn quiet"
              type="button"
              onClick={() => {
                update((x) => ({ tryIt: { ...x.tryIt, skipped: true } }));
                track('tryit_skipped');
                go(STEP.wake);
              }}
            >
              Not now
            </button>
          </Cta>
        </>
      ) : (
        <>
          <div className="stack">
            <div className="clock" aria-live="off">
              {clock(left)}
            </div>
            <div className="ring">
              <div style={{ width: `${((LENGTH - left) / LENGTH) * 100}%` }} />
            </div>
          </div>
          <Cta>
            <div className="row">
              <button className="btn secondary" type="button" onClick={() => setState(state === 'running' ? 'paused' : 'running')}>
                {state === 'running' ? 'Pause' : 'Keep going'}
              </button>
              <button className="btn secondary" type="button" onClick={() => finish(true)}>
                That’s enough
              </button>
            </div>
          </Cta>
        </>
      )}
    </Page>
  );
}

/** The stored values are older than the labels: the words no longer lead her to report a change. */
const FELT: ReadonlyArray<{ value: NonNullable<TryIt['felt']>; label: string }> = [
  { value: 'lighter', label: 'Good' },
  { value: 'better', label: 'Fine' },
  { value: 'same', label: 'Didn’t feel much' },
  { value: 'unsure', label: 'Not sure I did it right' },
];

/** "How did that feel?", answered in words, under the move's still. No scale, no number. */
export function After() {
  const s = useFunnel();
  const pick = (felt: NonNullable<TryIt['felt']>) => {
    update((x) => ({ tryIt: { ...x.tryIt, felt } }));
    track('step_completed', { step: STEP.after });
    setTimeout(() => go(STEP.felt), ADVANCE_MS);
  };
  return (
    <Page progress={PROGRESS[STEP.after]}>
      <img className="still" src={tryMove(s.answers).poster} alt="" />
      <div className="stack gap-s center">
        <h2>How did that feel?</h2>
        <p className="small">Take a moment to notice.</p>
      </div>
      <div className="stack">
        {FELT.map((o) => (
          <Choice key={o.value} selected={s.tryIt.felt === o.value} onClick={() => pick(o.value)}>
            {o.label}
          </Choice>
        ))}
      </div>
    </Page>
  );
}

/**
 * Her answer, given back as what she did, never as what it did to her feet.
 * How many moves are left today is counted from her plan, never typed.
 */
export function FeltAnswer() {
  const s = useFunnel();
  const good = s.tryIt.felt === 'lighter' || s.tryIt.felt === 'better';
  const left = sessionOne(s).length;
  return (
    <Reaction
      step={STEP.felt}
      photo={{ src: tryMove(s.answers).poster }}
      title={good ? 'Nice work. That’s the first move of your plan.' : 'That’s common the first time.'}
      next={STEP.wake}
    >
      {good ? (
        left > 0 && <p>Today’s session has {left === 1 ? 'one more' : 'two more'} like it.</p>
      ) : (
        <p>New moves often feel awkward at first. In the app, every move has a video you can follow.</p>
      )}
    </Reaction>
  );
}

/**
 * Something she uses tomorrow: three moves on the edge of the bed, about 2
 * minutes, before her first step. The study is a "why" link, never a promise.
 */
export function Routine() {
  const s = useFunnel();
  const hero = s.answers.when === 'morning' || s.answers.life?.includes('mornings') === true;
  const moves = FIRST_STEP_MOVES.map((id) => moveOf({ id }));
  useEffect(() => {
    track('first_step_routine_shown');
  }, []);
  return (
    <Page progress={PROGRESS[STEP.routine]}>
      <div className="stack gap-s">
        <span className="eyebrow">{hero ? 'Your first-step routine' : 'A bonus for your mornings'}</span>
        <h2>Tomorrow morning, before your first step</h2>
        <p className="small">2 minutes on the edge of the bed. 3 moves.</p>
      </div>
      <div className="stack">
        {moves.map((m, i) => (
          <div className="card move" key={m.id}>
            <img src={m.poster} alt="" loading="lazy" />
            <div>
              <div style={{ fontWeight: 700 }}>
                {i + 1}. {m.title}
              </div>
              <div className="caption">{m.cue}</div>
            </div>
          </div>
        ))}
      </div>
      <details>
        <summary>Why before your first step?</summary>
        <p className="small">
          Stretching the sole of the foot before the first steps of the day is how a well-known study set up its stretching program.{' '}
          <a href={FIRST_STEP_SOURCE.url} target="_blank" rel="noopener noreferrer">
            {FIRST_STEP_SOURCE.label}
          </a>
        </p>
      </details>
      <Cta>
        <button
          className="btn"
          type="button"
          onClick={() => (track('step_completed', { step: STEP.routine }), go(STEP.commit))}
        >
          Add it to my plan
        </button>
      </Cta>
    </Page>
  );
}

const LINE_MS = 900;
const R = 72;
const TURN = 2 * Math.PI * R;

/**
 * Her answers, read back one by one as the plan is put together. Every line
 * is something she told us or did, so the work shown is the work done.
 */
export function Building() {
  const s = useFunnel();
  const a = s.answers;
  const goals = goalLabels(a);
  const lines = [
    `${FOCUS_LABEL[a.focus ?? 'heel']} · ${WHEN_LABEL[a.when ?? 'varies'].toLowerCase()}`,
    a.day != null ? DAY_LABEL[a.day] : `${a.minutes ?? 5} minutes a day`,
    goals[0] != null ? `Goal: ${goals[0]}` : null,
    `Your plan: ${PLAN_NAME[kindOf(a)]}`,
  ].filter((line): line is string => line != null);
  const total = lines.length * LINE_MS;
  const [done, setDone] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => {
      const part = Math.min(1, (Date.now() - started) / total);
      setDone(part);
      if (part >= 1) {
        clearInterval(timer);
        setTimeout(() => go(STEP.name, { replace: true }), 700);
      }
    }, 60);
    return () => clearInterval(timer);
  }, [total]);
  const shown = Math.min(lines.length, Math.floor(done * lines.length) + 1);
  return (
    <Page progress={PROGRESS[STEP.building]} backTo={null}>
      <h2 className="center">Putting your plan together</h2>
      <div className="dial" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(done * 100)}>
        <svg viewBox="0 0 168 168">
          <circle className="bg" cx="84" cy="84" r={R} />
          <circle className="fg" cx="84" cy="84" r={R} strokeDasharray={TURN} strokeDashoffset={TURN * (1 - done)} />
        </svg>
        <b>{Math.round(done * 100)}%</b>
      </div>
      <p className="caption center">Rated {APP_STORE_RATING} ★ on the App Store</p>
      <div className="card">
        <ul className="ticks reading">
          {lines.slice(0, shown).map((line, i) => (
            <li key={line} className={i < shown - 1 || done >= 1 ? 'fade' : 'fade pending'}>
              {line}
            </li>
          ))}
        </ul>
      </div>
    </Page>
  );
}
