import { useState } from 'react';

import bedMorning from '../assets/photos/bed-morning.jpg';
import chairWindow from '../assets/photos/chair-window.jpg';
import cozyEvening from '../assets/photos/cozy-evening.jpg';
import socksRug from '../assets/photos/socks-rug.jpg';
import { SOURCES_URL } from '../config';
import { FIRST_STEP_SOURCE, goalsFor, lifeFor, PROGRESS, sceneOf, STEP } from '../flow';
import { track } from '../lib/analytics';
import { back, go } from '../router';
import { answer, update, useFunnel } from '../state';
import { ADVANCE_MS, Choice, Cta, MultiChoice, Page, Reaction } from '../ui';
import { guessOf, NOT_QUITE, patternOf, planSentence, releaseOf, summaryOf } from '../words';

/**
 * Her first name, asked once the plan exists, for the plan's own headline.
 * She can skip it. Kept in this browser only.
 */
export function Name() {
  const s = useFunnel();
  const [name, setName] = useState(s.name ?? '');
  const next = () => {
    update({ name: name.trim().slice(0, 30) });
    track('step_completed', { step: STEP.name });
    go(STEP.plan);
  };
  return (
    <Page progress={PROGRESS[STEP.name]}>
      <h2>Your plan is ready. Who is it for?</h2>
      <input
        className="field"
        type="text"
        autoComplete="given-name"
        aria-label="First name"
        maxLength={30}
        placeholder="First name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && next()}
      />
      <Cta>
        <button className="btn" type="button" onClick={next}>
          See my plan
        </button>
        <button className="btn quiet" type="button" onClick={() => go(STEP.plan)}>
          Skip
        </button>
      </Cta>
    </Page>
  );
}

/**
 * The private details: things she does because of her feet and has told
 * nobody, for her to tick. Her scene's five lines, two more for someone who
 * has tried everything. She confirms them; nothing here tells her what she has.
 */
export function Life() {
  const s = useFunnel();
  const options = lifeFor(s.answers);
  // A tick stored for a line she is no longer shown (an earlier build, or she went back and changed an answer) is let go.
  const [picked, setPicked] = useState<string[]>(() => (s.answers.life ?? []).filter((v) => v === 'none' || options.some((o) => o.value === v)));
  const toggle = (value: string) =>
    setPicked((now) => {
      if (value === 'none') return now.includes('none') ? [] : ['none'];
      const rest = now.filter((v) => v !== 'none');
      return rest.includes(value) ? rest.filter((v) => v !== value) : [...rest, value];
    });
  return (
    <Page progress={PROGRESS[STEP.life]}>
      <div className="stack gap-s">
        <h2>Tick what’s true for you.</h2>
        <p className="small">Choose all that apply.</p>
      </div>
      <div className="stack">
        {options.map((o) => (
          <MultiChoice key={o.value} checked={picked.includes(o.value)} onToggle={() => toggle(o.value)}>
            {o.label}
          </MultiChoice>
        ))}
        <MultiChoice checked={picked.includes('none')} onToggle={() => toggle('none')}>
          None of these
        </MultiChoice>
      </div>
      <Cta>
        <button
          className="btn"
          type="button"
          disabled={picked.length === 0}
          onClick={() => {
            answer({ life: picked });
            track('step_completed', { step: STEP.life });
            go(STEP.proof);
          }}
        >
          Continue
        </button>
      </Cta>
    </Page>
  );
}

/** The four photographs (assets/photos/SOURCES.md), each with the part that stays in a 16:10 frame: her feet. */
const PHOTO = {
  bed: { src: bedMorning, at: '50% 92%' },
  chair: { src: chairWindow, at: '50% 78%' },
  rug: { src: socksRug, at: '50% 68%' },
  evening: { src: cozyEvening, at: '50% 62%' },
} as const;

/**
 * After "When do you notice it most?": we guess the rest of her day before she
 * describes it, and she says whether we got it. Either answer goes on; "Not
 * quite" gets no second guess, only what her plan has. Whether the guess hit
 * is kept nowhere but in a count (`guess_answered`).
 */
export function HeardWhen() {
  const a = useFunnel().answers;
  const said = guessOf(a);
  const [hit, setHit] = useState<boolean | null>(null);
  const photo = a.when === 'morning' ? PHOTO.bed : a.when === 'sitting' ? PHOTO.chair : a.when === 'evening' ? PHOTO.evening : PHOTO.rug;
  const reply = (value: boolean) => {
    setHit(value);
    track('guess_answered', { hit: value });
  };
  return (
    <Page progress={PROGRESS[STEP.heardWhen]}>
      <div className="panel stack">
        <img className="still" src={photo.src} alt="" style={{ objectPosition: photo.at }} />
        <div className="stack fade" key={String(hit)} aria-live="polite">
          {hit == null ? (
            <>
              <h2>Let us guess.</h2>
              <p>{said.guess}</p>
            </>
          ) : hit ? (
            <>
              <h2>{said.heard}</h2>
              {said.more != null && <p>{said.more}</p>}
              <p>{said.plan}</p>
            </>
          ) : (
            <>
              <h2>{NOT_QUITE}</h2>
              <p>{said.plan}</p>
            </>
          )}
        </div>
      </div>
      <Cta>
        {hit == null ? (
          <>
            <button className="btn" type="button" onClick={() => reply(true)}>
              Yes, that’s it
            </button>
            <button className="btn secondary" type="button" onClick={() => reply(false)}>
              Not quite
            </button>
          </>
        ) : (
          <button className="btn" type="button" onClick={() => (track('step_completed', { step: STEP.heardWhen }), go(STEP.since))}>
            Continue
          </button>
        )}
      </Cta>
    </Page>
  );
}

