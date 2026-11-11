import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameView } from '../game/view';
import { useI18n } from '../i18n';
import type { Locale } from '../i18n';
import { CheckIcon, CopyIcon } from './icons';

export function monogram(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return (parts[0] ?? '?').slice(0, 2).toUpperCase();
  return `${(parts[0] ?? '?')[0] ?? ''}${(parts[1] ?? '?')[0] ?? ''}`.toUpperCase();
}

export function CopyButton({
  text,
  label,
  copiedLabel,
  className = 'btn btn--ghost',
  icon = true,
}: {
  text: string;
  label: string;
  copiedLabel: string;
  className?: string;
  icon?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  const copy = useCallback(async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      try {
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        ok = document.execCommand('copy');
        document.body.removeChild(area);
      } catch {
        ok = false;
      }
    }
    if (!ok) return;
    setCopied(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2200);
  }, [text]);

  return (
    <button type="button" className={className} onClick={copy}>
      {copied ? <CheckIcon size={16} /> : icon ? <CopyIcon size={16} /> : null}
      <span>{copied ? copiedLabel : label}</span>
    </button>
  );
}

export function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useI18n();
  const options: Locale[] = ['ru', 'en'];
  return (
    <div
      className={`lang ${compact ? 'lang--compact' : ''}`}
      role="group"
      aria-label={t('aria.lang')}
    >
      {options.map((code) => (
        <button
          key={code}
          type="button"
          className={locale === code ? 'lang__btn is-active' : 'lang__btn'}
          aria-pressed={locale === code}
          onClick={() => setLocale(code)}
        >
          {t(`lang.${code}`)}
        </button>
      ))}
    </div>
  );
}

export function useCountdown(view: GameView | null) {
  const anchor = useRef({ at: Date.now(), remaining: 0, total: 0, key: 'none' });
  const [, force] = useState(0);
  const key = view
    ? `${view.phase}:${view.day}:${view.phaseEndsAt}:${view.version}`
    : 'none';

  if (view && anchor.current.key !== key) {
    anchor.current = {
      at: Date.now(),
      remaining: Math.max(0, view.phaseEndsAt - view.now),
      total: Math.max(0, view.phaseEndsAt - view.phaseStartedAt),
      key,
    };
  }

  useEffect(() => {
    const id = window.setInterval(() => force((value) => value + 1), 250);
    return () => window.clearInterval(id);
  }, []);

  const remaining = Math.max(0, anchor.current.remaining - (Date.now() - anchor.current.at));
  const total = anchor.current.total;
  return {
    remainingMs: remaining,
    totalMs: total,
    progress: total > 0 ? Math.min(1, Math.max(0, remaining / total)) : 0,
    seconds: Math.ceil(remaining / 1000),
  };
}

export function formatClock(seconds: number): string {
  if (seconds < 60) return `0:${String(Math.max(0, seconds)).padStart(2, '0')}`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}
