import { useEffect, useMemo, useRef, useState } from 'react';

import { url, YEARLY_UPGRADE_ENABLED } from '../config';
import { anchorLabel, minutesOf, MOVE_CAP, remindAtFor, savedPlan, sessionOne, STEP } from '../flow';
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
          <section className="stack">
            <h2>
              {begun ? 'Finish' : 'Start'} today’s session: {moves.length === 1 ? '1 move' : `${moves.length} moves`}
              {begun ? ' left' : ''}, about {minutes} {minutes > 1 ? 'minutes' : 'minute'}
            </h2>
            <p className="small">Right here in your browser, at your own pace.</p>
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
            className="btn"
            type="button"
            onClick={() => {
              update({ session1: 'started' });
              track('session1_started');
              begin(0);
            }}
          >
            {begun ? 'Finish today’s session' : 'Start today’s session'}
          </button>
          {/* The app comes second: in full once Day 1 is done, and here for whoever wants it first. */}
          <details>
            <summary>Rather do it in the app?</summary>
            <GetTheApp email={s.email} via={s.via} plain />
          </details>
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
function GetTheApp({ email, via, from = 'start', plain = false }: { email?: string; via?: 'google' | 'email'; from?: string; plain?: boolean }) {
  const ua = navigator.userAgent;
  const android = /Android/.test(ua);
  const ios = /iPhone|iPad|iPod/.test(ua);
  const address = <b>{email ?? 'the email you used here'}</b>;
  return (
    <div className={plain ? 'stack gap-l' : 'card stack gap-l'}>
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

const REMIND_AT = { morning: 'in the morning', midday: 'around midday', evening: 'in the evening' } as const;

function AfterSession() {
  const s = useFunnel();
  const [pickTime, setPickTime] = useState(false);
  /** The time her own moment already says. She can still pick another. */
  const preset = remindAtFor(s.answers);
  const time = s.remindAt ?? (pickTime ? undefined : preset);
  const save = (patch: Partial<FunnelState>) => {
    update(patch);
    void saveAnswers({ plan: savedPlan({ ...s, ...patch }) });
  };
  const remindBy = (channel: 'email' | 'app') => {
    save({ remindAt: time, remindBy: channel });
    track('reminder_chosen', { time: time ?? '', channel });
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
      ) : s.firstSteps == null && s.remindBy == null ? (
        <section className="stack">
          <p className="lead">Thank you. Tomorrow’s session takes that into account.</p>
          <h2>One number for later.</h2>
          <p>How were your first steps this morning, 0 to 10?</p>
          <p className="caption">0 is no pain. 10 is the worst it gets.</p>
          {/* Hers alone: kept on this device, saved with her plan only with her health consent, and in no analytics event. */}
          <div className="scale">
            {Array.from({ length: 11 }, (_, n) => (
              <button key={n} type="button" aria-label={`${n} out of 10`} onClick={() => save({ firstSteps: n })}>
                {n}
              </button>
            ))}
          </div>
          <p className="caption">{s.consents?.health === true ? 'We keep it with your plan.' : 'It stays on this device.'}</p>
          <button className="btn quiet" type="button" onClick={() => save({ firstSteps: 'skipped' })}>
            Skip
          </button>
        </section>
      ) : time == null ? (
        <section className="stack">
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
          {s.remindAt == null && s.answers.anchor != null && (
            <p className="small">
              You picked “{anchorLabel(s.answers.anchor, s.answers)}”, so we’ll remind you {REMIND_AT[time]}.
            </p>
          )}
          <Choice onClick={() => remindBy('email')}>By email</Choice>
          <Choice onClick={() => remindBy('app')}>With a notification from the app</Choice>
          {s.remindAt == null && (
            <button className="btn quiet" type="button" onClick={() => setPickTime(true)}>
              Pick another time
            </button>
          )}
        </section>
      ) : (
        <section className="stack gap-l">
          <p className="lead">
            Done. We will remind you {REMIND_AT[s.remindAt ?? 'morning']}
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
