import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { COMPANY_LINE, DEFAULT_VARIANT, DESCRIPTOR, GUARANTEE_DAYS, money, PRICE_VARIANTS, REMINDER_DAYS_BEFORE, SITE, SUPPORT_EMAIL, url } from '../config';
import { addDays, FOCUS_LABEL, PROGRAM, shortDate, STEP } from '../flow';
import { currentUser, logConsent, saveLead } from '../lib/account';
import { meta, track } from '../lib/analytics';
import { billingReady, buy, loadPackages, type Packages } from '../lib/billing';
import { go } from '../router';
import { update, useFunnel } from '../state';
import { AppButton, Carla, Check, Choice, Page } from '../ui';

type PlanId = 'monthly' | 'quarter';

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
  const [plan, setPlan] = useState<PlanId>(s.plan ?? 'monthly');
  const [agreed, setAgreed] = useState(false);
  const packages = useRef<Promise<Packages | null> | null>(null);
  const [phase, setPhase] = useState<'idle' | 'opening' | 'open' | 'held-back'>('idle');
  const [heldBack, setHeldBack] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const target = useRef<HTMLDivElement>(null);

  const today = useMemo(() => new Date(), []);
  const m = variant.monthly;
  const q = variant.quarter;
  const charge = addDays(today, m.introDays);
  const renew = addMonths(today, q.months);
  const consent =
    plan === 'monthly'
      ? `I understand: ${money(m.intro)} today, then ${money(m.price)} a month from ${shortDate(charge)} until I cancel.`
      : `I understand: ${money(q.price)} today, then ${money(q.price)} every 3 months from ${shortDate(renew)} until I cancel.`;

  useEffect(() => {
    track('price_viewed');
    if (!billingReady()) return;
    packages.current = currentUser().then(async (user) => {
      if (user == null) return null;
      try {
        return await loadPackages(user.id, variant);
      } catch {
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
    const user = await currentUser();
    if (user == null || s.email == null) return go(STEP.email);
    setPhase('opening');
    const loaded = await packages.current;
    const pkg = plan === 'monthly' ? loaded?.monthly : loaded?.quarter;
    if (!billingReady() || pkg == null || target.current == null) {
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
    const result = await buy(user.id, pkg, s.email, target.current);
    if (result.status === 'bought') {
      const value = plan === 'monthly' ? m.intro : q.price;
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
  return (
    <Page backTo={STEP.plan}>
      <div className="stack">
        <h1>Your first week is ready.</h1>
        <div className="card stack" style={{ gap: '0.35rem' }}>
          <div>
            <b>{PROGRAM[focus]}</b>: {FOCUS_LABEL[focus].toLowerCase()}
          </div>
          <div className="lead">{s.answers.start === 'standing' ? 'Standing, hand on a counter' : 'Seated moves'}</div>
          <div className="lead">{s.answers.minutes ?? 5} minutes a day, 5 days a week</div>
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
            <Choice selected={plan === 'monthly'} onClick={() => choose('monthly')}>
              <span className="plan">
                <span className="price">{money(m.intro)} today</span>
                <br />
                for your first {m.introDays} days, then {money(m.price)} a month until you cancel
              </span>
            </Choice>
            <Choice selected={plan === 'quarter'} onClick={() => choose('quarter')}>
              <span className="plan">
                <span className="price">3 months for {money(q.price)}</span>
                <br />
                paid once today, renews at {money(q.price)} every 3 months
              </span>
            </Choice>
          </div>

          <section className="card timeline" aria-label="What happens and when">
            {plan === 'monthly' ? (
              <>
                <TimelineRow now title={`Today, ${shortDate(today)}`} text={`You pay ${money(m.intro)}. Your plan starts now.`} />
                <TimelineRow
                  title={shortDate(addDays(today, m.introDays - REMINDER_DAYS_BEFORE))}
                  text={`We email you a reminder, ${REMINDER_DAYS_BEFORE} days before the first full charge.`}
                />
                <TimelineRow title={shortDate(charge)} text={`${money(m.price)}, then ${money(m.price)} every month until you cancel.`} />
              </>
            ) : (
              <>
                <TimelineRow now title={`Today, ${shortDate(today)}`} text={`You pay ${money(q.price)} for 3 months.`} />
                <TimelineRow title={shortDate(addDays(renew, -REMINDER_DAYS_BEFORE))} text="We email you a reminder." />
                <TimelineRow title={shortDate(renew)} text={`${money(q.price)} for the next 3 months, until you cancel.`} />
              </>
            )}
          </section>

          <p>Cancel any time online or by email. One step. No phone tree.</p>

          <Check
            checked={agreed}
            onChange={(v) => {
              setAgreed(v);
              if (v) track('consent_given', { kind: 'auto_renew_box' });
            }}
          >
            {consent}
          </Check>

          {error != null && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          <button className="btn" type="button" disabled={!agreed || phase !== 'idle'} onClick={() => void checkout()}>
            {phase === 'opening' ? 'Opening checkout…' : plan === 'monthly' ? `Start my first week for ${money(m.intro)}` : `Pay ${money(q.price)} for 3 months`}
          </button>
          <p className="caption center">
            By paying you agree to the <a href={url('/terms')}>Terms</a>. Charges appear as {DESCRIPTOR}.
          </p>
        </>
      )}

      {createPortal(<div id="checkout" ref={target} />, document.body)}

      <div className="note">
        <b>Not for you?</b> Reply to any email within {GUARANTEE_DAYS} days of a charge and we refund it.
      </div>

      <section className="card stack">
        <Carla />
        <p className="lead">We are a new app. The exercises were reviewed by a physical therapist. Walkito is not medical care.</p>
        <p className="small">
          Questions: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          <br />
          {COMPANY_LINE}
          <br />
          Charges appear as {DESCRIPTOR}.
        </p>
      </section>

      <section className="stack" aria-label="Questions">
        <details>
          <summary>What do I get?</summary>
          <p className="lead">
            A plan of short daily foot exercises, {s.answers.minutes ?? 5} minutes a day, with a video for every move. It
            changes each week from how the last one went. It works here in your browser and in the Walkito app on iPhone and
            Android, with the same email.
          </p>
        </details>
        <details>
          <summary>How do I cancel?</summary>
          <p className="lead">
            Open the link in any email from us, or go to {SITE}/s/cancel, and tap Cancel. Or reply to any email
            and we will do it for you. You keep access until the end of the time you paid for.
          </p>
        </details>
        <details>
          <summary>Is this medical care?</summary>
          <p className="lead">
            No. Walkito is an exercise program, not a diagnosis or treatment. If something hurts, feels worse, or you are not
            sure an exercise is right for you, ask your doctor or physical therapist.
          </p>
        </details>
      </section>

      <div className="stack" style={{ marginTop: '0.5rem' }}>
        <p className="small center">Prefer the App Store?</p>
        <AppButton from="price" quiet label="Download and start in the app" />
      </div>
    </Page>
  );
}

function TimelineRow({ title, text, now }: { title: string; text: string; now?: boolean }) {
  return (
    <div className={now === true ? 't now' : 't'}>
      <span className="dot" />
      <div>
        <div style={{ fontWeight: 700 }}>{title}</div>
        <div className="lead">{text}</div>
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
        <p className="card lead">{ANSWER[picked]}</p>
      )}
      <button className="btn secondary" type="button" onClick={onBack}>
        Back to my plan
      </button>
    </section>
  );
}
