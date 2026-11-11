import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import type { QuickMatchMode, RoomListing } from '../net/rooms';
import { isJoinable } from '../net/rooms';
import { ArrowLeftIcon, BanIcon, RefreshIcon, SearchIcon, UsersIcon } from './icons';

export function FindGame({
  rooms,
  status,
  error,
  joinError,
  serviceUrl: initialServiceUrl,
  playerName,
  onRefresh,
  onQuickMatch,
  onJoin,
  onServiceUrl,
  onBack,
}: {
  rooms: RoomListing[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  joinError?: string | null;
  serviceUrl: string;
  playerName: string;
  onRefresh: () => void;
  onQuickMatch: (mode: QuickMatchMode, players: number | undefined) => void;
  onJoin: (code: string) => void;
  onServiceUrl: (url: string) => void;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<QuickMatchMode>('any');
  const [players, setPlayers] = useState<number>(8);
  const [serviceUrl, setServiceUrl] = useState(initialServiceUrl);

  useEffect(() => {
    if (status === 'idle') onRefresh();
  }, [status, onRefresh]);

  return (
    <div className="screen screen--menu">
      <div className="menu__smoke" aria-hidden="true" />
      <div className="menu__cone" aria-hidden="true" />

      <header className="topline">
        <div className="brand">
          <span className="brand__seal" aria-hidden="true">
            <SearchIcon size={26} />
          </span>
          <span className="brand__text">
            BlackTec<span className="brand__sub">Mafia</span>
          </span>
        </div>
      </header>

      <main className="menu__main">
        <section className="panel panel--wide" aria-labelledby="find-title">
          <span className="panel__tick panel__tick--tl" aria-hidden="true" />
          <span className="panel__tick panel__tick--tr" aria-hidden="true" />

          <p className="entry__overline">{t('find.overline')}</p>
          <h2 className="entry__title" id="find-title">
            {t('find.title')}
          </h2>
          <p className="entry__note">{t('find.lead')}</p>

          <div className="quickmatch">
            <div className="quickmatch__controls">
              <label className="field__cell">
                <span className="field__label">{t('find.mode')}</span>
                <select
                  className="field__input"
                  value={mode}
                  onChange={(event) => setMode(event.target.value as QuickMatchMode)}
                >
                  <option value="any">{t('find.modeAny')}</option>
                  <option value="standard">{t('find.modeStandard')}</option>
                  <option value="custom">{t('find.modeCustom')}</option>
                </select>
              </label>
              <label className="field__cell">
                <span className="field__label">{t('find.players')}</span>
                <input
                  className="field__input field__input--num"
                  type="number"
                  min={2}
                  max={24}
                  value={players}
                  onChange={(event) => setPlayers(Math.max(2, Math.min(24, Number(event.target.value) || 2)))}
                />
              </label>
              <button
                type="button"
                className="btn btn--primary"
                disabled={status === 'loading'}
                onClick={() => onQuickMatch(mode, players)}
              >
                <SearchIcon size={16} />
                <span>{t('find.quick')}</span>
              </button>
            </div>
            <p className="quickmatch__hint">{t('find.quickHint')}</p>
          </div>

          <div className="roomlist">
            <div className="roomlist__head">
              <p className="entry__overline">{t('find.list')}</p>
              <button
                type="button"
                className="btn btn--text"
                onClick={onRefresh}
                disabled={status === 'loading'}
              >
                <RefreshIcon size={15} />
                <span>{t('find.refresh')}</span>
              </button>
            </div>

            <div className="serviceurl">
              <label className="field__cell">
                <span className="field__label">{t('find.serviceUrl')}</span>
                <input
                  className="field__input"
                  type="url"
                  value={serviceUrl}
                  placeholder={t('find.serviceUrlPlaceholder')}
                  onChange={(event) => setServiceUrl(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="btn btn--small btn--ghost"
                onClick={() => onServiceUrl(serviceUrl)}
                disabled={status === 'loading'}
              >
                {t('find.serviceUrlApply')}
              </button>
            </div>
            <p className="quickmatch__hint">{t('find.serviceUrlHint')}</p>

            {joinError ? (
              <p className="roomlist__empty roomlist__empty--warn">{t(joinError)}</p>
            ) : null}
            {status === 'loading' && rooms.length === 0 ? (
              <p className="roomlist__empty">{t('find.loading')}</p>
            ) : null}
            {status === 'error' ? (
              <p className="roomlist__empty roomlist__empty--warn">
                {error ? t(error) : t('find.error')}
              </p>
            ) : null}
            {status === 'ready' && rooms.length === 0 ? (
              <p className="roomlist__empty">{t('find.empty')}</p>
            ) : null}

            <ul className="roomlist__items">
              {rooms.map((room) => (
                <li key={room.code} className="roomcard">
                  <div className="roomcard__main">
                    <span className="roomcard__name">{room.name || t('find.untitled')}</span>
                    <span className="roomcard__code">{room.code.toUpperCase()}</span>
                  </div>
                  <div className="roomcard__meta">
                    <span className="roomcard__players">
                      <UsersIcon size={13} />
                      {t('find.playersCount', { n: room.players, max: room.maxPlayers })}
                    </span>
                    <span className={`roomcard__rules roomcard__rules--${room.rules}`}>
                      {room.rules === 'custom' ? t('find.rulesCustom') : t('find.rulesStandard')}
                    </span>
                    {room.hasPassword ? (
                      <span className="roomcard__locked">
                        <BanIcon size={13} />
                        {t('find.locked')}
                      </span>
                    ) : null}
                    <span className={`roomcard__status roomcard__status--${room.status}`}>
                      {t(`find.status.${room.status}`)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn--ghost btn--small"
                    disabled={!isJoinable(room)}
                    onClick={() => onJoin(room.code)}
                  >
                    {t('find.join')}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="entry__row">
            <button type="button" className="btn btn--ghost" onClick={onBack}>
              <ArrowLeftIcon size={16} />
              <span>{t('setup.back')}</span>
            </button>
            <p className="entry__hint">{t('find.as', { name: playerName || t('menu.namePlaceholder') })}</p>
          </div>
        </section>
      </main>
    </div>
  );
}
