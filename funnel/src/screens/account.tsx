import { useEffect, useState, type ReactNode } from 'react';

import { DESCRIPTOR, GUARANTEE_DAYS, SUPPORT_EMAIL } from '../config';
import { longDate, sessionOne, STEP } from '../flow';
import { checkAccess, sendCode, signedInUser, signOut, verifyCode, type AccessCheck } from '../lib/account';
import { planStatus, type PlanStatus } from '../lib/plan-status';
import { identify, track } from '../lib/analytics';
import { go } from '../router';
import { update, useFunnel } from '../state';
import { AppButton, Page } from '../ui';

type Session = { userId: string; email: string } | null;

function useSession(): [Session | undefined, (s: Session) => void] {
  const [session, setSession] = useState<Session | undefined>(undefined);
  useEffect(() => {
    void signedInUser().then(setSession);
  }, []);
  return [session, setSession];
}

/** Email, then the 6-digit code: the only way in, on any device. */
function SignIn({ title, onSignedIn }: { title: string; onSignedIn: (s: { userId: string; email: string }) => void }) {
  const s = useFunnel();
  const [email, setEmail] = useState(s.email ?? '');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = async () => {
    setBusy(true);
    setError(null);
    const result = await sendCode(email, 'sign-in');
    setBusy(false);
    if (!result.ok) return setError(result.reason === 'otp_disabled' || result.reason === 'user_not_found' ? 'We could not find a Walkito account with that email.' : result.message);
    setSent(true);
  };

  const confirm = async (value: string) => {
    setBusy(true);
    setError(null);
    const result = await verifyCode(email, value, 'sign-in');
    setBusy(false);
    if (!result.ok) {
      setCode('');
      return setError(result.message);
    }
    identify(result.userId, result.email);
    update({ email: result.email, verified: true });
    onSignedIn({ userId: result.userId, email: result.email });
  };

  return (
    <>
      <h2>{title}</h2>
      {!sent ? (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) void request();
          }}
        >
          <p className="lead">Enter the email you used. We will send you a 6-digit code.</p>
          <input
            className="field"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            aria-label="Email address"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {error != null && <p className="error">{error}</p>}
          <button className="btn" type="submit" disabled={busy || email.trim().length < 5}>
            {busy ? 'Sending…' : 'Send me a code'}
          </button>
        </form>
      ) : (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length === 6) void confirm(code);
          }}
        >
          <p className="lead">
            We sent a code to <b>{email}</b>.
          </p>
          <input
            className="field code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            aria-label="6-digit code"
            autoFocus
            value={code}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
              setCode(digits);
              if (digits.length === 6) void confirm(digits);
            }}
          />
          {error != null && <p className="error">{error}</p>}
          <button className="btn" type="submit" disabled={busy || code.length !== 6}>
            {busy ? 'Checking…' : 'Sign in'}
          </button>
          <button className="btn quiet" type="button" onClick={() => setSent(false)}>
            Use a different email
          </button>
        </form>
      )}
    </>
  );
}

/** The plan, read once per sign-in; `reload` asks again (the "Try again" button). */
function usePlan(session: Session | undefined): [PlanStatus | undefined, AccessCheck | undefined, () => void] {
  const [check, setCheck] = useState<AccessCheck | undefined>(undefined);
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (session == null) return;
    setCheck(undefined);
    void checkAccess().then(setCheck);
  }, [session, round]);
  return [check === undefined ? undefined : planStatus(check), check, () => setRound((n) => n + 1)];
}

