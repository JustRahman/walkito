import { useState } from 'react';

import bedMorning from '../assets/photos/bed-morning.jpg';
import chairWindow from '../assets/photos/chair-window.jpg';
import cozyEvening from '../assets/photos/cozy-evening.jpg';
import socksRug from '../assets/photos/socks-rug.jpg';
import { SOURCES_URL, url } from '../config';
import { lifeFor, mentionedGoals, PROGRESS, STEP } from '../flow';
import { track } from '../lib/analytics';
import { back, go } from '../router';
import { answer, update, useFunnel } from '../state';
import { ADVANCE_MS, Choice, Cta, MultiChoice, Page, Reaction } from '../ui';
import { guessOf, NOT_QUITE, releaseOf, summaryOf } from '../words';

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

/** How her feet get in the way, as a question she answers: nothing here tells her what she has. */
export function Life() {
  const s = useFunnel();
  const [picked, setPicked] = useState<string[]>(s.answers.life ?? []);
  const toggle = (value: string) =>
    setPicked((now) => {
      if (value === 'none') return now.includes('none') ? [] : ['none'];
      const rest = now.filter((v) => v !== 'none');
      return rest.includes(value) ? rest.filter((v) => v !== value) : [...rest, value];
    });
  return (
    <Page progress={PROGRESS[STEP.life]}>
      <div className="stack gap-s">
        <h2>Does any of this sound familiar?</h2>
        <p className="small">Choose all that apply.</p>
      </div>
      <div className="stack">
        {lifeFor(s.answers).map((o) => (
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

/** After "What have you already tried?": none of it was her doing wrong, said with her own list (words.ts). */
export function HeardTried() {
  const a = useFunnel().answers;
  const said = releaseOf(a);
  // Never the photograph she saw two screens ago.
  return (
    <Reaction step={STEP.heardTried} photo={a.when === 'evening' ? PHOTO.rug : PHOTO.evening} title={said.title} next={STEP.day} cta={said.cta}>
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
 * The one proof card: where the exercises come from, with the sources a tap
 * away. It says what the physical therapists' heel pain guideline includes
 * (Koc et al., JOSPT 2023, in the site's citations), never what Walkito does
 * for anyone: Walkito itself has not been tested in a trial.
 */
export function Proof() {
  return (
    <Reaction step={STEP.proof} photo={{ src: url('/posters/heel_raise_double.webp') }} title="Built on published research" next={STEP.goals}>
      <p>Walkito’s exercises are chosen from published physical therapy research.</p>
      <p>For heel pain, for example, the physical therapists’ guideline includes stretching and foot-strengthening exercises.</p>
      <p>
        <a href={SOURCES_URL} target="_blank" rel="noopener noreferrer">
          See the sources
        </a>
      </p>
    </Reaction>
  );
}

/** Her goals. None is ticked for her: the mirror of what she told us comes first, and says so. */
export function Goals() {
  const s = useFunnel();
  const [picked, setPicked] = useState<string[]>(s.answers.goals ?? []);
  const toggle = (goal: string) => setPicked((now) => (now.includes(goal) ? now.filter((g) => g !== goal) : [...now, goal]));
  const mentioned = mentionedGoals(s.answers);
  const options = lifeFor(s.answers);
  const hersFirst = [...options.filter((o) => mentioned.includes(o.goal)), ...options.filter((o) => !mentioned.includes(o.goal))];
  return (
    <Page progress={PROGRESS[STEP.goals]}>
      <h2>What would you like to get back to?</h2>
      <div className="stack">
        {hersFirst.map((o) => (
          <MultiChoice key={o.goal} checked={picked.includes(o.goal)} onToggle={() => toggle(o.goal)}>
            {o.goalLabel}
            {mentioned.includes(o.goal) && <span className="hint">You mentioned this</span>}
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

/** A small yes before the plan: one tap, and either answer goes on. Nothing is kept. */
export function Commit() {
  const s = useFunnel();
  const [picked, setPicked] = useState<string | null>(null);
  const pick = (value: string) => {
    setPicked(value);
    track('step_completed', { step: STEP.commit });
    setTimeout(() => go(STEP.building), ADVANCE_MS);
  };
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
