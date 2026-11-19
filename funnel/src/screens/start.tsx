import { useEffect, useMemo, useRef, useState } from 'react';

import { url, YEARLY_UPGRADE_ENABLED } from '../config';
import { minutesOf, MOVE_CAP, sessionOne, STEP } from '../flow';
import { access, saveAnswers } from '../lib/account';
import { track } from '../lib/analytics';
import { go } from '../router';
import { update, useFunnel, type FunnelState } from '../state';
import { AppButton, Choice, Clip, clock, Page } from '../ui';
import { YearlyUpgrade } from './upgrade';

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

export function StartDay1() {
  const s = useFunnel();
  const moves = useMemo(() => sessionOne(s), [s.answers]);
  const status = useAccess();
  const [index, setIndex] = useState(-1);
  const [left, setLeft] = useState(0);
  const [paused, setPaused] = useState(false);
  const leftRef = useRef(0);

  /** She did the first move of today's session in the quiz, so what is here is the rest of it: Day 1 happens once. */
  const begun = s.tryIt.skipped !== true && (s.tryIt.seconds ?? 0) > 0;
  const move = index >= 0 ? moves[index] : undefined;
  const minutes = minutesOf(moves);

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

  // Monthly buyers only, once, and only while the flag is on (it is off).
  if (YEARLY_UPGRADE_ENABLED && s.purchased === true && s.plan === 'monthly' && s.upgrade == null && index < 0) return <YearlyUpgrade />;
  if (s.session1 === 'done' || index >= moves.length) return <AfterSession />;

  return (
    <Page footer={move == null}>
      {move == null ? (
        <>
          <h1>You’re in.</h1>
          <AccessLine status={status} email={s.email} />
          <GetTheApp email={s.email} via={s.via} />
          <section className="stack">
            <h2>{begun ? 'Or finish today’s session here' : 'Or start today’s session here'}</h2>
            <p className="small">
              {moves.length === 1 ? 'One move' : `${moves.length} moves`}
              {begun ? ' left' : ''}, about {minutes} {minutes > 1 ? 'minutes' : 'minute'}, in your browser. At your own pace.
            </p>
            {moves.map((m) => (
              <div className="card move" key={m.id}>
                <img src={m.poster} alt="" />
                <div>
                  <div style={{ fontWeight: 700 }}>{m.title}</div>
                  <div className="caption">{m.dose}</div>
                </div>
              </div>
            ))}
          </section>
          <button
            className="btn secondary"
            type="button"
            onClick={() => {
              update({ session1: 'started' });
              track('session1_started');
              begin(0);
            }}
          >
            {begun ? 'Finish today’s session in the browser' : 'Start today’s session in the browser'}
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

/** The one thing to do after paying: the app, signed in to this same account. */
function GetTheApp({ email, via, from = 'start' }: { email?: string; via?: 'google' | 'email'; from?: string }) {
  const ua = navigator.userAgent;
  const android = /Android/.test(ua);
  const ios = /iPhone|iPad|iPod/.test(ua);
  const address = <b>{email ?? 'the email you used here'}</b>;
  return (
    <div className="card stack gap-l">
      <img className="hero" style={{ height: 210 }} src={url('/img/phone-home.webp')} alt="The Walkito app" />
      <div className="stack gap-s center">
        <h2>Now get the app</h2>
        <p className="small">Your plan is already in it. Nothing to buy again.</p>
      </div>
      <ol className="steps">
        <li>
          <span>Download Walkito{ios ? ' from the App Store' : android ? ' from Google Play' : ' on your phone'}.</span>
        </li>
        <li>
          <span>Open it and tap “Already have an account? Sign in”.</span>
        </li>
        <li>
          {via === 'google' && android ? (
            <span>Tap “Continue with Google” and choose {address}.</span>
          ) : (
            <span>Tap “Use email instead” and enter {address}. We email you a 6-digit code.</span>
          )}
        </li>
      </ol>
      <AppButton from={from} label="Download Walkito" />
      {!ios && !android && <p className="caption">On a computer? Search “Walkito” in the App Store or Google Play on your phone.</p>}
    </div>
  );
}

function AccessLine({ status, email }: { status: 'checking' | 'yes' | 'slow'; email?: string }) {
  if (status === 'yes') return <p className="note">Your plan is active for {email}.</p>;
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
    <Page footer>
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
          <GetTheApp email={s.email} via={s.via} from="success" />
          <button className="btn quiet" type="button" onClick={() => go(STEP.me)}>
            Keep using Walkito in the browser
          </button>
        </section>
      )}
    </Page>
  );
}
