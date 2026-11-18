import { useEffect, useMemo } from 'react';

import { firstName, goalLabels, kindOf, PLAN_NAME, planLine, planView, PROGRESS, STEP } from '../flow';
import { track } from '../lib/analytics';
import { go } from '../router';
import { useFunnel } from '../state';
import { Cta, Page } from '../ui';

/** "Desk Feet Reset" -> "DFR", for the badge. */
function initials(name: string): string {
  return name
    .split(/[\s-]+/)
    .filter((w) => /^[A-Z]/.test(w))
    .map((w) => w[0])
    .join('')
    .slice(0, 3);
}

/** Her plan, by name: what it is, the goals it is for, and its first week. No date for an outcome. */
export function Plan() {
  const s = useFunnel();
  const view = useMemo(() => planView(s), [s.answers, s.tryIt]);
  const name = firstName(s);
  const title = PLAN_NAME[kindOf(s.answers)];
  const goals = goalLabels(s.answers).slice(0, 3);
  useEffect(() => {
    track('plan_viewed');
    // Meta View content fires on the price page (she saw the price), not here.
  }, []);
  const active = view.days.filter((d) => !d.rest).length;
  return (
    <Page progress={PROGRESS[STEP.plan]} backTo={STEP.goals}>
      <h2 className="center">{name != null ? `${name}, your plan` : 'Your plan'}</h2>

      <section className="named pop" aria-label="Your plan">
        <div className="badge">{initials(title)}</div>
        <h1>{title}</h1>
        <p>{planLine(s.answers)}</p>
      </section>

      {goals.length > 0 && (
        <section className="card stack gap-s">
          <span className="eyebrow">Built for your goals</span>
          <ul className="ticks">
            {goals.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="card stack">
        <div className="day-head">
          <h3>Week 1</h3>
          <span className="caption">
            {active} days · {view.days.length - active} rest
          </span>
        </div>
        <div className="week">
          {view.days.map((day, i) => {
            const [y, m, d] = day.date.split('-').map(Number);
            return (
              <div key={day.date} className={`d${day.rest ? ' rest' : ''}${i === 0 ? ' today' : ''}`}>
                <i>{day.rest ? 'Rest' : day.minutes}</i>
                {i === 0 ? 'Today' : new Date(y!, m! - 1, d!).toLocaleDateString('en-US', { weekday: 'short' })}
              </div>
            );
          })}
        </div>
        <p className="caption">Minutes a day. Each week adapts to how the last one went.</p>
      </section>

      <Cta>
        <button className="btn" type="button" onClick={() => (track('step_completed', { step: STEP.plan }), go(STEP.summary))}>
          Continue
        </button>
      </Cta>
    </Page>
  );
}
