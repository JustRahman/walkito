import { useEffect, useMemo } from 'react';

import { adOf, clockLabel, firstName, FOCUS_LABEL, goalLabels, kindOf, OUTLOOK_SOURCE, PLAN_NAME, planLine, planView, STEP, WHEN_LABEL } from '../flow';
import { track } from '../lib/analytics';
import { go } from '../router';
import { useFunnel } from '../state';
import { Cta, Page } from '../ui';
import { herTime, triedRow } from '../words';
import { ReviewCards, TrustLines } from './trust';

/** "2026-11-18" -> "Wed" and "18", in her own time zone. */
function dayOf(date: string): { weekday: string; number: number } {
  const [y, m, d] = date.split('-').map(Number);
  return { weekday: new Date(y!, m! - 1, d!).toLocaleDateString('en-US', { weekday: 'short' }), number: d! };
}

/**
 * Her plan, as the app's own engine built it from her answers: what it was
 * built from, the first week's days, today's moves with the one she just did
 * marked done, tomorrow morning's routine, and what to expect, said plainly.
 * A picture of the plan, never of a result: no length, no date by which
 * anything changes, nothing locked or blurred.
 */
export function Plan() {
  const s = useFunnel();
  const name = firstName(s);
  const view = useMemo(() => planView(s), [s.answers, s.tryIt]);
  const today = view.days[0];
  const sessions = view.days.filter((d) => !d.rest).length;
  const goals = goalLabels(s.answers);
  const a = s.answers;
  const tried = triedRow(a);
  // Ad 1 promised seven days, so her week is counted in days. The plan itself has no end either way.
  const week = adOf(s) === 'ad1_plancard' ? 'Your first 7 days' : 'Your first week';
  useEffect(() => {
    track('plan_viewed');
  }, []);
  return (
    <Page>
      <div className="stack gap-s">
        <h1>
          {name != null ? `${name}, your plan is ` : 'Your plan is '}
          <em>ready</em>
        </h1>
        <p className="lead">
          {PLAN_NAME[kindOf(s.answers)]} · {planLine(s.answers)}
        </p>
      </div>

      <section className="card stack" aria-label="Built from what you told us">
        <h3>Built from what you told us</h3>
        <div>
          <b>Your feet</b>
          <p className="small">
            {FOCUS_LABEL[a.focus ?? 'heel']}
            {a.when != null && ` · ${WHEN_LABEL[a.when].toLowerCase()}`}
          </p>
        </div>
        {tried !== '' && (
          <div>
            <b>Already tried</b>
            <p className="small">{tried[0]!.toUpperCase() + tried.slice(1)}</p>
          </div>
        )}
        <div>
          <b>Your time</b>
          <p className="small">{herTime(a)}</p>
        </div>
      </section>

      <section className="stack" aria-label={week}>
        <h3>{week}</h3>
        <div className="week">
          {view.days.map((d, i) => {
            const { weekday, number } = dayOf(d.date);
            return (
              <div
                key={d.date}
                className={i === 0 ? 'd today' : d.rest ? 'd rest' : 'd'}
                aria-label={`${d.label}: ${d.rest ? 'a rest day' : `${d.minutes} minutes`}`}
              >
                <span>{weekday}</span>
                <i>{number}</i>
              </div>
            );
          })}
        </div>
        <p className="caption">
          {sessions} sessions and {view.days.length - sessions} rest days. Rest days are the outlined ones.
        </p>
      </section>

      {today != null && (
        <section className="stack" aria-label="Today">
          <h3>Today · {today.minutes} min</h3>
          {today.moves.map((m) => (
            <div className="card move" key={m.id}>
              <img src={m.poster} alt="" loading="lazy" />
              <div>
                <div style={{ fontWeight: 700 }}>{m.title}</div>
                <div className="caption">{m.dose}</div>
              </div>
              {m.doneToday && <span className="done">Done</span>}
            </div>
          ))}
        </section>
      )}

      <div className="card">
        <b>Tomorrow morning</b>
        <p className="small">
          Your 2-minute first-step routine{s.answers.wake != null ? `, around ${clockLabel(s.answers.wake)}` : ', before your first step'}.
        </p>
      </div>

      <section className="card stack" aria-label="What to expect">
        <h3>What to expect, honestly</h3>
        <p className="small">In your first sessions you’ll feel your feet working. That’s normal.</p>
        <p className="small">Your plan starts gentle. It changes every week, based on how your sessions feel.</p>
        {a.focus === 'heel' ? (
          <p className="small">
            Be patient with it. A best-practice guide for heel pain says to expect several weeks or months, and that the outlook is good.
            That’s why sessions are short enough to do daily.{' '}
            <a href={OUTLOOK_SOURCE.url} target="_blank" rel="noopener noreferrer">
              {OUTLOOK_SOURCE.label}
            </a>
          </p>
        ) : (
          <p className="small">Be patient with it. This is slow, steady work, which is why sessions are short enough to do daily.</p>
        )}
        <p className="small">Missing a day is fine. You pick it up the next day.</p>
      </section>

      {goals.length > 0 && (
        <section className="stack" aria-label="Your goals">
          <h3>You’re doing this for</h3>
          <div className="goal-chips">
            {goals.map((g) => (
              <span key={g}>{g}</span>
            ))}
          </div>
        </section>
      )}

      <ReviewCards count={1} />
      <TrustLines />

      <Cta>
        <button className="btn" type="button" onClick={() => (track('step_completed', { step: STEP.plan }), go(STEP.email))}>
          Send me my plan
        </button>
      </Cta>
    </Page>
  );
}