/** Exactly one line (or card) per state: the page never says "active" and "not found" at once. */
function PlanLine({ status, email, onRetry, cancel }: { status: PlanStatus | undefined; email: string; onRetry: () => void; cancel?: boolean }) {
  if (status === undefined) return <p className="caption">Checking your plan…</p>;
  switch (status.kind) {
    case 'active':
      return (
        <p className="note">
          {status.nextCharge != null ? `${status.plan}. Next charge: ${longDate(status.nextCharge)}.` : 'Your plan is active.'}
          {status.billingIssue ? ' Your last payment did not go through. We will try your card again.' : ''}
        </p>
      );
    case 'cancelled':
      return (
        <p className="note">
          Your plan is cancelled. You keep access until {longDate(status.endsAt)}. You will not be charged again.
        </p>
      );
    case 'refunded':
      return <p className="note">Your payment was refunded and your plan has ended. You will not be charged again.</p>;
    case 'ended':
      return <p className="note">Your plan has ended. You will not be charged again.</p>;
    case 'error':
      return (
        <div className="card stack">
          <p className="lead">We could not check your plan just now. This is on our side, not yours.</p>
          <button className="btn secondary" type="button" onClick={onRetry}>
            Try again
          </button>
          <p className="caption">
            Still stuck? Write to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
          </p>
        </div>
      );
    case 'none':
      return cancel === true ? (
        <Blocked>
          We could not find a plan bought with {email}. Bought in the iPhone app? Cancel in iPhone Settings → your name →
          Subscriptions. On Android, in Google Play → Payments & subscriptions. Paid with another email? Sign out and use that one.
        </Blocked>
      ) : (
        <Blocked>
          We could not find a paid plan for this email yet. If you just paid, wait a minute and reload. Still stuck? Write to{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </Blocked>
      );
  }
}

export function Me() {
  const s = useFunnel();
  const [session, setSession] = useSession();
  const [status, , retry] = usePlan(session);
  const active = status?.kind === 'active' || status?.kind === 'cancelled';
  useEffect(() => {
    if (session != null) track('account_viewed');
  }, [session]);
  const moves = s.answers.focus != null ? sessionOne(s) : [];

  if (session === undefined) return <Page footer={false}>{null}</Page>;
  if (session == null)
    return (
      <Page footer>
        <SignIn title="Sign in to Walkito" onSignedIn={setSession} />
      </Page>
    );
  return (
    <Page footer>
      <h1>Your plan</h1>
      <p className="lead">Signed in as {session.email}.</p>
      <PlanLine status={status} email={session.email} onRetry={retry} />
      {active && moves.length > 0 && s.session1 !== 'done' && (
        <button className="btn secondary" type="button" onClick={() => go(STEP.start1)}>
          Start Day 1 in the browser
        </button>
      )}
      <section className="card stack">
        <h2>Walkito works best in the app</h2>
        <p className="lead">
          Every day’s session, reminders and your progress. Open the app, tap “Already have an account”, and sign in with{' '}
          <b>{session.email}</b>.
        </p>
        <AppButton from="account" label="Get the app" />
      </section>
      {status?.kind === 'active' && (
        <button className="btn quiet" type="button" onClick={() => go(STEP.cancel)}>
          Manage or cancel my plan
        </button>
      )}
      <button
        className="btn quiet"
        type="button"
        onClick={() => {
          void signOut().then(() => setSession(null));
        }}
      >
        Sign out
      </button>
    </Page>
  );
}

function Blocked({ children }: { children: ReactNode }) {
  return <p className="card lead">{children}</p>;
}

export function Cancel() {
  const [session, setSession] = useSession();
  const [status, check, retry] = usePlan(session);
  const access = check?.ok === true ? check.access : null;
  const [choice, setChoice] = useState<'pause' | 'cancel' | 'keep' | null>(null);
  useEffect(() => {
    track('cancel_viewed');
  }, []);
  useEffect(() => {
    if (status !== undefined) track('cancel_status', { status: status.kind, matched_by: access?.matched_by ?? 'none' });
  }, [status, access?.matched_by]);

  if (session === undefined) return <Page footer={false}>{null}</Page>;
  if (session == null)
    return (
      <Page footer>
        <SignIn title="Manage your plan" onSignedIn={setSession} />
      </Page>
    );

  const pick = (c: 'pause' | 'cancel' | 'keep') => {
    setChoice(c);
    track('cancel_chosen', { choice: c });
  };
  const pauseMail = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Pause my plan for 1 month')}&body=${encodeURIComponent(`Please pause the Walkito plan for ${session.email} for one month.`)}`;
  const cancelMail = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Cancel my plan')}&body=${encodeURIComponent(`Please cancel the Walkito plan for ${session.email}.`)}`;

  return (
    <Page backTo={STEP.me} footer>
      <h1>Manage your plan</h1>
      <PlanLine status={status} email={session.email} onRetry={retry} cancel />
      {status?.kind === 'active' && choice == null && (
        <div className="stack">
          <button className="btn secondary" type="button" onClick={() => pick('pause')}>
            Pause for 1 month
          </button>
          <button className="btn secondary" type="button" onClick={() => pick('cancel')}>
            Cancel my plan
          </button>
          <button className="btn" type="button" onClick={() => pick('keep')}>
            Keep my plan
          </button>
        </div>
      )}
      {choice === 'pause' && (
        <div className="card stack">
          <p className="lead">
            Send us this email and we pause your plan for one month: no charge in that month, and it picks up again after.
            We confirm by email within one working day.
          </p>
          <a className="btn" href={pauseMail}>
            Email: pause my plan
          </a>
          <button className="btn quiet" type="button" onClick={() => setChoice(null)}>
            Back
          </button>
        </div>
      )}
      {choice === 'cancel' && (
        <div className="card stack">
          <p className="lead">
            You keep access until the end of the time you paid for. Nothing more is charged after that.
            {' '}Not for you? Reply to any email within {GUARANTEE_DAYS} days of a charge and we refund it.
          </p>
          {access?.management_url != null ? (
            <a className="btn" href={access.management_url} rel="noopener">
              Cancel my plan now
            </a>
          ) : (
            <a className="btn" href={cancelMail}>
              Email: cancel my plan
            </a>
          )}
          <p className="caption">
            Or write to <a href={cancelMail}>{SUPPORT_EMAIL}</a>. Charges appear as {DESCRIPTOR}.
          </p>
          <button className="btn quiet" type="button" onClick={() => setChoice(null)}>
            Back
          </button>
        </div>
      )}
      {choice === 'keep' && (
        <div className="card stack">
          <p className="lead">Good. Your plan carries on as it is.</p>
          <button className="btn" type="button" onClick={() => go(STEP.me)}>
            Back to my plan
          </button>
        </div>
      )}
    </Page>
  );
}
