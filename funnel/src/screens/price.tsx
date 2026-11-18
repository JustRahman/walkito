import { useEffect, useMemo, useRef, useState } from 'react';

import {
  COMPANY_LINE,
  PREVIEW,
  DEFAULT_VARIANT,
  DESCRIPTOR,
  GUARANTEE_DAYS,
  money,
  PRICE_OFFER,
  PRICE_VARIANTS,
  REMINDER_DAYS_BEFORE,
  SITE,
  SUPPORT_EMAIL,
  url,
} from '../config';
import { addDays, kindOf, PLAN_NAME, planLine, shortDate, STEP } from '../flow';
import { currentUser, guardCheckout, logConsent, saveLead } from '../lib/account';
import { meta, track } from '../lib/analytics';
import { billingReady, buy, loadPackages, type Packages } from '../lib/billing';
import { back, go } from '../router';
import { update, useFunnel } from '../state';
import { AppButton, Check, Choice, Icon, Page } from '../ui';
import { PLACEHOLDER_REVIEWS } from '../preview/placeholders';
import { REVIEWS } from './story';
import { TrustLines } from './trust';

type PlanId = 'monthly' | 'yearly';

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
  const [phase, setPhase] = useState<'idle' | 'opening' | 'open' | 'gift' | 'held-back'>('idle');
  const [heldBack, setHeldBack] = useState<string | null>(null);
  /** The offer is on screen in this visit (it was not shown before). */
  const [offerShownNow, setOfferShownNow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nudge, setNudge] = useState(false);
  /** The yearly row shows once RevenueCat has the product, so it never opens a checkout that is not there. */
  const [yearly, setYearly] = useState<boolean | null>(null);
  /** RevenueCat has the one-time offer's product: without it the offer is never shown. */
  const [offerReady, setOfferReady] = useState(false);
  const consentBox = useRef<HTMLDivElement>(null);
  /** A link's `?plan=yearly` falls back to the first plan when RevenueCat has no yearly product. */
  const plan: PlanId = picked === 'yearly' && yearly === false ? 'monthly' : picked;

  const today = useMemo(() => new Date(), []);
  const m = variant.monthly;
  const y = variant.yearly;
  const charge = addMonths(today, 1);
  const renewYear = addMonths(today, y.months);
  const consent =
    plan === 'monthly'
      ? `I understand: ${money(m.intro)} today, then ${money(m.price)} a month from ${shortDate(charge)} until I cancel.`
      : `I understand: ${money(y.price)} today, then ${money(y.price)} every year from ${yearDate(renewYear)} until I cancel.`;

  useEffect(() => {
    track('price_viewed');
    // The deepest step Meta still receives on this site: the health category blocks checkout and purchase.
    meta('ViewContent', `price-${crypto.randomUUID()}`);
    void saveLead({ price_viewed_at: new Date().toISOString() });
    if (!billingReady()) return setYearly(false);
    packages.current = currentUser().then(async (user) => {
      if (user == null) return (setYearly(false), null);
      try {
        const loaded = await loadPackages(user.id, variant);
        setYearly(loaded.yearly != null);
        setOfferReady(loaded.offer != null);
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
    if (!(await onHerOwnAccount(s.email))) return setPhase('idle');
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
      const value = plan === 'monthly' ? m.intro : y.price;
      update({ purchased: true, plan });
      track('purchase_completed', { plan });
      meta('Purchase', `purchase-${user.id}`, { value, currency: 'USD' });
      go(STEP.start1, { replace: true });
      return;
    }
    if (result.status === 'cancelled') {
      track('checkout_closed', { plan });
      setPhase(showGift('checkout_closed') ? 'gift' : 'held-back');
      return;
    }
    track('checkout_failed', { plan, code: result.code });
    setError(result.message);
    setPhase('idle');
  };

  /**
   * Her address may belong to another account by now (the app, or a sign-up
   * since the email step): then she signs in to it with a code first, so the
   * purchase is made on the account the app opens. False when checkout must
   * not open now.
   */
  const onHerOwnAccount = async (email: string): Promise<boolean> => {
    const guard = await guardCheckout(email);
    if (guard.next === 'checkout') return true;
    if (guard.next === 'error') {
      setError(guard.message);
      return false;
    }
    track('checkout_needs_sign_in');
    update({ codeMode: 'sign-in', verified: false, existing: true });
    go(STEP.code);
    return false;
  };

  /**
   * The one-time gift, at most once per person: marked before it is seen, so
   * a reload never brings it back. False when it was shown before, she has
   * bought, or RevenueCat has no such product.
   */
  const showGift = (trigger: 'checkout_closed' | 'leave' | 'held_back'): boolean => {
    if (!offerReady || s.offerShown === true || s.purchased === true) return false;
    setOfferShownNow(trigger === 'held_back');
    update({ offerShown: true });
    void saveLead({ offer_shown_at: new Date().toISOString() });
    track('exit_gift_shown', { offer: PRICE_OFFER.id, trigger });
    return true;
  };

  /** The one-time offer's checkout: the same consent, events and success page as the main plans. */
  const buyOffer = async (consentText: string): Promise<string | null> => {
    const user = await currentUser();
    if (user == null || s.email == null) {
      go(STEP.email);
      return null;
    }
    if (!(await onHerOwnAccount(s.email))) return null;
    const loaded = await packages.current;
    const pkg = loaded?.offer;
    if (!billingReady() || pkg == null) return 'Checkout is not open yet. Please try again in a few minutes.';
    void logConsent('auto_renew', consentText, true);
    track('consent_given', { kind: 'auto_renew' });
    void saveLead({ checkout_opened_at: new Date().toISOString() });
    track('offer_checkout_opened', { offer: PRICE_OFFER.id });
    meta('InitiateCheckout', `checkout-${user.id}-${Date.now()}`);
    const result = await buy(user.id, pkg, s.email);
    if (result.status === 'bought') {
      update({ purchased: true, plan: 'yearly' });
      track('exit_gift_purchased', { offer: PRICE_OFFER.id });
      track('purchase_completed', { plan: 'yearly_offer' });
      meta('Purchase', `purchase-${user.id}`, { value: PRICE_OFFER.intro, currency: 'USD' });
      go(STEP.start1, { replace: true });
      return null;
    }
    if (result.status === 'cancelled') {
      track('offer_closed', { offer: PRICE_OFFER.id });
      return null;
    }
    track('offer_failed', { offer: PRICE_OFFER.id, code: result.code });
    return result.message;
  };

  const retest = addDays(today, 14);
  if (phase === 'gift')
    return (
      <Gift
        onBuy={buyOffer}
        onClose={() => {
          track('exit_gift_declined', { offer: PRICE_OFFER.id });
          setPhase('held-back');
        }}
      />
    );
  const perDay = (total: number, days: number) => money(Math.round((total / days) * 100) / 100);
  const monthDays = Math.round((charge.getTime() - today.getTime()) / 86_400_000);
  const yearDays = Math.round((renewYear.getTime() - today.getTime()) / 86_400_000);
  return (
    <Page
      backTo={STEP.plan}
      onBack={phase === 'idle' ? () => (showGift('leave') ? setPhase('gift') : back(STEP.plan)) : undefined}
      footer
    >
      <div className="stack gap-s center">
        <h1>{PLAN_NAME[kindOf(s.answers)]}</h1>
        <p className="small">{planLine(s.answers)}</p>
      </div>
      <figure className="quote">
        <div className="stars" aria-label="5 stars on the App Store">
          ★★★★★
        </div>
        {PREVIEW ? (
          <>
            <blockquote data-placeholder={PLACEHOLDER_REVIEWS[0].mark}>“{PLACEHOLDER_REVIEWS[0].text}”</blockquote>
            <figcaption>{PLACEHOLDER_REVIEWS[0].author}</figcaption>
          </>
        ) : (
          <>
            <blockquote>“The interface is clean and easy to navigate, and programs are easy to follow.”</blockquote>
            <figcaption>{REVIEWS[1].author}, App Store</figcaption>
          </>
        )}
      </figure>

      {phase === 'held-back' ? (
        <HeldBack
          picked={heldBack}
          offer={heldBack === 'price' && offerShownNow}
          onPick={(reason) => {
            setHeldBack(reason);
            track('held_back', { reason });
            if (reason === 'price') showGift('held_back');
            if (reason === 'think') {
              void saveLead({ plan_email_requested_at: new Date().toISOString() });
              track('plan_email_requested');
            }
          }}
          onBuyOffer={buyOffer}
          onBack={() => {
            setHeldBack(null);
            setPhase('idle');
          }}
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
                <span className="name">First month</span>
                <span className="hint">
                  {money(m.intro)} today, then {money(m.price)} a month
                </span>
              </span>
              <span className="perday">
                <b>{perDay(m.intro, monthDays)}</b>
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
                  <TimelineRow title={shortDate(retest)} text="Day 14: redo your first move and compare." />
                  <TimelineRow title={shortDate(addDays(charge, -REMINDER_DAYS_BEFORE))} text="We email you a reminder." />
                  <TimelineRow title={shortDate(charge)} text={`${money(m.price)} a month. Cancel any time.`} />
                </>
              ) : (
                <>
                  <TimelineRow now title="Today" text={`${money(y.price)} for a year.`} />
                  <TimelineRow title={shortDate(retest)} text="Day 14: redo your first move and compare." />
                  <TimelineRow title={yearDate(addDays(renewYear, -REMINDER_DAYS_BEFORE))} text="We email you a reminder." />
                  <TimelineRow title={yearDate(renewYear)} text={`${money(y.price)} for the next year. Cancel any time.`} />
                </>
              )}
            </div>
          </section>

          <TrustLines />

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

/** The answer under "The price" once the one-time offer has been shown (or when there is none). */
const PRICE_ANSWER = `If a charge was not worth it, reply to any email within ${GUARANTEE_DAYS} days and we refund it.`;

function HeldBack({
  picked,
  offer,
  onPick,
  onBuyOffer,
  onBack,
}: {
  picked: string | null;
  offer: boolean;
  onPick: (reason: string) => void;
  onBuyOffer: (consentText: string) => Promise<string | null>;
  onBack: () => void;
}) {
  const back = (
    <button className="btn secondary" type="button" onClick={onBack}>
      Back to my plan
    </button>
  );
  if (picked == null)
    return (
      <section className="stack">
        <h2>What held you back?</h2>
        {HELD_BACK.map((o) => (
          <Choice key={o.value} onClick={() => onPick(o.value)}>
            {o.label}
          </Choice>
        ))}
        {back}
      </section>
    );
  return (
    <section className="stack">
      <h2>What held you back?</h2>
      {picked === 'price' && offer ? (
        <OfferCard onBuy={onBuyOffer} />
      ) : picked === 'price' ? (
        <p className="card">{PRICE_ANSWER}</p>
      ) : picked === 'unsure' ? (
        <div className="card stack">
          <p className="lead">Try it. If it is not for you, {GUARANTEE_DAYS}-day money-back: one email and we refund.</p>
          <button className="btn" type="button" onClick={onBack}>
            Back to the plans
          </button>
        </div>
      ) : picked === 'think' ? (
        <p className="card">Your plan is saved. We will email it to you.</p>
      ) : (
        <p className="card">
          Write to us, a person reads every email. <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        </p>
      )}
      {picked !== 'unsure' && back}
    </section>
  );
}

/**
 * Shown once, after "The price": the first year for $29.99, then $49.99 a
 * year. The same unticked consent box as the main plans, with the exact
 * amounts and the renewal date.
 */
function OfferCard({ onBuy, headline = true }: { onBuy: (consentText: string) => Promise<string | null>; headline?: boolean }) {
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const renews = useMemo(() => addMonths(new Date(), PRICE_OFFER.months), []);
  const consent = `I understand: ${money(PRICE_OFFER.intro)} today for my first year, then ${money(PRICE_OFFER.price)} every year from ${yearDate(renews)} until I cancel.`;
  return (
    <div className="card stack">
      {headline && (
        <p className="lead">
          <b>
            Your first year for {money(PRICE_OFFER.intro)}. Then {money(PRICE_OFFER.price)} a year. Cancel any time.
          </b>
        </p>
      )}
      <Check checked={agreed} onChange={setAgreed}>
        {consent}
      </Check>
      {error != null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button
        className="btn"
        type="button"
        disabled={!agreed || busy}
        onClick={() => {
          setBusy(true);
          setError(null);
          void onBuy(consent).then((message) => {
            setBusy(false);
            setError(message);
          });
        }}
      >
        {busy ? 'Opening checkout…' : `Start my year for ${money(PRICE_OFFER.intro)}`}
      </button>
    </div>
  );
}

/**
 * Flo's gift box: a closed box first, the offer when she opens it. Shown once,
 * by the same triggers as before. No timer, nothing that runs out.
 */
function Gift({ onBuy, onClose }: { onBuy: (consentText: string) => Promise<string | null>; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <main className="page gift-page">
      <header className="topbar">
        <button className="back" type="button" onClick={onClose} aria-label="No, thanks">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>
      </header>
      <div className="fade stack gap-l" style={{ flex: 1, justifyContent: 'center' }}>
        <div className={open ? 'box small' : 'box pop'} aria-hidden="true">
          <Icon name="sparkles" size={34} />
          <Icon name="gift" size={open ? 96 : 168} />
          <Icon name="sparkles" size={26} />
        </div>
        {open ? (
          <>
            <div className="stack gap-s center">
              <h1>Your first year {money(PRICE_OFFER.intro)}</h1>
              <p className="lead">Then {money(PRICE_OFFER.price)} a year. Cancel any time.</p>
            </div>
            <OfferCard onBuy={onBuy} headline={false} />
            <button className="btn quiet" type="button" onClick={onClose}>
              No, thanks
            </button>
          </>
        ) : (
          <div className="stack gap-s center">
            <h1>A gift just for you</h1>
            <p className="lead">Open the box to see your offer.</p>
          </div>
        )}
      </div>
      {!open && (
        <div className="cta">
          <button className="btn gift-open" type="button" onClick={() => setOpen(true)}>
            Open now
          </button>
        </div>
      )}
    </main>
  );
}
