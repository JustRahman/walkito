import { useEffect, useRef, useState, type ReactNode } from 'react';

import { url } from './config';
import { appLink, prevOf, sectionOf } from './flow';
import { ICONS, type IconName } from './icons.gen';
import { track } from './lib/analytics';
import { back, usePath } from './router';

export type { IconName };

/** A tapped answer shows its tick for this long before the next screen comes. */
export const ADVANCE_MS = 350;

export function Page({
  children,
  progress,
  backTo,
  footer = false,
}: {
  children: ReactNode;
  progress?: number;
  /** Where Back goes without a history. Left out: the step before, in the quiz. Null: no Back. */
  backTo?: string | null;
  footer?: boolean;
}) {
  const path = usePath();
  const section = sectionOf(path);
  const before = backTo === undefined ? prevOf(path) : backTo;
  return (
    <main className="page">
      <header className="topbar">
        {before != null && (
          <button className="back" type="button" onClick={() => back(before)} aria-label="Back">
            <Chevron />
          </button>
        )}
        {/* Not a link: a tap on the name used to throw her back to the first screen. */}
        <div className="brand">
          <img src={url('/img/icon.webp')} alt="" width={26} height={26} />
          Walkito
        </div>
      </header>
      {progress != null && (
        <>
          {section != null && <div className="section">{section}</div>}
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
            <div style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        </>
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

/** A Fluent Emoji drawing from the app's set, in its own colours. */
export function Icon({ name, size }: { name: IconName; size?: number }) {
  return (
    <svg className="ico" viewBox="0 0 32 32" fill="none" aria-hidden="true" style={size != null ? { width: size, height: size } : undefined} dangerouslySetInnerHTML={{ __html: ICONS[name] }} />
  );
}

/**
 * A statement between questions: one picture, one line, one button, on the
 * same page as every other screen (Back, progress, the same button).
 */
export function Slide({
  children,
  progress,
  next,
  label = 'Next',
}: {
  children: ReactNode;
  progress?: number;
  next: () => void;
  label?: string;
}) {
  return (
    <Page progress={progress}>
      <div className="statement">{children}</div>
      <Cta>
        <button className="btn" type="button" onClick={next}>
          {label}
        </button>
      </Cta>
    </Page>
  );
}

/** The screen's one action, kept at the bottom edge while the page scrolls. */
export function Cta({ children }: { children: ReactNode }) {
  return <div className="cta">{children}</div>;
}

export function Footer() {
  return (
    <footer className="footer">
      <a href={url('/terms')}>Terms</a>
      <a href={url('/privacy')}>Privacy</a>
      <a href={url('/health-data')}>Health data</a>
      <a href={url('/s/me')}>Sign in</a>
    </footer>
  );
}

export function Choice({
  children,
  selected,
  onClick,
  icon,
  hint,
  tag,
}: {
  children: ReactNode;
  selected?: boolean;
  onClick: () => void;
  icon?: IconName;
  hint?: string;
  tag?: string;
}) {
  return (
    <button className="choice" type="button" aria-pressed={selected === true} onClick={onClick}>
      {icon != null && <Icon name={icon} />}
      <span className="grow">
        {children}
        {hint != null && <span className="hint">{hint}</span>}
      </span>
      {tag != null && <span className="tag">{tag}</span>}
      <span className="mark">
        <Tick />
      </span>
    </button>
  );
}

export function MultiChoice({
  children,
  checked,
  onToggle,
  icon,
}: {
  children: ReactNode;
  checked: boolean;
  onToggle: () => void;
  icon?: IconName;
}) {
  return (
    <button className="choice" type="button" role="checkbox" aria-checked={checked} onClick={onToggle}>
      {icon != null && <Icon name={icon} />}
      <span className="grow">{children}</span>
      <span className="mark box">
        <Tick />
      </span>
    </button>
  );
}

export function Check({ checked, onChange, children, className }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; className?: string }) {
  return (
    <label className={className != null ? `check ${className}` : 'check'}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

/**
 * A real-feet clip: muted, inline, looping, with its poster until it plays.
 * With "reduce motion" on it waits on the poster until she asks for it.
 */
export function Clip({ src, poster, playing, label }: { src: string; poster: string; playing: boolean; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [asked, setAsked] = useState(() => !matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const video = ref.current;
    if (video == null) return;
    if (playing && asked) void video.play().catch(() => undefined);
    else video.pause();
  }, [playing, asked, src]);
  return (
    <div className="video">
      <video ref={ref} src={src} poster={poster} muted playsInline loop preload="metadata" aria-label={label} />
      {!asked && (
        <button className="play" type="button" aria-label="Play the video" onClick={() => setAsked(true)}>
          <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
          </svg>
        </button>
      )}
    </div>
  );
}

export function AppButton({ from, label, quiet }: { from: string; label: string; quiet?: boolean }) {
  return (
    <a className={quiet === true ? 'btn quiet' : 'btn'} href={appLink(from)} onClick={() => track('app_link_tapped', { from })}>
      {label}
    </a>
  );
}

export function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
