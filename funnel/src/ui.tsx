import { useEffect, useRef, type ReactNode } from 'react';

import { url } from './config';
import { appLink } from './flow';
import { track } from './lib/analytics';
import { back, go } from './router';

export function Page({
  children,
  progress,
  backTo,
  step,
  footer = true,
}: {
  children: ReactNode;
  progress?: number;
  backTo?: string;
  step?: string;
  footer?: boolean;
}) {
  return (
    <main className="page">
      <header className="topbar">
        {backTo != null ? (
          <button className="back" type="button" onClick={() => back(backTo)} aria-label="Back">
            <Chevron /> Back
          </button>
        ) : (
          <a className="brand" href={url('/')} onClick={(e) => (e.preventDefault(), go('/'))} style={{ color: 'inherit', textDecoration: 'none' }}>
            <img src={url('/img/icon.webp')} alt="" width={28} height={28} />
            Walkito
          </a>
        )}
        {step != null && <span className="step">{step}</span>}
      </header>
      {progress != null && (
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <div style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
      <div className="fade stack gap-l" style={{ flex: 1 }} key={typeof location !== 'undefined' ? location.pathname : ''}>
        {children}
      </div>
      {footer && <Footer />}
    </main>
  );
}

function Chevron() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Tick() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <a href={url('/terms')}>Terms</a>
      <a href={url('/privacy')}>Privacy</a>
      <a href={url('/health-data')}>Consumer health data</a>
      <a href={url('/s/me')}>Sign in</a>
    </footer>
  );
}

export function Choice({
  children,
  selected,
  onClick,
  number,
}: {
  children: ReactNode;
  selected?: boolean;
  onClick: () => void;
  number?: number;
}) {
  return (
    <button className="choice" type="button" aria-pressed={selected === true} onClick={onClick}>
      {number != null && <span className="num">{number}</span>}
      <span>{children}</span>
    </button>
  );
}

export function MultiChoice({ children, checked, onToggle }: { children: ReactNode; checked: boolean; onToggle: () => void }) {
  return (
    <button className="choice" type="button" role="checkbox" aria-checked={checked} onClick={onToggle}>
      <span>{children}</span>
      <span className="tick">{checked && <Tick />}</span>
    </button>
  );
}

export function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

/** Dr. Carla, at the size the app shows her: a 64 px portrait beside her name. */
export function Carla({ line }: { line?: string }) {
  return (
    <div className="person">
      <img src={url('/img/carla-shayman.webp')} srcSet={`${url('/img/carla-shayman.webp')} 1x, ${url('/img/carla-shayman@2x.webp')} 2x`} alt="Dr. Carla Shayman" width={64} height={64} />
      <div>
        <div style={{ fontWeight: 700 }}>Dr. Carla Shayman, PT, DPT</div>
        <div className="small">{line ?? 'Physical therapist. Reviewed the exercises in Walkito.'}</div>
      </div>
    </div>
  );
}

/** A real-feet clip: muted, inline, looping, with its poster until it plays. */
export function Clip({ src, poster, playing, label }: { src: string; poster: string; playing: boolean; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (video == null) return;
    if (playing) void video.play().catch(() => undefined);
    else video.pause();
  }, [playing, src]);
  return (
    <div className="video">
      <video ref={ref} src={src} poster={poster} muted playsInline loop preload="metadata" aria-label={label} />
    </div>
  );
}

export function AppButton({ from, label, quiet }: { from: string; label: string; quiet?: boolean }) {
  return (
    <a className={quiet === true ? 'btn secondary' : 'btn'} href={appLink(from)} onClick={() => track('app_link_tapped', { from })}>
      {label}
    </a>
  );
}

export function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
