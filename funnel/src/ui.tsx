import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';

import { CARLA_PHOTO, PREVIEW, url } from './config';
import { PLACEHOLDER_CARLA_QUOTE } from './preview/placeholders';
import { appLink } from './flow';
import { ICONS, type IconName } from './icons.gen';
import { track } from './lib/analytics';
import { back, go } from './router';

export type { IconName };

export function Page({
  children,
  progress,
  backTo,
  footer = false,
}: {
  children: ReactNode;
  progress?: number;
  backTo?: string;
  footer?: boolean;
}) {
  return (
    <main className="page">
      <header className="topbar">
        {backTo != null && (
          <button className="back" type="button" onClick={() => back(backTo)} aria-label="Back">
            <Chevron />
          </button>
        )}
        <a className="brand" href={url('/')} onClick={(e) => (e.preventDefault(), go('/'))}>
          <img src={url('/img/icon.webp')} alt="" width={26} height={26} />
          Walkito
        </a>
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

function Chevron({ right }: { right?: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={right === true ? 'M9 5l7 7-7 7' : 'M15 5l-7 7 7 7'} stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
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
 * A full-colour screen, as QUITTR's: the brand on top, one picture, one big
 * line, at most one short line, the dots of its set and one white pill.
 */
export function Slide({
  tone,
  children,
  dots,
  next,
  label = 'Next',
}: {
  tone: 'warm' | 'deep' | 'sky' | 'night' | 'praise';
  children: ReactNode;
  dots?: { at: number; of: number };
  next: () => void;
  label?: string;
}) {
  return (
    <main className={`slide ${tone}`}>
      <header className="slide-top">
        <img src={url('/img/icon.webp')} alt="" width={26} height={26} />
        Walkito
      </header>
      <div className="slide-body fade" key={typeof location !== 'undefined' ? location.pathname : ''}>
        {children}
      </div>
      {dots != null && (
        <div className="dots" aria-hidden="true">
          {Array.from({ length: dots.of }, (_, i) => (
            <i key={i} className={i === dots.at ? 'on' : undefined} />
          ))}
        </div>
      )}
      <button className="pill" type="button" onClick={next}>
        {label} <Chevron right />
      </button>
    </main>
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
  arrow,
  className,
}: {
  children: ReactNode;
  selected?: boolean;
  onClick: () => void;
  icon?: IconName;
  hint?: string;
  tag?: string;
  arrow?: boolean;
  className?: string;
}) {
  return (
    <button className={className != null ? `choice ${className}` : 'choice'} type="button" aria-pressed={selected === true} onClick={onClick}>
      {icon != null && <Icon name={icon} />}
      <span className="grow">
        {children}
        {hint != null && <span className="hint">{hint}</span>}
      </span>
      {tag != null && <span className="tag">{tag}</span>}
      {arrow === true && (
        <span className="go">
          <Chevron right />
        </span>
      )}
    </button>
  );
}

export function MultiChoice({
  children,
  checked,
  onToggle,
  icon,
  className,
  style,
}: {
  children: ReactNode;
  checked: boolean;
  onToggle: () => void;
  icon?: IconName;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <button className={className != null ? `choice ${className}` : 'choice'} style={style} type="button" role="checkbox" aria-checked={checked} onClick={onToggle}>
      {icon != null && <Icon name={icon} />}
      <span className="grow">{children}</span>
      <span className="tick">{checked && <Tick />}</span>
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
 * Dr. Carla Shayman, with exactly what we hold in writing: her Upwork
 * contract (Oct 30, 2026) covers her review of our two English guides, heel
 * pain and flat feet, and the use of her bio and photo. Never "reviewed every
 * exercise" without her broader written consent.
 */
export function Reviewer() {
  return (
    <>
      {PREVIEW && (
        <p className="doc-quote" data-placeholder={PLACEHOLDER_CARLA_QUOTE.mark}>
          “{PLACEHOLDER_CARLA_QUOTE.text}”
        </p>
      )}
      <figure className="doctor">
      <img src={CARLA_PHOTO.replace('.webp', '@2x.webp')} alt="Dr. Carla Shayman" />
      <figcaption>
        <b>Dr. Carla Shayman, PT, DPT</b>
        <span>Physical therapist</span>
        <span className="tint">Reviewed our heel pain and flat feet guides</span>
        </figcaption>
      </figure>
    </>
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
    <a className={quiet === true ? 'btn quiet' : 'btn'} href={appLink(from)} onClick={() => track('app_link_tapped', { from })}>
      {label}
    </a>
  );
}

export function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
