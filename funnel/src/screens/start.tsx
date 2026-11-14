import { useEffect, useMemo, useRef, useState } from 'react';

import { sessionOne, STEP } from '../flow';
import { access, saveAnswers } from '../lib/account';
import { track } from '../lib/analytics';
import { go } from '../router';
import { update, useFunnel, type FunnelState } from '../state';
import { AppButton, Choice, Clip, clock, Page } from '../ui';

/** Waits for the webhook to unlock the account: about a minute, then says so honestly. */
function useAccess(): 'checking' | 'yes' | 'slow' {
  const [state, setState] = useState<'checking' | 'yes' | 'slow'>('checking');
  useEffect(() => {
    let stopped = false;
    const started = Date.now();
    const poll = async () => {
      while (!stopped && Date.now() - started < 90_000) {
        const a = await access();
        if (a?.access === true) {
          track('access_confirmed', { waited_s: Math.round((Date.now() - started) / 1000) });
          if (!stopped) setState('yes');
          return;
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
      if (!stopped) setState('slow');
    };
    void poll();
    return () => {
      stopped = true;
    };
  }, []);
  return state;
}

const MOVE_CAP = 120;

export function StartDay1() {
  const s = useFunnel();
  const moves = useMemo(() => sessionOne(s), [s.answers]);
  const status = useAccess();
  const [index, setIndex] = useState(-1);
  const [left, setLeft] = useState(0);
  const [paused, setPaused] = useState(false);
  const leftRef = useRef(0);

  const move = index >= 0 ? moves[index] : undefined;
  const total = moves.reduce((sum, m) => sum + Math.min(MOVE_CAP, m.seconds), 0);

  const begin = (i: number) => {
    const next = moves[i];
    if (next == null) {
      update({ session1: 'done' });
      track('session1_completed');
      setIndex(moves.length);
      return;
    }
    leftRef.current = Math.min(MOVE_CAP, next.seconds);
    setLeft(leftRef.current);
    setPaused(false);
    setIndex(i);
  };

  useEffect(() => {
    if (move == null || paused) return;
    const timer = setInterval(() => {
      leftRef.current -= 1;
      setLeft(leftRef.current);
      if (leftRef.current <= 0) {
        clearInterval(timer);
        begin(index + 1);
      }
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, paused]);

  if (s.session1 === 'done' || index >= moves.length) return <AfterSession />;

  return (
    <Page footer={move == null}>
      {move == null ? (
        <>
          <div className="stack">
            <h1>You’re in. Start Day 1 now.</h1>
            <p className="lead">
              {moves.length === 1 ? 'One move' : `${moves.length} moves`}, about {Math.max(1, Math.round(total / 60))}{' '}
              {Math.round(total / 60) > 1 ? 'minutes' : 'minute'}. At your own pace.
            </p>
          </div>
          <AccessLine status={status} email={s.email} />
          <div className="stack">
            {moves.map((m) => (
              <div className="card move" key={m.id}>
                <img src={m.poster} alt="" />
                <div>
                  <div style={{ fontWeight: 700 }}>{m.title}</div>
                  <div className="caption">{m.dose}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="spacer" />
          <button
            className="btn"
            type="button"
            onClick={() => {
              update({ session1: 'started' });
              track('session1_started');
              begin(0);
            }}
          >
            Start Day 1
          </button>
          <button className="btn quiet" type="button" onClick={() => go(STEP.me)}>
            Later
          </button>
        </>
      ) : (
        <>
          <div className="stack">
            <span className="caption">
              Move {index + 1} of {moves.length}
            </span>
            <h2>{move.title}</h2>
            <p className="caption">{move.dose}</p>
          </div>
          {move.clip != null && <Clip src={move.clip} poster={move.poster} playing={!paused} label={`${move.title}: ${move.cue}`} />}
          <p className="card">{move.cue}</p>
          <div className="clock">{clock(left)}</div>
          <div className="row">
            <button className="btn secondary" type="button" onClick={() => setPaused(!paused)}>
              {paused ? 'Keep going' : 'Pause'}
            </button>
            <button className="btn secondary" type="button" onClick={() => begin(index + 1)}>
              {index + 1 < moves.length ? 'Next move' : 'Finish'}
            </button>
          </div>
          <p className="caption">Move only as far as feels comfortable. Stop if anything hurts.</p>
        </>
      )}
    </Page>
  );
}

function AccessLine({ status, email }: { status: 'checking' | 'yes' | 'slow'; email?: string }) {
  if (status === 'yes') return <p className="note">Your plan is unlocked for {email}.</p>;
  if (status === 'slow')
    return (
      <p className="note">
        Your payment went through. Your account can take a few minutes to update. The receipt is on its way to {email}.
      </p>
    );
  return <p className="caption">Setting up your account…</p>;
}

function AfterSession() {
  const s = useFunnel();
  const save = (patch: Partial<FunnelState>) => {
    update(patch);
    const next = { ...s, ...patch };
    void saveAnswers({ plan: { minutes: next.answers.minutes, focus: s.consents?.health === true ? next.answers.focus : undefined, remindAt: next.remindAt, remindBy: next.remindBy, feeling: s.consents?.health === true ? next.feeling : undefined } });
  };
  return (
    <Page>
      <h1>Day 1 is done.</h1>
      {s.feeling == null ? (
        <section className="stack">
          <h2>How did that feel?</h2>
          {(
            [
              ['easy', 'Easy'],
              ['ok', 'About right'],
              ['hard', 'Hard'],
            ] as const
          ).map(([value, label]) => (
            <Choice key={value} onClick={() => save({ feeling: value })}>
              {label}
            </Choice>
          ))}
        </section>
      ) : s.remindAt == null ? (
        <section className="stack">
          <p className="lead">Thank you. Tomorrow’s session takes that into account.</p>
          <h2>When should we remind you?</h2>
          {(
            [
              ['morning', 'In the morning'],
              ['midday', 'Around midday'],
              ['evening', 'In the evening'],
            ] as const
          ).map(([value, label]) => (
            <Choice key={value} onClick={() => save({ remindAt: value })}>
              {label}
            </Choice>
          ))}
        </section>
      ) : s.remindBy == null ? (
        <section className="stack">
          <h2>How should we remind you?</h2>
          <Choice
            onClick={() => {
              save({ remindBy: 'email' });
              track('reminder_chosen', { time: s.remindAt ?? '', channel: 'email' });
            }}
          >
            By email
          </Choice>
          <Choice
            onClick={() => {
              save({ remindBy: 'app' });
              track('reminder_chosen', { time: s.remindAt ?? '', channel: 'app' });
            }}
          >
            With a notification from the app
          </Choice>
        </section>
      ) : (
        <section className="stack gap-l">
          <p className="lead">
            Done. We will remind you {s.remindAt === 'morning' ? 'in the morning' : s.remindAt === 'midday' ? 'around midday' : 'in the evening'}
            {s.remindBy === 'email' ? ' by email.' : ' once you have the app.'}
          </p>
          <div className="card stack">
            <h2>Get the app</h2>
            <p className="lead">
              Your plan is waiting in the Walkito app on iPhone and Android. Open it, tap “Already have an account”, and sign
              in with <b style={{ color: 'var(--text)' }}>{s.email}</b>. No new payment.
            </p>
            <AppButton from="success" label="Get the app" />
          </div>
          <button className="btn quiet" type="button" onClick={() => go(STEP.me)}>
            Keep using Walkito in the browser
          </button>
        </section>
      )}
    </Page>
  );
}
