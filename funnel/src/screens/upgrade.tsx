import { useEffect, useState } from 'react';

import { DEFAULT_VARIANT, money, PRICE_VARIANTS } from '../config';
import { track } from '../lib/analytics';
import { switchToYearly } from '../lib/billing';
import { update, useFunnel } from '../state';
import { Page } from '../ui';

/**
 * One screen before "You're in", for monthly buyers only, when
 * YEARLY_UPGRADE_ENABLED is on (it is off; see `switchToYearly`).
 */
export function YearlyUpgrade() {
  const s = useFunnel();
  const variant = PRICE_VARIANTS[s.variant] ?? PRICE_VARIANTS[DEFAULT_VARIANT]!;
  const y = variant.yearly;
  const m = variant.monthly;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    track('upgrade_shown');
  }, []);

  const perMonth = money(Math.round((y.price / y.months) * 100) / 100);
  const decline = () => {
    track('upgrade_declined');
    update({ upgrade: 'declined' });
  };
  const switchNow = async () => {
    setBusy(true);
    setError(null);
    const result = await switchToYearly();
    setBusy(false);
    if (result.status === 'switched') {
      track('upgrade_switched');
      update({ upgrade: 'switched', plan: 'yearly' });
      return;
    }
    if (result.status === 'cancelled') return;
    track('upgrade_failed', { code: result.status === 'failed' ? result.code : 'unsupported' });
    setError(result.status === 'failed' ? result.message : 'This is not available yet. Your monthly plan is set up and working.');
  };

  return (
    <Page footer={false}>
      <h1>Want the whole year instead?</h1>
      <p className="lead">
        {money(y.price)} for 12 months, {perMonth} a month instead of {money(m.price)}. We count the {money(m.intro)} you just paid. One
        tap, same card.
      </p>
      {error != null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="btn" type="button" disabled={busy} onClick={() => void switchNow()}>
        {busy ? 'Switching…' : 'Switch to a year'}
      </button>
      <button className="btn quiet" type="button" onClick={decline}>
        No thanks, keep monthly
      </button>
    </Page>
  );
}
