import { useEffect } from 'react';

import { firstName, kindOf, LIFE, PLAN_NAME, planLine, STEP } from '../flow';
import { track } from '../lib/analytics';
import { go } from '../router';
import { useFunnel } from '../state';
import { Icon, Tick } from '../ui';

/** "Desk Feet Reset" -> "DFR", for the badge. */
function initials(name: string): string {
  return name
    .split(/[\s-]+/)
    .filter((w) => /^[A-Z]/.test(w))
    .map((w) => w[0])
    .join('')
    .slice(0, 3);
}

/** "Anna, we've made you a plan." Her plan by name and her goals as chips (QUITTR). No date for a result. */
export function Plan() {
  const s = useFunnel();
  const name = firstName(s);
  const title = PLAN_NAME[kindOf(s.answers)];
  const goals = LIFE.filter((o) => s.answers.goals?.includes(o.goal));
  useEffect(() => {
    track('plan_viewed');
  }, []);
  return (
    <main className="slide plan-done">
      <div className="slide-body">
        <div className="done-mark small pop" aria-hidden="true">
          <Tick />
        </div>
        <h1>{name != null ? `${name}, we’ve made you a plan.` : 'We’ve made you a plan.'}</h1>
        <section className="named" aria-label="Your plan">
          <div className="badge">{initials(title)}</div>
          <h2>{title}</h2>
          <p>{planLine(s.answers)}</p>
        </section>
        <div className="goal-chips">
          {goals.map((g) => (
            <span key={g.goal} style={{ borderColor: g.color }}>
              <Icon name={g.icon} size={18} />
              {g.goalLabel}
            </span>
          ))}
        </div>
      </div>
      <button className="pill wide" type="button" onClick={() => (track('step_completed', { step: STEP.plan }), go(STEP.email))}>
        Get my plan
      </button>
    </main>
  );
}
