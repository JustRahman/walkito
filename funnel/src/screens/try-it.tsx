import { useEffect, useRef, useState } from 'react';

import { FOCUS_LABEL, offersBalance, PROGRESS, STEP, tryMove } from '../flow';
import { track } from '../lib/analytics';
import { go } from '../router';
import { update, useFunnel } from '../state';
import { Choice, Clip, clock, Page } from '../ui';

const FEEL = ['Loose and easy', 'A little stiff', 'Stiff', 'Quite stiff', 'Very stiff'] as const;

export function Before() {
  const s = useFunnel();
  const pick = (n: number) => {
    update((x) => ({ tryIt: { ...x.tryIt, before: n, skipped: false } }));
    track('step_completed', { step: STEP.before });
    setTimeout(() => go(STEP.move), 220);
  };
  return (
    <Page progress={PROGRESS[STEP.before]} backTo={STEP.minutes}>
      <div className="stack">
        <h2>Let’s try one move. 60 seconds, seated.</h2>
        <p className="lead">First: how do your feet feel right now?</p>
      </div>
      <div className="stack">
        {FEEL.map((label, i) => (
          <Choice key={label} number={i + 1} selected={s.tryIt.before === i + 1} onClick={() => pick(i + 1)}>
            {label}
          </Choice>
        ))}
      </div>
      <button
        className="btn quiet"
        type="button"
        onClick={() => {
          update((x) => ({ tryIt: { ...x.tryIt, skipped: true } }));
          track('tryit_skipped');
          go(STEP.building);
        }}
      >
        Skip the move, show my plan
      </button>
    </Page>
  );
}

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
    <Page progress={PROGRESS[STEP.move]} backTo={STEP.before} footer={false}>
      <div className="stack">
        <h2>{move.title}</h2>
        {state === 'ready' && (
          <p className="lead">
            Sit toward the front of a sturdy chair. Both feet on the floor. Move only as far as feels comfortable. Stop if
            anything hurts or you feel unwell.
          </p>
        )}
      </div>
      {move.clip != null && <Clip src={move.clip} poster={move.poster} playing={state === 'running'} label={`${move.title}: ${move.cue}`} />}
      <p className="card" aria-live="polite">
        {move.cue}
      </p>
      {state === 'ready' ? (
        <>
          <div className="spacer" />
          <button
            className="btn"
            type="button"
            onClick={() => {
              track('tryit_started');
              setState('running');
            }}
          >
            Start the 60 seconds
          </button>
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
          <div className="row">
            <button className="btn secondary" type="button" onClick={() => setState(state === 'running' ? 'paused' : 'running')}>
              {state === 'running' ? 'Pause' : 'Keep going'}
            </button>
          </div>
          <button className="btn quiet" type="button" onClick={() => finish(true)}>
            That’s enough for me
          </button>
        </>
      )}
    </Page>
  );
}

export function After() {
  const s = useFunnel();
  const [now, setNow] = useState<number | undefined>(s.tryIt.after);
  const before = s.tryIt.before;
  const next = offersBalance(s.answers) ? STEP.balance : STEP.building;
  return (
    <Page progress={PROGRESS[STEP.after]} backTo={STEP.move}>
      <div className="stack">
        <h2>{now == null ? 'Well done. And now?' : 'Thank you.'}</h2>
        {now == null && <p className="lead">How do your feet feel after the move?</p>}
      </div>
      {now == null ? (
        <div className="stack">
          {FEEL.map((label, i) => (
            <Choice
              key={label}
              number={i + 1}
              onClick={() => {
                setNow(i + 1);
                update((x) => ({ tryIt: { ...x.tryIt, after: i + 1 } }));
                track('step_completed', { step: STEP.after });
              }}
            >
              {label}
            </Choice>
          ))}
        </div>
      ) : (
        <>
          <div className="card stack">
            <div className="row" style={{ textAlign: 'center' }}>
              <div>
                <div className="caption">Before</div>
                <div style={{ fontSize: '2.2rem', fontWeight: 800 }}>{before ?? '–'}</div>
              </div>
              <div>
                <div className="caption">Now</div>
                <div style={{ fontSize: '2.2rem', fontWeight: 800 }}>{now}</div>
              </div>
            </div>
            <p className="lead">This is your own note for today. Some days it changes. Some days it does not.</p>
          </div>
          <div className="spacer" />
          <button className="btn" type="button" onClick={() => go(next)}>
            Continue
          </button>
        </>
      )}
    </Page>
  );
}

