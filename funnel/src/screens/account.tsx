import { useEffect, useState, type ReactNode } from 'react';

import { DESCRIPTOR, GUARANTEE_DAYS, SUPPORT_EMAIL } from '../config';
import { longDate, sessionOne, STEP } from '../flow';
import { access, currentUser, sendCode, signOut, verifyCode, type Access } from '../lib/account';
import { identify, track } from '../lib/analytics';
import { go } from '../router';
import { update, useFunnel } from '../state';
import { AppButton, Page } from '../ui';

type Session = { userId: string; email: string } | null;

function useSession(): [Session | undefined, (s: Session) => void] {
  const [session, setSession] = useState<Session | undefined>(undefined);
  useEffect(() => {
    void currentUser().then((user) =>
      setSession(user != null && user.is_anonymous !== true && user.email != null ? { userId: user.id, email: user.email } : null),
    );
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

function useAccess(session: Session | undefined): Access | null | undefined {
  const [state, setState] = useState<Access | null | undefined>(undefined);
  useEffect(() => {
    if (session == null) return;
    void access().then(setState);
  }, [session]);
  return state;
}

function planLine(a: Access): string {
  const name = a.product_id?.includes('yearly') === true ? 'Yearly plan' : a.product_id?.includes('quarter') === true ? '3-month plan' : 'Monthly plan';
  const next = a.intro_ends_at != null && new Date(a.intro_ends_at) > new Date() ? a.intro_ends_at : a.period_end;
  if (a.status === 'cancelled' || a.status === 'expired')
    return a.period_end != null && new Date(a.period_end) > new Date()
      ? `Your plan is cancelled. You keep access until ${longDate(new Date(a.period_end))}.`
      : 'Your plan has ended.';
  if (next == null) return 'Your plan is active.';
  return `${name}. Next charge: ${longDate(new Date(next))}.`;
}

export function Me() {
  const s = useFunnel();
  const [session, setSession] = useSession();
  const status = useAccess(session);
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
      {status === undefined ? (
        <p className="caption">Checking your plan…</p>
      ) : status?.access === true ? (
        <p className="note">{planLine(status)}</p>
      ) : (
        <Blocked>
          We could not find a paid plan for this email yet. If you just paid, wait a minute and reload. Still stuck? Write to{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </Blocked>
      )}
      {status?.access === true && moves.length > 0 && s.session1 !== 'done' && (
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
      {status?.access === true && (
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
  const status = useAccess(session);
  const [choice, setChoice] = useState<'pause' | 'cancel' | 'keep' | null>(null);
  useEffect(() => {
    track('cancel_viewed');
  }, []);

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
      {status === undefined && <p className="caption">Checking your plan…</p>}
      {status != null && <p className="note">{planLine(status)}</p>}
      {status?.access !== true && status !== undefined && (
        <Blocked>
          We could not find an active plan for {session.email}. Bought in the iPhone app? Cancel in iPhone Settings →
          your name → Subscriptions. On Android, in Google Play → Payments & subscriptions.
        </Blocked>
      )}
      {status?.access === true && choice == null && (
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
          {status?.management_url != null ? (
            <a className="btn" href={status.management_url} rel="noopener">
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
