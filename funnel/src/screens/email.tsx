import { useEffect, useRef, useState } from 'react';

import { PROGRESS, STEP } from '../flow';
import { access, logConsent, saveAnswers, saveLead, sendCode, verifyCode, type CodeMode } from '../lib/account';
import { identify, track } from '../lib/analytics';
import { go } from '../router';
import { getState, update, useFunnel } from '../state';
import { Check, Page } from '../ui';

export const CONSENT_HEALTH =
  'Save my answers with my plan, so the app can use them. I can delete them at any time.';
export const CONSENT_MARKETING = 'Send me foot tips and news by email. I can unsubscribe at any time.';

const DOMAINS = ['gmail.com', 'yahoo.com', 'hotmail.com', 'aol.com', 'outlook.com', 'icloud.com', 'comcast.net', 'msn.com', 'live.com', 'att.net', 'verizon.net', 'sbcglobal.net', 'bellsouth.net', 'me.com'];

/** "gmial.com" → "gmail.com": one letter off, or two swapped. */
export function suggestDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 1) return null;
  const domain = email.slice(at + 1).toLowerCase();
  if (domain === '' || DOMAINS.includes(domain)) return null;
  for (const known of DOMAINS) if (distance(domain, known) <= 2 && domain.length > 3) return email.slice(0, at + 1) + known;
  return null;
}

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
    }
  return d[a.length]![b.length]!;
}

export function Email() {
  const s = useFunnel();
  const [email, setEmail] = useState(s.email ?? '');
  const [health, setHealth] = useState(s.consents?.health ?? false);
  const [marketing, setMarketing] = useState(s.consents?.marketing ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hint = suggestDomain(email.trim());

  const submit = async () => {
    setBusy(true);
    setError(null);
    track('email_submitted');
    const sent = await sendCode(email);
    setBusy(false);
    if (!sent.ok) {
      track('email_code_failed', { reason: sent.reason });
      setError(sent.message);
      return;
    }
    update({ email: email.trim().toLowerCase(), codeMode: sent.mode, verified: false, consents: { health, marketing } });
    go(STEP.code);
  };

  return (
    <Page progress={PROGRESS[STEP.email]} backTo={STEP.plan}>
      <div className="stack">
        <h2>Where should we send your plan?</h2>
        <p className="small">We use this to save your plan and sign you in. We never sell it.</p>
      </div>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) void submit();
        }}
      >
        <input
          className="field"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="you@example.com"
          aria-label="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {hint != null && (
          <button className="btn quiet" type="button" style={{ justifyContent: 'flex-start' }} onClick={() => setEmail(hint)}>
            Did you mean {hint.slice(hint.indexOf('@') + 1)}?
          </button>
        )}
        <Check checked={health} onChange={setHealth}>
          {CONSENT_HEALTH}
        </Check>
        <Check checked={marketing} onChange={setMarketing}>
          {CONSENT_MARKETING}
        </Check>
        {error != null && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="btn" type="submit" disabled={busy || email.trim().length < 5}>
          {busy ? 'Sending…' : 'Save my plan'}
        </button>
        <p className="caption">We will email you a 6-digit code to confirm it is you. No password.</p>
      </form>
    </Page>
  );
}

/** After the code: everything she agreed to, written once under her account. */
async function afterSignIn(userId: string, email: string, existing: boolean): Promise<void> {
  const s = getState();
  identify(userId, email);
  const utm = { ...(s.utm ?? {}), tz: Intl.DateTimeFormat().resolvedOptions().timeZone };
  await Promise.allSettled([
    saveLead({
      email,
      locale: navigator.language,
      variant: 'web-v1',
      price_variant: s.variant,
      utm,
      fbp: document.cookie.match(/(?:^|; )_fbp=([^;]*)/)?.[1] ?? null,
      fbc: document.cookie.match(/(?:^|; )_fbc=([^;]*)/)?.[1] ?? null,
      user_agent: navigator.userAgent,
    }),
    logConsent('health_answers', CONSENT_HEALTH, s.consents?.health === true),
    logConsent('marketing', CONSENT_MARKETING, s.consents?.marketing === true),
    saveAnswers(
      s.consents?.health === true
        ? { answers: s.answers, try_it: s.tryIt, plan: { minutes: s.answers.minutes, focus: s.answers.focus } }
        : { answers: null, try_it: null, plan: null },
    ),
  ]);
  update({ verified: true, existing });
}

export function Code() {
  const s = useFunnel();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(60);
  const input = useRef<HTMLInputElement>(null);
  const email = s.email ?? '';
  const mode: CodeMode = s.codeMode ?? 'create';

  useEffect(() => {
    const timer = setInterval(() => setWait((w) => Math.max(0, w - 1)), 1000);
    return () => clearInterval(timer);
  }, []);

  const submit = async (value: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await verifyCode(email, value, mode);
    if (!result.ok) {
      setBusy(false);
      track('email_code_failed', { reason: result.reason });
      setError(result.message);
      setCode('');
      input.current?.focus();
      return;
    }
    const existing = result.mode === 'sign-in';
    await afterSignIn(result.userId, result.email, existing);
    track('email_verified', { existing });
    const status = existing ? await access() : null;
    setBusy(false);
    go(status?.access === true ? STEP.me : STEP.price, { replace: true });
  };

  return (
    <Page progress={PROGRESS[STEP.code]} backTo={STEP.email}>
      <div className="stack">
        <h2>Check your email</h2>
        <p className="lead">
          We sent a 6-digit code to <b style={{ color: 'var(--text)' }}>{email}</b>.
          {mode === 'sign-in' && ' This address already has a Walkito account, so the code signs you in to it.'}
        </p>
      </div>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.length === 6) void submit(code);
        }}
      >
        <input
          ref={input}
          className="field code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          aria-label="6-digit code"
          autoFocus
          value={code}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
            setCode(digits);
            if (digits.length === 6) void submit(digits);
          }}
        />
        {error != null && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="btn" type="submit" disabled={busy || code.length !== 6}>
          {busy ? 'Checking…' : 'Continue'}
        </button>
      </form>
      <p className="small">Can’t find it? Look in your spam or promotions folder. The email comes from Walkito.</p>
      <div className="stack" style={{ gap: 0 }}>
        <button
          className="btn quiet"
          type="button"
          disabled={wait > 0}
          onClick={async () => {
            setWait(60);
            const sent = await sendCode(email, mode);
            if (!sent.ok) setError(sent.message);
            else update({ codeMode: sent.mode });
          }}
        >
          {wait > 0 ? `Send a new code in ${wait} seconds` : 'Send a new code'}
        </button>
        <button className="btn quiet" type="button" onClick={() => go(STEP.email)}>
          Change email
        </button>
      </div>
    </Page>
  );
}
