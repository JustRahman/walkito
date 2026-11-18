import { useEffect, useMemo } from 'react';

import { firstName, kindOf, LIFE, PLAN_NAME, planLine, planView, STEP } from '../flow';
import { track } from '../lib/analytics';
import { go } from '../router';
import { useFunnel } from '../state';
import { Cta, Icon, Page } from '../ui';

function Lock() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="currentColor" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" stroke="currentColor" strokeWidth="2.2" />
    </svg>
  );
}

/**
 * Centr's "here's a peek at your plan": week 1 as a photo tile from her own
 * first-week moves, the later weeks locked beside it, and her goals as chips.
 * No date for a result.
 */
export function Plan() {
  const s = useFunnel();
  const name = firstName(s);
  const view = useMemo(() => planView(s), [s.answers, s.tryIt]);
  const title = PLAN_NAME[kindOf(s.answers)];
  const goals = LIFE.filter((o) => s.answers.goals?.includes(o.goal));
  const moves = view.days.flatMap((d) => d.moves).filter((m, i, all) => all.findIndex((x) => x.id === m.id) === i);
  const [first, second, third] = [moves[0], moves[1] ?? moves[0], moves[2] ?? moves[1] ?? moves[0]];
  useEffect(() => {
    track('plan_viewed');
  }, []);
  return (
    <Page backTo={STEP.goals}>
      <h1 className="peek-title">{name != null ? `${name}, here’s a peek at your plan:` : 'Here’s a peek at your plan:'}</h1>
      <p className="peek-line">
        <b>{title}:</b> {planLine(s.answers)}
      </p>
      {goals.length > 0 && (
        <div className="goal-chips light">
          {goals.map((g) => (
            <span key={g.goal} style={{ borderColor: g.color }}>
              <Icon name={g.icon} size={18} />
              {g.goalLabel}
            </span>
          ))}
        </div>
      )}
      {first != null && (
        <div className="tile big" style={{ backgroundImage: `url(${first.poster})` }}>
          <span className="tile-tag">Week 1 · today</span>
          <div className="tile-foot">
            <b>{first.title}</b>
            <span className="tile-chips">
              <i>{view.days[0]?.minutes ?? s.answers.minutes ?? 5} min</i>
              <i>{moves.length} moves this week</i>
            </span>
          </div>
        </div>
      )}
      <div className="tiles">
        {[
          { m: second, label: 'Week 2' },
          { m: third, label: 'Weeks 3–12' },
        ].map(({ m, label }) =>
          m == null ? null : (
            <div key={label} className="tile locked" style={{ backgroundImage: `url(${m.poster})` }}>
              <span className="tile-lock">
                <Lock />
              </span>
              <b>{label}</b>
            </div>
          ),
        )}
      </div>
      <Cta>
        <button className="btn dark" type="button" onClick={() => (track('step_completed', { step: STEP.plan }), go(STEP.email))}>
          Get my plan
        </button>
      </Cta>
    </Page>
  );
}
