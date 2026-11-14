import { useEffect, useMemo } from 'react';

import { PROGRAM, PROGRESS, planView, STEP } from '../flow';
import { meta, track } from '../lib/analytics';
import { go } from '../router';
import { useFunnel } from '../state';
import { Page } from '../ui';

export function Plan() {
  const s = useFunnel();
  const view = useMemo(() => planView(s), [s.answers, s.tryIt]);
  useEffect(() => {
    track('plan_viewed');
    meta('ViewContent', `plan-${crypto.randomUUID()}`);
  }, []);
  const [today, ...rest] = view.days;
  const start = view.facts.seated ? 'Seated' : 'Standing, hand on a counter';
  return (
    <Page progress={PROGRESS[STEP.plan]} backTo={STEP.minutes}>
      <div className="stack">
        <span className="chip" style={{ alignSelf: 'flex-start' }}>
          {PROGRAM[view.facts.focus]}
        </span>
        <h1>Your first week</h1>
        <p className="lead">Built from what you told us.</p>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        <span className="chip">{start}</span>
        <span className="chip">{view.facts.minutes} minutes a day</span>
        <span className="chip">5 days a week</span>
      </div>

      {today != null && (
        <section className="card day">
          <div className="day-head">
            <h3>{today.label}</h3>
            <span className="caption">{today.rest ? 'Rest' : `${today.minutes} min`}</span>
          </div>
          {today.moves.map((m) => (
            <div className="move" key={m.id}>
              <img src={m.poster} alt="" loading="lazy" />
              <div>
                <div style={{ fontWeight: 700 }}>{m.title}</div>
                <div className="caption">{m.dose}</div>
              </div>
              {m.doneToday && <span className="done">Done today</span>}
            </div>
          ))}
          {today.rest && <p className="lead">A rest day. Your feet get a break.</p>}
        </section>
      )}

      {rest.map((day) => (
        <section className="card outline day" key={day.date}>
          <div className="day-head">
            <h3>{day.label}</h3>
            <span className="caption">{day.rest ? 'Rest' : `${day.minutes} min`}</span>
          </div>
          {day.rest ? (
            <p className="small">A rest day.</p>
          ) : (
            <p className="small">{day.moves.map((m) => m.title).join(' · ')}</p>
          )}
        </section>
      ))}

      <p className="small">Next week is built from how this one goes: easier, the same, or a step up.</p>
      <button className="btn" type="button" onClick={() => (track('step_completed', { step: STEP.plan }), go(STEP.email))}>
        Save my plan
      </button>
    </Page>
  );
}
