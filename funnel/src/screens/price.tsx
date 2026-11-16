import { useEffect, useMemo, useRef, useState } from 'react';

import {
  COMPANY_LINE,
  DEFAULT_VARIANT,
  DESCRIPTOR,
  GUARANTEE_DAYS,
  money,
  PRICE_VARIANTS,
  REMINDER_DAYS_BEFORE,
  SITE,
  SUPPORT_EMAIL,
  url,
} from '../config';
import { addDays, PROGRAM, shortDate, STEP } from '../flow';
import { currentUser, logConsent, saveLead } from '../lib/account';
import { meta, track } from '../lib/analytics';
import { billingReady, buy, loadPackages, type Packages } from '../lib/billing';
import { go } from '../router';
import { update, useFunnel } from '../state';
import { AppButton, Check, Choice, Page } from '../ui';

type PlanId = 'monthly' | 'quarter' | 'yearly';

/** "Nov 16, 2027": a date a year away needs its year. */
function yearDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

const HELD_BACK = [
  { value: 'price', label: 'The price' },
  { value: 'unsure', label: 'Not sure it is for me' },
  { value: 'think', label: 'I want to think about it' },
  { value: 'other', label: 'Something else' },
] as const;

export function Price() {
  const s = useFunnel();
  const variant = PRICE_VARIANTS[s.variant] ?? PRICE_VARIANTS[DEFAULT_VARIANT]!;
  const [picked, setPlan] = useState<PlanId>(s.plan ?? 'monthly');
  const [agreed, setAgreed] = useState(false);
  const packages = useRef<Promise<Packages | null> | null>(null);
  const [phase, setPhase] = useState<'idle' | 'opening' | 'open' | 'held-back'>('idle');
  const [heldBack, setHeldBack] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nudge, setNudge] = useState(false);
  /** The yearly row shows once RevenueCat has the product, so it never opens a checkout that is not there. */
  const [yearly, setYearly] = useState<boolean | null>(null);
  const consentBox = useRef<HTMLDivElement>(null);
  /** A link's `?plan=yearly` falls back to the first plan when RevenueCat has no yearly product. */
  const plan: PlanId = picked === 'yearly' && yearly === false ? 'monthly' : picked;

  const today = useMemo(() => new Date(), []);
  const m = variant.monthly;
  const q = variant.quarter;
  const y = variant.yearly;
  const charge = addDays(today, m.introDays);
  const renew = addMonths(today, q.months);
  const renewYear = addMonths(today, y.months);
  const consent =
    plan === 'monthly'
      ? `I understand: ${money(m.intro)} today, then ${money(m.price)} a month from ${shortDate(charge)} until I cancel.`
      : plan === 'quarter'
        ? `I understand: ${money(q.price)} today, then ${money(q.price)} every 3 months from ${shortDate(renew)} until I cancel.`
        : `I understand: ${money(y.price)} today, then ${money(y.price)} every year from ${yearDate(renewYear)} until I cancel.`;

  useEffect(() => {
    track('price_viewed');
    if (!billingReady()) return setYearly(false);
    packages.current = currentUser().then(async (user) => {
      if (user == null) return (setYearly(false), null);
      try {
        const loaded = await loadPackages(user.id, variant);
        setYearly(loaded.yearly != null);
        return loaded;
      } catch {
        setYearly(false);
        setError('We could not load checkout. Please check your connection and reload the page.');
        return null;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = (id: PlanId) => {
    setPlan(id);
    setAgreed(false);
    update({ plan: id });
    track('plan_selected', { plan: id });
  };

  const checkout = async () => {
    setError(null);
    if (!agreed) {
      setNudge(true);
      consentBox.current?.scrollIntoView({
        block: 'center',
        behavior: 'smooth',
      });
      setTimeout(() => setNudge(false), 1600);
      return;
    }
    const user = await currentUser();
    if (user == null || s.email == null) return go(STEP.email);
    setPhase('opening');
    const loaded = await packages.current;
    const pkg = loaded?.[plan];
    if (!billingReady() || pkg == null) {
      setError('Checkout is not open yet. Please try again in a few minutes.');
      setPhase('idle');
      return;
    }
    void logConsent('auto_renew', consent, true);
    track('consent_given', { kind: 'auto_renew' });
    void saveLead({ checkout_opened_at: new Date().toISOString() });
    track('checkout_opened', { plan });
    meta('InitiateCheckout', `checkout-${user.id}-${Date.now()}`);
    setPhase('open');
    const result = await buy(user.id, pkg, s.email);
    if (result.status === 'bought') {
      const value = plan === 'monthly' ? m.intro : plan === 'quarter' ? q.price : y.price;
      update({ purchased: true, plan });
      track('purchase_completed', { plan });
      meta('Purchase', `purchase-${user.id}`, { value, currency: 'USD' });
      go(STEP.start1, { replace: true });
      return;
    }
    if (result.status === 'cancelled') {
      track('checkout_closed', { plan });
      setPhase('held-back');
      return;
    }
    track('checkout_failed', { plan, code: result.code });
    setError(result.message);
    setPhase('idle');
  };

  const focus = s.answers.focus ?? 'heel';
  const perDay = (total: number, days: number) => money(Math.round((total / days) * 100) / 100);
  const quarterDays = Math.round((renew.getTime() - today.getTime()) / 86_400_000);
  const yearDays = Math.round((renewYear.getTime() - today.getTime()) / 86_400_000);
  return (
    <Page backTo={STEP.plan} footer>
      <div className="stack center">
        <span className="chip" style={{ alignSelf: 'center' }}>
          {PROGRAM[focus]}
        </span>
        <h1>Start your plan</h1>
        <div className="chips" style={{ justifyContent: 'center' }}>
          <span className="chip">{s.answers.start === 'standing' ? 'Standing' : 'Seated'}</span>
          <span className="chip">{s.answers.minutes ?? 5} min a day</span>
          <span className="chip">New every week</span>
        </div>
      </div>

      {phase === 'held-back' ? (
        <HeldBack
          picked={heldBack}
          onPick={(reason) => {
            setHeldBack(reason);
            track('held_back', { reason });
          }}
          onBack={() => setPhase('idle')}
        />
      ) : (
        <>
          <div className="plans" role="radiogroup" aria-label="Choose a plan">
            <button
              className="choice plan"
              type="button"
              role="radio"
              aria-checked={plan === 'monthly'}
              aria-pressed={plan === 'monthly'}
              onClick={() => choose('monthly')}
            >
              <span className="tag flag">Best to start</span>
              <span className="radio" />
              <span className="grow">
                <span className="name">{m.introDays}-day start</span>
                <span className="hint">
                  {money(m.intro)} today, then {money(m.price)} a month
                </span>
              </span>
              <span className="perday">
                <b>{perDay(m.intro, m.introDays)}</b>
                <span>per day</span>
              </span>
            </button>
            <button
              className="choice plan"
              type="button"
              role="radio"
              aria-checked={plan === 'quarter'}
              aria-pressed={plan === 'quarter'}
              onClick={() => choose('quarter')}
            >
              <span className="radio" />
              <span className="grow">
                <span className="name">3 months</span>
                <span className="hint">{money(q.price)} every 3 months</span>
              </span>
              <span className="perday">
                <b>{perDay(q.price, quarterDays)}</b>
                <span>per day</span>
              </span>
            </button>
            {(yearly === true || (yearly === null && plan === 'yearly')) && (
              <button
                className="choice plan"
                type="button"
                role="radio"
                aria-checked={plan === 'yearly'}
                aria-pressed={plan === 'yearly'}
                onClick={() => choose('yearly')}
              >
                <span className="radio" />
                <span className="grow">
                  <span className="name">1 year</span>
                  <span className="hint">{money(y.price)} a year</span>
                </span>
                <span className="perday">
                  <b>{perDay(y.price, yearDays)}</b>
                  <span>per day</span>
                </span>
              </button>
            )}
          </div>

          <div className="note ok" style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
            <img src={url('/img/art-shield.webp')} alt="" width={44} height={44} style={{ objectFit: 'contain', flex: 'none' }} />
            <div>
              <b>{GUARANTEE_DAYS}-day money-back guarantee</b>
              <div className="small">Not for you? Reply to any email and we refund it.</div>
            </div>
          </div>

          <section className="card stack" aria-label="What happens and when">
            <h3>How it works</h3>
            <div className="timeline">
              {plan === 'monthly' ? (
                <>
                  <TimelineRow now title="Today" text={`${money(m.intro)}. Your plan starts now.`} />
                  <TimelineRow title={shortDate(addDays(today, m.introDays - REMINDER_DAYS_BEFORE))} text="We email you a reminder." />
                  <TimelineRow title={shortDate(charge)} text={`${money(m.price)} a month. Cancel any time.`} />
                </>
              ) : plan === 'quarter' ? (
                <>
                  <TimelineRow now title="Today" text={`${money(q.price)} for 3 months.`} />
                  <TimelineRow title={shortDate(addDays(renew, -REMINDER_DAYS_BEFORE))} text="We email you a reminder." />
                  <TimelineRow title={shortDate(renew)} text={`${money(q.price)} for the next 3 months. Cancel any time.`} />
                </>
              ) : (
                <>
                  <TimelineRow now title="Today" text={`${money(y.price)} for a year.`} />
                  <TimelineRow title={yearDate(addDays(renewYear, -REMINDER_DAYS_BEFORE))} text="We email you a reminder." />
                  <TimelineRow title={yearDate(renewYear)} text={`${money(y.price)} for the next year. Cancel any time.`} />
                </>
              )}
            </div>
          </section>

          <section className="card stack">
            <h3>What you get</h3>
            <ul className="ticks">
              <li>Your plan, new every week</li>
              <li>A video for every move</li>
              <li>Exercises built on physical therapy guidelines</li>
              <li>The Walkito app for iPhone and Android</li>
            </ul>
          </section>

          <div ref={consentBox}>
            <Check
              className={nudge ? 'nudge' : undefined}
              checked={agreed}
              onChange={(v) => {
                setAgreed(v);
                if (v) track('consent_given', { kind: 'auto_renew_box' });
              }}
            >
              {consent}
            </Check>
          </div>
          {nudge && <p className="small center">Tick the box above to continue.</p>}

          {error != null && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          <button className="btn" type="button" disabled={phase !== 'idle'} onClick={() => void checkout()}>
            {phase === 'opening' ? 'Opening checkout…' : 'Get my plan'}
          </button>
          <div className="pay">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="currentColor" />
              <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" stroke="currentColor" strokeWidth="2.2" />
            </svg>
            Secure checkout · Cancel any time
          </div>
          <p className="caption center">
            By paying you agree to the <a href={url('/terms')}>Terms</a>. Charges appear as {DESCRIPTOR}.
          </p>
        </>
      )}

      <section className="stack" aria-label="Questions">
        <details>
          <summary>What do I get?</summary>
          <p className="small">
            Short daily foot exercises, {s.answers.minutes ?? 5} minutes a day, with a video for every move. The plan changes each week. It
            works in your browser and in the Walkito app, with the same email.
          </p>
        </details>
        <details>
          <summary>How do I cancel?</summary>
          <p className="small">
            Go to {SITE}/s/cancel and tap Cancel, or reply to any email from us. You keep access until the end of the time you paid for.
          </p>
        </details>
        <details>
          <summary>Is this medical care?</summary>
          <p className="small">
            No. Walkito is an exercise program, not a diagnosis or treatment. If something hurts or feels worse, ask your doctor or physical
            therapist.
          </p>
        </details>
      </section>

      <p className="caption center">
        Questions: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        <br />
        {COMPANY_LINE}
      </p>
      <AppButton from="price" quiet label="Prefer the App Store? Get the app" />
    </Page>
  );
}

function TimelineRow({ title, text, now }: { title: string; text: string; now?: boolean }) {
  return (
    <div className={now === true ? 't now' : 't'}>
      <span className="dot" />
      <div>
        <div style={{ fontWeight: 800 }}>{title}</div>
        <div className="small">{text}</div>
      </div>
    </div>
  );
}

const ANSWER: Readonly<Record<string, string>> = {
  price: `If you cancel before your first full charge, the first week is all you pay. And if a charge was not worth it, reply to any email within ${GUARANTEE_DAYS} days and we refund it.`,
  unsure: `Try a week and see. If it is not for you, cancel in one step, or reply to any email within ${GUARANTEE_DAYS} days of a charge and we refund it.`,
  think: 'Of course. Your plan is saved to your email. Come back to this page any time.',
  other: `Tell us at ${SUPPORT_EMAIL}. A person reads every email.`,
};

function HeldBack({ picked, onPick, onBack }: { picked: string | null; onPick: (reason: string) => void; onBack: () => void }) {
  return (
    <section className="stack">
      <h2>What held you back?</h2>
      {picked == null ? (
        HELD_BACK.map((o) => (
          <Choice key={o.value} onClick={() => onPick(o.value)}>
            {o.label}
          </Choice>
        ))
      ) : (
        <p className="card">{ANSWER[picked]}</p>
      )}
      <button className="btn secondary" type="button" onClick={onBack}>
        Back to my plan
      </button>
    </section>
  );
}
