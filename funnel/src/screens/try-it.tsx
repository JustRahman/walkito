import { useEffect, useRef, useState, type ReactNode } from 'react';

import { DAY_LABEL, firstName, FOCUS_LABEL, goalLabels, kindOf, offersBalance, PLAN_NAME, PROGRESS, STEP, tryMove, WHEN_LABEL } from '../flow';
import { track } from '../lib/analytics';
import { go } from '../router';
import { update, useFunnel, type TryIt } from '../state';
import { Choice, clock, Clip, Cta, Page, Slide, Tick } from '../ui';

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
    <Page progress={PROGRESS[STEP.move]} backTo={STEP.goals}>
      <div className="stack gap-s">
        <span className="eyebrow">Try it now · 60 seconds</span>
        <h2>{move.title}</h2>
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
                go(STEP.sign);
              }}
            >
              Skip, show my plan
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

const FELT: ReadonlyArray<{ value: NonNullable<TryIt['felt']>; label: string }> = [
  { value: 'lighter', label: 'Lighter, looser' },
  { value: 'better', label: 'A little better' },
  { value: 'same', label: 'About the same' },
  { value: 'unsure', label: 'Hard to tell' },
];

/** The move's still on a warm top, the question in words (Headspace's "How'd it go?"). */
function Felt({ children, backTo, progress }: { children: ReactNode; backTo: string; progress: string }) {
  const s = useFunnel();
  const move = tryMove(s.answers);
  return (
    <Page progress={PROGRESS[progress]} backTo={backTo}>
      <div className="felt-top">
        <img src={move.poster} alt="" />
      </div>
      {children}
    </Page>
  );
}

/** "How did that feel?", answered in words. No scale, no number. */
export function After() {
  const s = useFunnel();
  const pick = (felt: NonNullable<TryIt['felt']>) => {
    update((x) => ({ tryIt: { ...x.tryIt, felt } }));
    track('step_completed', { step: STEP.after });
    setTimeout(() => go(STEP.felt), 200);
  };
  return (
    <Felt backTo={STEP.move} progress={STEP.after}>
      <div className="stack gap-s center">
        <h2>How did that feel?</h2>
        <p className="small">Take a moment to notice.</p>
      </div>
      <div className="stack">
        {FELT.map((o) => (
          <Choice key={o.value} className="soft-choice" selected={s.tryIt.felt === o.value} onClick={() => pick(o.value)}>
            {o.label}
          </Choice>
        ))}
      </div>
    </Felt>
  );
}

/** Her answer, given back as what it means for her own goal (Headspace, Liven). Never a dead end. */
export function FeltAnswer() {
  const s = useFunnel();
  const goal = goalLabels(s.answers)[0] ?? 'Walk without thinking about my feet';
  const good = s.tryIt.felt === 'lighter' || s.tryIt.felt === 'better';
  return (
    <Felt backTo={STEP.after} progress={STEP.felt}>
      <div className="stack gap-s center">
        <h2>{good ? 'That’s your feet waking up.' : 'That’s normal on day 1.'}</h2>
        {good ? (
          <p className="lead">
            Do this daily and you’re working toward: <b className="goal-word">{goal}</b>
          </p>
        ) : (
          <p className="lead">Feet change with daily practice, not one move. Tomorrow’s move is ready.</p>
        )}
      </div>
      <Cta>
        <button className="btn" type="button" onClick={() => (track('step_completed', { step: STEP.felt }), go(STEP.praise))}>
          Next
        </button>
      </Cta>
    </Felt>
  );
}

/** Full colour, one line (pliability, QUITTR). */
export function Praise() {
  const s = useFunnel();
  const name = firstName(s);
  return (
    <Slide
      tone="praise"
      label="Continue"
      next={() => (track('step_completed', { step: STEP.praise }), go(offersBalance(s.answers) ? STEP.balance : STEP.sign))}
    >
      <h1 className="praise">
        {name != null ? `Nice work, ${name}.` : 'Nice work.'}
        <br />
        Day 1 of your plan is done <span className="praise-tick"><Tick /></span>
      </h1>
    </Slide>
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
    <Page progress={PROGRESS[STEP.balance]} backTo={STEP.praise}>
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
                go(STEP.sign);
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
            <button className="btn" type="button" onClick={() => go(STEP.sign)}>
              Continue
            </button>
          </Cta>
        </>
      )}
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
        setTimeout(() => go(STEP.plan, { replace: true }), 700);
      }
    }, 60);
    return () => clearInterval(timer);
  }, [total]);
  const shown = Math.min(lines.length, Math.floor(done * lines.length) + 1);
  return (
    <Page progress={PROGRESS[STEP.building]}>
      <h2 className="center">Analyzing your answers</h2>
      <div className="dial" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(done * 100)}>
        <svg viewBox="0 0 168 168">
          <circle className="bg" cx="84" cy="84" r={R} />
          <circle className="fg" cx="84" cy="84" r={R} strokeDasharray={TURN} strokeDashoffset={TURN * (1 - done)} />
        </svg>
        <b>{Math.round(done * 100)}%</b>
      </div>
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
