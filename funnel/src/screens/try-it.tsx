import { useEffect, useRef, useState } from 'react';

import { FOCUS_LABEL, offersBalance, PROGRESS, STEP, tryMove } from '../flow';
import { track } from '../lib/analytics';
import { go } from '../router';
import { update, useFunnel } from '../state';
import { clock, Clip, Cta, Page, Scale } from '../ui';

export function Before() {
  const s = useFunnel();
  const pick = (n: number) => {
    update((x) => ({ tryIt: { ...x.tryIt, before: n, skipped: false } }));
    track('step_completed', { step: STEP.before });
    setTimeout(() => go(STEP.move), 220);
  };
  return (
    <Page progress={PROGRESS[STEP.before]} backTo={STEP.minutes}>
      <div className="stack gap-s">
        <span className="eyebrow">Try it now</span>
        <h2>One move. 60 seconds. Seated.</h2>
        <p className="lead">First, how do your feet feel right now?</p>
      </div>
      <Scale value={s.tryIt.before} onPick={pick} low="Loose" high="Very stiff" />
      <div className="spacer" />
      <button
        className="btn quiet"
        type="button"
        onClick={() => {
          update((x) => ({ tryIt: { ...x.tryIt, skipped: true } }));
          track('tryit_skipped');
          go(STEP.building);
        }}
      >
        Skip, show my plan
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
    <Page progress={PROGRESS[STEP.move]} backTo={STEP.before}>
      <h2>{move.title}</h2>
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

export function After() {
  const s = useFunnel();
  const [now, setNow] = useState<number | undefined>(s.tryIt.after);
  const before = s.tryIt.before;
  const next = offersBalance(s.answers) ? STEP.balance : STEP.building;
  if (now == null)
    return (
      <Page progress={PROGRESS[STEP.after]} backTo={STEP.move}>
        <div className="stack gap-s">
          <span className="eyebrow">Well done</span>
          <h2>How do your feet feel now?</h2>
        </div>
        <Scale
          onPick={(n) => {
            setNow(n);
            update((x) => ({ tryIt: { ...x.tryIt, after: n } }));
            track('step_completed', { step: STEP.after });
          }}
          low="Loose"
          high="Very stiff"
        />
      </Page>
    );
  return (
    <Page progress={PROGRESS[STEP.after]} backTo={STEP.move}>
      <div className="stack gap-s center">
        <span className="eyebrow">Day 1, move 1</span>
        <h2>That’s your first move done</h2>
      </div>
      <div className="card pop">
        <div className="row center">
          <div>
            <div className="caption">Before</div>
            <div style={{ fontSize: '2.6rem', fontWeight: 800 }}>{before ?? '–'}</div>
          </div>
          <div style={{ flex: 'none', alignSelf: 'center', color: 'var(--caption)', fontSize: '1.6rem' }} aria-hidden="true">
            →
          </div>
          <div>
            <div className="caption">Now</div>
            <div style={{ fontSize: '2.6rem', fontWeight: 800, color: 'var(--primary)' }}>{now}</div>
          </div>
        </div>
      </div>
      <p className="small center">Your own note for today. Some days it changes, some days it doesn’t.</p>
      <Cta>
        <button className="btn" type="button" onClick={() => go(next)}>
          Continue
        </button>
      </Cta>
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
    <Page progress={PROGRESS[STEP.balance]} backTo={STEP.after}>
      {phase === 'intro' && (
        <>
          <div className="stack gap-s">
            <span className="eyebrow">Optional</span>
            <h2>A 10-second balance check</h2>
          </div>
          <div className="card stack">
            <p>Stand by a counter, one hand just above it. Lift one foot a little. We count to 10.</p>
            <p className="small">Put your foot down or hold on any time. That is not failing.</p>
          </div>
          <Cta>
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
          </Cta>
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
          <Cta>
            <button className="btn" type="button" style={{ minHeight: 96 }} onClick={() => stop(Math.min(HOLD, Math.floor((Date.now() - started.current) / 1000)))}>
              Foot down
            </button>
          </Cta>
        </>
      )}
      {phase === 'done' && (
        <>
          <div className="stack gap-s center">
            <h2>
              You held {held} {held === 1 ? 'second' : 'seconds'}
            </h2>
            <p className="lead">A starting note for your plan. Not a medical test.</p>
          </div>
          <Cta>
            <button className="btn" type="button" onClick={() => go(STEP.building)}>
              Continue
            </button>
          </Cta>
        </>
      )}
    </Page>
  );
}

const BUILD_MS = 3600;
const R = 72;
const TURN = 2 * Math.PI * R;

/** The plan being put together: a dial that fills as her own answers tick off. */
export function Building() {
  const s = useFunnel();
  const lines = [
    FOCUS_LABEL[s.answers.focus ?? 'heel'],
    s.answers.start === 'standing' ? 'Standing, hand on a counter' : s.answers.start === 'bed' ? 'On the edge of the bed' : 'In a chair',
    `${s.answers.minutes ?? 5} minutes a day`,
    'Built on physical therapy guidelines',
  ];
  const [done, setDone] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => {
      const part = Math.min(1, (Date.now() - started) / BUILD_MS);
      setDone(part);
      if (part >= 1) {
        clearInterval(timer);
        setTimeout(() => go(STEP.plan, { replace: true }), 450);
      }
    }, 60);
    return () => clearInterval(timer);
  }, []);
  return (
    <Page progress={PROGRESS[STEP.building]}>
      <h2 className="center">Building your plan…</h2>
      <div className="dial" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(done * 100)}>
        <svg viewBox="0 0 168 168">
          <circle className="bg" cx="84" cy="84" r={R} />
          <circle className="fg" cx="84" cy="84" r={R} strokeDasharray={TURN} strokeDashoffset={TURN * (1 - done)} />
        </svg>
        <b>{Math.round(done * 100)}%</b>
      </div>
      <div className="card">
        <ul className="ticks">
          {lines.map((line, i) => (
            <li key={line} style={{ opacity: done >= (i + 1) / (lines.length + 0.5) ? 1 : 0.25, transition: 'opacity 300ms ease' }}>
              {line}
            </li>
          ))}
        </ul>
      </div>
    </Page>
  );
}
