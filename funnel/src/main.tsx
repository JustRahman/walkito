import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { meta, startAnalytics, startPixel, track, webview } from './lib/analytics';
import { getState, update } from './state';
import './styles.css';

const params = new URLSearchParams(location.search);
const utm: Record<string, string> = {};
for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ad_id', 'adset_id', 'campaign_id']) {
  const value = params.get(key);
  if (value != null) utm[key] = value.slice(0, 200);
}
if (Object.keys(utm).length > 0 && getState().utm == null) update({ utm });

startAnalytics();
startPixel();
track('funnel_landed', { source: utm.utm_source ?? null, campaign: utm.utm_campaign ?? null, webview: webview() });
meta('PageView', `view-${crypto.randomUUID()}`);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
