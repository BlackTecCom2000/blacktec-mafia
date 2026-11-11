import { useEffect, useState, type FormEvent } from 'react';
import { roleCounts } from '../game/roles';
import type { Role } from '../game/types';
import { roleName, useI18n } from '../i18n';
import { ArrowLeftIcon, ArrowRightIcon, LinkIcon, SealIcon, SearchIcon } from './icons';
import { LanguageToggle } from './ui';

const COUNT_OPTIONS = [6, 7, 8, 9, 10, 11, 12];

const ROLE_KEYS: Role[] = ['mafia', 'doctor', 'detective', 'maniac', 'citizen'];

export interface MenuProps {
  initialName: string;
  initialCode: string;
  initialMode: 'menu' | 'join';
  busy: boolean;
  error: string | null;
  /** The host asked for a password — the guest has to send it. */
  passwordRequired: boolean;
  onSolo: (name: string, count: number) => void;
  onHost: (name: string) => void;
  onCustomRoom: () => void;
  onFindGame: () => void;
  onJoin: (code: string, name: string, password: string | null) => void;
  onSubmitPassword: (password: string) => void;
  onClearError: () => void;
}

export function Menu({
  initialName,
  initialCode,
  initialMode,
  busy,
  error,
  passwordRequired,
  onSolo,
  onHost,
  onCustomRoom,
  onFindGame,
  onJoin,
  onSubmitPassword,
  onClearError,
}: MenuProps) {
  const { t } = useI18n();
  const [name, setName] = useState(initialName);
  const [count, setCount] = useState(8);
  const [mode, setMode] = useState<'menu' | 'join'>(initialMode);
  const [code, setCode] = useState(initialCode);
  const [password, setPassword] = useState('');

  useEffect(() => {
    try {
      window.localStorage.setItem('btcmafia.name', name);
    } catch {
      /* storage disabled */
    }
  }, [name]);

  useEffect(() => {
    if (initialMode === 'join') {
      setMode('join');
      setCode(initialCode);
    }
  }, [initialCode, initialMode]);

  const counts = roleCounts(count);

  const submitSolo = (event: FormEvent) => {
    event.preventDefault();
    onClearError();
    onSolo(name, count);
  };

  const submitHost = () => {
    onClearError();
    onHost(name);
  };

  const submitJoin = (event: FormEvent) => {
    event.preventDefault();
    if (code.trim().length < 5) return;
    onClearError();
    onJoin(code, name, password.trim() ? password.trim() : null);
  };

  return (
    <div className="screen screen--menu">
      <div className="menu__smoke" aria-hidden="true" />
      <div className="menu__cone" aria-hidden="true" />

      <header className="topline">
        <div className="brand">
          <span className="brand__seal" aria-hidden="true">
            <SealIcon size={26} />
          </span>
          <span className="brand__text">
            BlackTec<span className="brand__sub">Mafia</span>
          </span>
        </div>
        <LanguageToggle />
      </header>

      <main className="menu__main">
        <section className="hero">
          <p className="kicker">
            <span className="kicker__rule" aria-hidden="true" />
            {t('app.est')}
          </p>
          <h1 className="hero__title">
            <span className="hero__brand">BlackTec</span>
            <span className="hero__word">{t('app.title')}</span>
          </h1>
          <p className="hero__sub">{t('app.subtitle')}</p>
          <p className="hero__tagline">{t('app.tagline')}</p>

          <div className="hero__rule" aria-hidden="true" />

          <div className="hero__dossier">
            <p className="hero__label">{t('menu.roles')}</p>
            <ul className="rolechips">
              {ROLE_KEYS.filter((role) => (counts[role] ?? 0) > 0).map((role) => (
                <li key={role} className={`rolechip rolechip--${role}`}>
                  <span className="rolechip__num">{counts[role]}</span>
                  <span className="rolechip__name">{roleName(t, role)}</span>
                </li>
              ))}
            </ul>
          </div>

          <details className="rules">
            <summary>{t('menu.rules')}</summary>
            <ol className="rules__list">
              <li>{t('rules.p1')}</li>
              <li>{t('rules.p2')}</li>
              <li>{t('rules.p3')}</li>
              <li>{t('rules.p4')}</li>
              <li>{t('rules.p5')}</li>
            </ol>
          </details>
        </section>

        <section className="panel" aria-labelledby="entry-title">
          <span className="panel__tick panel__tick--tl" aria-hidden="true" />
          <span className="panel__tick panel__tick--tr" aria-hidden="true" />
          <span className="panel__tick panel__tick--bl" aria-hidden="true" />
          <span className="panel__tick panel__tick--br" aria-hidden="true" />

          {mode === 'menu' ? (
            <form className="entry" onSubmit={submitSolo}>
              <p className="entry__overline">{t('app.subtitle')}</p>
              <h2 className="entry__title" id="entry-title">
                {t('menu.solo')}
              </h2>

              <label className="field">
                <span className="field__label">{t('menu.name')}</span>
                <input
                  className="field__input"
                  value={name}
                  maxLength={18}
                  autoComplete="nickname"
                  placeholder={t('menu.namePlaceholder')}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>

              <div className="field">
                <span className="field__label">{t('menu.players')}</span>
                <div className="counter" role="group" aria-label={t('menu.players')}>
                  {COUNT_OPTIONS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={value === count ? 'counter__btn is-active' : 'counter__btn'}
                      aria-pressed={value === count}
                      onClick={() => setCount(value)}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              <p className="entry__note">{t('menu.soloHint')}</p>

              <button type="submit" className="btn btn--primary btn--wide" disabled={busy}>
                <span>{busy ? t('lobby.connecting') : t('menu.solo')}</span>
                {busy ? null : <ArrowRightIcon size={18} />}
              </button>

              <div className="entry__divider" aria-hidden="true">
                <span />
                <em>{t('common.or')}</em>
                <span />
              </div>

              <div className="entry__row">
                <button type="button" className="btn btn--ghost" onClick={submitHost} disabled={busy}>
                  <span>{t('menu.host')}</span>
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    onClearError();
                    setMode('join');
                  }}
                  disabled={busy}
                >
                  <LinkIcon size={16} />
                  <span>{t('menu.join')}</span>
                </button>
              </div>

              <div className="entry__row">
                <button type="button" className="btn btn--ghost" onClick={onCustomRoom} disabled={busy}>
                  <SealIcon size={16} />
                  <span>{t('menu.custom')}</span>
                </button>
                <button type="button" className="btn btn--ghost" onClick={onFindGame} disabled={busy}>
                  <SearchIcon size={16} />
                  <span>{t('menu.find')}</span>
                </button>
              </div>

              <p className="entry__hint">{t('menu.hostHint')}</p>

              {error ? (
                <p className="alert" role="alert">
                  {t(error)}
                </p>
              ) : null}
            </form>
          ) : (
            <form className="entry" onSubmit={submitJoin}>
              <button
                type="button"
                className="btn btn--text entry__back"
                onClick={() => {
                  onClearError();
                  setMode('menu');
                }}
              >
                <ArrowLeftIcon size={16} />
                <span>{t('join.back')}</span>
              </button>

              <p className="entry__overline">{t('menu.join')}</p>
              <h2 className="entry__title">{t('join.title')}</h2>
              <p className="entry__note">{t('join.lead')}</p>

              <label className="field">
                <span className="field__label">{t('join.code')}</span>
                <input
                  className="field__input field__input--code"
                  value={code}
                  maxLength={8}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder={t('join.codePlaceholder')}
                  onChange={(event) => setCode(event.target.value.toLowerCase())}
                />
                <span className="field__hint">{t('lobby.codeHint')}</span>
              </label>

              <label className="field">
                <span className="field__label">{t('menu.name')}</span>
                <input
                  className="field__input"
                  value={name}
                  maxLength={18}
                  autoComplete="nickname"
                  placeholder={t('menu.namePlaceholder')}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>

              {passwordRequired ? (
                <div className="passwordbox">
                  <label className="field">
                    <span className="field__label">{t('join.password')}</span>
                    <input
                      className="field__input"
                      type="password"
                      value={password}
                      maxLength={32}
                      autoComplete="current-password"
                      placeholder={t('join.passwordPlaceholder')}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                    <span className="field__hint">{t('join.passwordHint')}</span>
                  </label>
                  <button
                    type="button"
                    className="btn btn--primary btn--wide"
                    disabled={busy || !password.trim()}
                    onClick={() => onSubmitPassword(password.trim())}
                  >
                    <span>{t('join.passwordSubmit')}</span>
                    <ArrowRightIcon size={18} />
                  </button>
                </div>
              ) : null}

              <button
                type="submit"
                className="btn btn--primary btn--wide"
                disabled={busy || code.trim().length < 5}
              >
                <span>{busy ? t('net.connecting') : t('join.submit')}</span>
                {busy ? null : <ArrowRightIcon size={18} />}
              </button>

              {error ? (
                <p className="alert" role="alert">
                  {t(error)}
                </p>
              ) : null}
            </form>
          )}
        </section>
      </main>

      <footer className="footer">
        <span>{t('app.footer')}</span>
        <span className="footer__dot" aria-hidden="true" />
        <span>{t('menu.onlineNote')}</span>
      </footer>
    </div>
  );
}
