import { useEffect, useMemo } from 'react';

import { adOf, clockLabel, firstName, goalLabels, kindOf, PLAN_NAME, planLine, planView, STEP } from '../flow';
import { track } from '../lib/analytics';
import { go } from '../router';
import { useFunnel } from '../state';
import { Cta, Page } from '../ui';
import { ReviewCards, TrustLines } from './trust';

/** "2026-11-18" -> "Wed" and "18", in her own time zone. */
function dayOf(date: string): { weekday: string; number: number } {
  const [y, m, d] = date.split('-').map(Number);
  return { weekday: new Date(y!, m! - 1, d!).toLocaleDateString('en-US', { weekday: 'short' }), number: d! };
}

/**
 * Her plan, as the app's own engine built it from her answers: the first
 * week's days, today's moves with the one she just did marked done, tomorrow
 * morning's routine, and what happens after week one. A picture of the plan,
 * never of a result: no length, no date by which anything changes, nothing
 * locked or blurred.
 */
export function Plan() {
  const s = useFunnel();
  const name = firstName(s);
  const view = useMemo(() => planView(s), [s.answers, s.tryIt]);
  const today = view.days[0];
  const sessions = view.days.filter((d) => !d.rest).length;
  const goals = goalLabels(s.answers);
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

      <div className="card stack">
        <div>
          <b>Tomorrow morning</b>
          <p className="small">
            Your 2-minute first-step routine{s.answers.wake != null ? `, around ${clockLabel(s.answers.wake)}` : ', before your first step'}.
          </p>
        </div>
        <div>
          <b>After week one</b>
          <p className="small">Your plan changes every week, based on how your sessions feel.</p>
        </div>
      </div>

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
          Continue
        </button>
      </Cta>
    </Page>
  );
}