/**
 * After "What have you already tried?": none of it was her doing wrong, said
 * with her own list (words.ts). No photograph: the words are the card, and
 * all of them have to be in view over the button.
 */
export function HeardTried() {
  const a = useFunnel().answers;
  const said = releaseOf(a);
  return (
    <Reaction step={STEP.heardTried} title={said.title} next={STEP.day} cta={said.cta}>
      {said.lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </Reaction>
  );
}

/** Half-way: what she told us, as one paragraph in her own words, to confirm or change. No score, nothing we concluded. */
export function Summary() {
  const a = useFunnel().answers;
  return (
    <Page progress={PROGRESS[STEP.summary]}>
      <h2>Here’s what we heard</h2>
      <p className="card">{summaryOf(a).join(' ')}</p>
      <Cta>
        <button className="btn" type="button" onClick={() => (track('step_completed', { step: STEP.summary }), go(STEP.life))}>
          That’s right
        </button>
        <button className="btn quiet" type="button" onClick={() => back(STEP.minutes)}>
          Change an answer
        </button>
      </Cta>
    </Page>
  );
}

/**
 * What her ticks add up to: her pattern, named the way a neighbor would, with
 * a cause she did not bring on and can change, and what her plan does about
 * it (words.ts). The source is a tap away. It describes her answers and says
 * so: it is not a diagnosis, and Walkito itself has not been tested in a trial.
 */
export function Pattern() {
  const a = useFunnel().answers;
  const said = patternOf(a);
  // The morning card names a trial, so that is what its link opens.
  const trial = sceneOf(a) === 'morning';
  return (
    <Reaction step={STEP.proof} title={said.title} next={STEP.goals} cta="That makes sense">
      {said.lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
      <p>
        <a href={trial ? FIRST_STEP_SOURCE.url : SOURCES_URL} target="_blank" rel="noopener noreferrer">
          {trial ? 'See the trial' : 'See the sources'}
        </a>
      </p>
      <p className="caption">This is a description of what you told us, not a diagnosis.</p>
    </Reaction>
  );
}

/**
 * Her goals, as pictures of a day. None is ticked for her: the ones that
 * mirror what she ticked come first, and say so. They are kept in the order
 * she taps them, so the first is the one that matters most.
 */
export function Goals() {
  const s = useFunnel();
  const options = goalsFor(s.answers);
  const [picked, setPicked] = useState<string[]>(() => (s.answers.goals ?? []).filter((g) => options.some((o) => o.value === g)));
  const toggle = (goal: string) => setPicked((now) => (now.includes(goal) ? now.filter((g) => g !== goal) : [...now, goal]));
  return (
    <Page progress={PROGRESS[STEP.goals]}>
      <div className="stack gap-s">
        <h2>What would you like to get back to?</h2>
        <p className="small">Tap the one that matters most first.</p>
      </div>
      <div className="stack">
        {options.map((o) => (
          <MultiChoice key={o.value} checked={picked.includes(o.value)} onToggle={() => toggle(o.value)}>
            {o.label}
            {o.mentioned && <span className="hint">You mentioned this</span>}
          </MultiChoice>
        ))}
      </div>
      <Cta>
        <button
          className="btn"
          type="button"
          disabled={picked.length === 0}
          onClick={() => {
            answer({ goals: picked });
            track('step_completed', { step: STEP.goals });
            go(STEP.move);
          }}
        >
          Continue
        </button>
      </Cta>
    </Page>
  );
}

/**
 * Her plan in one sentence of her own: her minutes, after something she
 * already does, for her to read and agree to. Nothing is kept. It never says
 * we will remind her then: the reminder does not read this answer yet.
 * Without that moment (a visitor from before v7) it is the question it was.
 */
export function Commit() {
  const s = useFunnel();
  const sentence = planSentence(s.answers);
  const [picked, setPicked] = useState<string | null>(null);
  const pick = (value: string) => {
    setPicked(value);
    track('step_completed', { step: STEP.commit });
    setTimeout(() => go(STEP.building), ADVANCE_MS);
  };
  if (sentence != null)
    return (
      <Page progress={PROGRESS[STEP.commit]}>
        <h2>Your plan, in one sentence</h2>
        <blockquote className="card pledge">“{sentence} Starting today.”</blockquote>
        <p className="caption">Missing a day is fine. It happens to everyone. You pick it up the next day.</p>
        <Cta>
          <button className="btn" type="button" onClick={() => (track('step_completed', { step: STEP.commit }), go(STEP.building))}>
            That’s my plan
          </button>
          <button className="btn quiet" type="button" onClick={() => back(STEP.anchor)}>
            Change it
          </button>
        </Cta>
      </Page>
    );
  return (
    <Page progress={PROGRESS[STEP.commit]}>
      <h2>Can you give your feet {s.answers.minutes ?? 5} minutes a day?</h2>
      <div className="stack">
        <Choice selected={picked === 'yes'} onClick={() => pick('yes')}>
          Yes, I can
        </Choice>
        <Choice selected={picked === 'best'} onClick={() => pick('best')}>
          I’ll do my best
        </Choice>
      </div>
    </Page>
  );
}
