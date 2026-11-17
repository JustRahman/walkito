import { useEffect, useMemo } from 'react';

import { url } from '../config';
import type { Focus } from '../engine/plan';
import { PROGRAM, PROGRESS, planView, STEP } from '../flow';
import { track } from '../lib/analytics';
import { go } from '../router';
import { useFunnel } from '../state';
import { Cta, Icon, Page, type IconName } from '../ui';
import { TrustLines } from './trust';

export const FOCUS_ICON: Readonly<Record<Focus, IconName>> = {
  heel: 'foot',
  steady: 'balance',
  flat: 'sandal',
  allday: 'briefcase',
  moving: 'runningShoe',
};

const FOCUS_SHORT: Readonly<Record<Focus, string>> = {
  heel: 'Heel & arch',
  steady: 'Balance',
  flat: 'Flat feet',
  allday: 'All-day feet',
  moving: 'Mobility',
};

export function Plan() {
  const s = useFunnel();
  const view = useMemo(() => planView(s), [s.answers, s.tryIt]);
  useEffect(() => {
    track('plan_viewed');
    // Meta View content fires on the price page (she saw the price), not here.
  }, []);
  const today = view.days[0];
  const active = view.days.filter((d) => !d.rest).length;
  return (
    <Page progress={PROGRESS[STEP.plan]} backTo={STEP.minutes} footer>
      <div className="stack center">
        <span className="chip" style={{ alignSelf: 'center' }}>
          {PROGRAM[view.facts.focus]}
        </span>
        <h1>Your plan is ready</h1>
      </div>

      <div className="facts">
        <div className="f">
          <Icon name={FOCUS_ICON[view.facts.focus]} />
          <span className="k">Focus</span>
          <span className="v">{FOCUS_SHORT[view.facts.focus]}</span>
        </div>
        <div className="f">
          <Icon name={view.facts.seated ? 'couch' : 'balance'} />
          <span className="k">Position</span>
          <span className="v">{view.facts.seated ? 'Seated' : 'Standing'}</span>
        </div>
        <div className="f">
          <Icon name="stopwatch" />
          <span className="k">Each day</span>
          <span className="v">{view.facts.minutes} min</span>
        </div>
      </div>

      <section className="card stack">
        <div className="day-head">
          <h3>Your first week</h3>
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
        <p className="caption">Minutes a day. Next week adapts to how this one goes.</p>
      </section>

      {today != null && !today.rest && (
        <section className="card day">
          <div className="day-head">
            <h3>Today</h3>
            <span className="caption">{today.minutes} min</span>
          </div>
          {today.moves.map((m) => (
            <div className="move" key={m.id}>
              <img src={m.poster} alt="" loading="lazy" />
              <div>
                <div style={{ fontWeight: 800 }}>{m.title}</div>
                <div className="caption">{m.dose}</div>
              </div>
              {m.doneToday && <span className="done">Done</span>}
            </div>
          ))}
        </section>
      )}

      <section className="card rows">
        <div className="r">
          <img src={url('/img/art-foot.webp')} alt="" />
          <div>
            <div className="t">A video for every move</div>
            <div className="d">Real feet, one clear cue.</div>
          </div>
        </div>
        <div className="r">
          <img src={url('/img/art-shield.webp')} alt="" />
          <div>
            <div className="t">Built on physical therapy guidelines</div>
            <div className="d">Gentle, and step by step.</div>
          </div>
        </div>
        <div className="r">
          <img src={url('/img/art-calendar.webp')} alt="" />
          <div>
            <div className="t">A new week, every week</div>
            <div className="d">Easier, the same, or a step up.</div>
          </div>
        </div>
      </section>

      <TrustLines />

      <Cta>
        <button className="btn" type="button" onClick={() => (track('step_completed', { step: STEP.plan }), go(STEP.email))}>
          Get my plan
        </button>
      </Cta>
    </Page>
  );
}