const HOLD = 10;

export function Balance() {
  const [phase, setPhase] = useState<'intro' | 'holding' | 'done'>('intro');
  const [held, setHeld] = useState(0);
  const started = useRef(0);

  useEffect(() => {
    if (phase !== 'holding') return;
    const timer = setInterval(() => {
      const seconds = Math.min(HOLD, Math.floor((Date.now() - started.current) / 1000));
      setHeld(seconds);
      if (seconds >= HOLD) stop(HOLD);
    }, 200);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const stop = (seconds: number) => {
    setHeld(seconds);
    setPhase('done');
    update((x) => ({ tryIt: { ...x.tryIt, balance: seconds } }));
  };

  return (
    <Page progress={PROGRESS[STEP.balance]} backTo={STEP.after} footer={false}>
      <h2>An optional balance check</h2>
      {phase === 'intro' && (
        <>
          <div className="card stack">
            <p>
              Stand next to a kitchen counter or a sturdy chair back. Keep one hand just above it. Lift one foot a little.
              We count up to 10 seconds.
            </p>
            <p className="lead">Put your foot down or hold on any time. That is not failing.</p>
          </div>
          <div className="spacer" />
          <button
            className="btn"
            type="button"
            onClick={() => {
              started.current = Date.now();
              track('balance_started');
              setPhase('holding');
            }}
          >
            Start
          </button>
          <button
            className="btn quiet"
            type="button"
            onClick={() => {
              update((x) => ({ tryIt: { ...x.tryIt, balance: 'skipped' } }));
              track('balance_skipped');
              go(STEP.building);
            }}
          >
            Skip this
          </button>
        </>
      )}
      {phase === 'holding' && (
        <>
          <div className="clock" aria-live="polite">
            {held} s
          </div>
          <div className="ring">
            <div style={{ width: `${(held / HOLD) * 100}%` }} />
          </div>
          <div className="spacer" />
          <button
            className="btn"
            type="button"
            style={{ minHeight: 96 }}
            onClick={() => stop(Math.min(HOLD, Math.floor((Date.now() - started.current) / 1000)))}
          >
            Foot down
          </button>
        </>
      )}
      {phase === 'done' && (
        <>
          <div className="card stack">
            <h3>
              You held {held} {held === 1 ? 'second' : 'seconds'} today.
            </h3>
            <p className="lead">This is a starting note for your plan. It is not a medical test.</p>
          </div>
          <div className="spacer" />
          <button className="btn" type="button" onClick={() => go(STEP.building)}>
            Continue
          </button>
        </>
      )}
    </Page>
  );
}

export function Building() {
  const s = useFunnel();
  const lines = [
    `Focus: ${FOCUS_LABEL[s.answers.focus ?? 'heel'].toLowerCase()}`,
    `Start: ${s.answers.start === 'standing' ? 'standing, hand on a counter' : s.answers.start === 'bed' ? 'on the edge of the bed' : 'in a chair'}`,
    `${s.answers.minutes ?? 5} minutes a day`,
  ];
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const timers = lines.map((_, i) => setTimeout(() => setShown(i + 1), 500 + i * 600));
    const done = setTimeout(() => go(STEP.plan, { replace: true }), 500 + lines.length * 600 + 500);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(done);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Page progress={PROGRESS[STEP.building]} footer={false}>
      <h2>Putting your first week together…</h2>
      <div className="stack">
        {lines.map((line, i) => (
          <div key={line} className="card" style={{ opacity: i < shown ? 1 : 0.25, transition: 'opacity 300ms ease' }}>
            {line}
          </div>
        ))}
      </div>
    </Page>
  );
}
