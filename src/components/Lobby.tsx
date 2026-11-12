import { useState } from 'react';
import { compositionCounts, compositionTotal, standardComposition } from '../game/roles';
import type { Action, RoleComposition, RoomSettings } from '../game/types';
import type { GameView } from '../game/view';
import { roleName, useI18n } from '../i18n';
import { inviteLink, inviteLinkIsLocal } from '../net/code';
import { CopyButton, monogram } from './ui';
import { ArrowRightIcon, BanIcon, ExitIcon, SealIcon, UsersIcon } from './icons';
import { LanguageToggle } from './ui';
import { RoleEditor } from './RoleEditor';

const ROLE_ORDER = ['mafia', 'doctor', 'detective', 'sheriff', 'maniac', 'citizen'] as const;

export function Lobby({
  view,
  code,
  isHost,
  onAction,
  onLeave,
  onSetPassword,
}: {
  view: GameView;
  code: string | null;
  isHost: boolean;
  onAction: (action: Action) => void;
  onLeave: () => void;
  onSetPassword: (password: string | null) => void;
}) {
  const { t } = useI18n();
  const [password, setPassword] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const count = view.players.length;
  const settings = view.settings;
  const composition = settings.roleSet === 'custom' ? settings.composition : standardComposition(Math.max(6, Math.min(12, count || 6)));
  const roleSummary = compositionCounts(composition);  const total = compositionTotal(composition);
  const link = code ? inviteLink(code) : '';
  const humans = view.players.filter((player) => !player.isBot);
  const allReady = humans.length > 0 && humans.every((player) => player.lobbyReady);
  const seatsMatch = settings.roleSet === 'custom' ? count === total || (settings.allowIncomplete && count < total) : count >= view.minPlayers;
  const canStart = allReady && seatsMatch && count >= view.minPlayers;
  const kick = view.kickVote;

  const patchSettings = (patch: Partial<RoomSettings>) => {
    onAction({ type: 'updateSettings', patch });
  };

  return (
    <div className="screen screen--lobby">
      <header className="topline topline--condensed">
        <div className="brand brand--small">
          <span className="brand__seal" aria-hidden="true">
            <SealIcon size={22} />
          </span>
          <span className="brand__text">
            BlackTec<span className="brand__sub">Mafia</span>
          </span>
        </div>
        <div className="topline__actions">
          <LanguageToggle compact />
          <button type="button" className="btn btn--text" onClick={onLeave}>
            <ExitIcon size={16} />
            <span>{t('lobby.leave')}</span>
          </button>
        </div>
      </header>

      <main className="lobby">
        <section className="lobby__main">
          <p className="kicker">
            <span className="kicker__rule" aria-hidden="true" />
            {t('lobby.title')}
          </p>
          <h1 className="lobby__title">
            {settings.name || t('lobby.room')}
            {code ? <span className="lobby__code">{code.toUpperCase()}</span> : <span className="lobby__code lobby__code--wait" />}
          </h1>
          <p className="lobby__lead">{t('lobby.shareHint')}</p>

          {code ? (
            <div className="invite">
              <span className="invite__icon" aria-hidden="true">
                <UsersIcon size={18} />
              </span>
              <input className="invite__input" value={link} readOnly onFocus={(event) => event.currentTarget.select()} aria-label={t('lobby.invite')} />
              <CopyButton
                text={link}
                label={t('lobby.copy')}
                copiedLabel={t('lobby.copied')}
                className="btn btn--small btn--outline"
              />
            </div>
          ) : (
            <p className="lobby__connecting" role="status">
              <span className="spinner" aria-hidden="true" />
              {t('lobby.connecting')}
            </p>
          )}

          {inviteLinkIsLocal() ? (
            <p className="lobby__warning">{t('lobby.localHint')}</p>
          ) : null}

          <div className="seats">
            <div className="seats__head">
              <span>{t('lobby.players', { n: count })}</span>
              <span className="seats__count">
                {t('lobby.readyCount', { ready: view.readyCount, total: view.readyNeeded })}
              </span>
            </div>
            <ul className="seats__list">
              {view.players.map((player) => (
                <li key={player.id} className="seatrow">
                  <span className="seatrow__num">{String(player.seat + 1).padStart(2, '0')}</span>
                  <span className={`avatar avatar--row ${player.isMe ? 'is-me' : ''}`}>
                    {monogram(player.name)}
                  </span>
                  <span className="seatrow__name">{player.name}</span>
                  <span className="seatrow__tags">
                    {player.isMe ? <span className="tag tag--brass">{t('lobby.you')}</span> : null}
                    {player.isHost ? <span className="tag">{t('lobby.hostTag')}</span> : null}
                    {player.isBot ? (
                      <span className="tag tag--muted">{t('lobby.botTag')} · {t('lobby.botReady')}</span>
                    ) : player.lobbyReady ? (
                      <span className="tag tag--ok">{t('lobby.readyTag')}</span>
                    ) : (
                      <span className="tag tag--warn">{t('lobby.notReadyTag')}</span>
                    )}
                    {!player.connected ? <span className="tag tag--blood">{t('net.closed')}</span> : null}
                  </span>
                  {isHost || !player.isBot ? (
                    <span className="seatrow__actions">
                      {player.isMe ? (
                        <button
                          type="button"
                          className={`btn btn--small ${player.lobbyReady ? 'btn--ghost' : 'btn--primary'}`}
                          onClick={() => onAction({ type: 'lobbyReady', ready: !player.lobbyReady })}
                          disabled={player.isBot}
                        >
                          {player.lobbyReady ? t('lobby.unready') : t('lobby.ready')}
                        </button>
                      ) : null}
                      {!player.isMe && !player.isBot && !kick ? (
                        <button
                          type="button"
                          className="btn btn--text btn--small"
                          onClick={() => onAction({ type: 'kickStart', targetId: player.id })}
                        >
                          <BanIcon size={14} />
                          <span>{t('lobby.kickAsk')}</span>
                        </button>
                      ) : null}
                    </span>
                  ) : null}
                </li>
              ))}
              {count === 0 ? <li className="seats__empty">{t('lobby.empty')}</li> : null}
            </ul>
          </div>

          {kick ? (
            <div className="kickvote" role="status">
              <p className="kickvote__title">
                {t('lobby.kickTitle', { name: view.players.find((p) => p.id === kick.targetId)?.name ?? '—' })}
              </p>
              <p className="kickvote__meta">
                {t('lobby.kickMeta', {
                  yes: Object.values(kick.votes).filter((choice) => choice === 'yes').length,
                  no: Object.values(kick.votes).filter((choice) => choice === 'no').length,
                  quorum: kick.quorum,
                })}
              </p>
              <div className="kickvote__buttons">
                <button
                  type="button"
                  className="btn btn--primary btn--small"
                  onClick={() => onAction({ type: 'kickVote', choice: 'yes' })}
                  disabled={Boolean(kick.votes[view.me?.id ?? ''])}
                >
                  {t('lobby.kickYes')}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  onClick={() => onAction({ type: 'kickVote', choice: 'no' })}
                  disabled={Boolean(kick.votes[view.me?.id ?? ''])}
                >
                  {t('lobby.kickNo')}
                </button>
              </div>
            </div>
          ) : null}

          <div className="lobby__controls">
            {isHost ? (
              <>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => onAction({ type: 'addBot' })}
                  disabled={count >= view.maxPlayers}
                >
                  {t('lobby.addBot')}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => onAction({ type: 'fillBots', target: settings.roleSet === 'custom' ? total : 8 })}
                  disabled={count >= view.maxPlayers}
                >
                  {t('lobby.fill')}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => onAction({ type: 'removeBot' })}
                  disabled={!view.players.some((player) => player.isBot)}
                >
                  {t('lobby.removeBot')}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setShowSettings((value) => !value)}
                  aria-expanded={showSettings}
                >
                  {t('lobby.settings')}
                </button>
              </>
            ) : null}
          </div>

          {showSettings && isHost ? (
            <section className="roomsettings">
              <p className="entry__overline">{t('lobby.settings')}</p>

              <label className="field">
                <span className="field__label">{t('setup.roomName')}</span>
                <input
                  className="field__input"
                  value={settings.name}
                  maxLength={40}
                  onChange={(event) => patchSettings({ name: event.target.value })}
                />
              </label>

              <label className="field">
                <span className="field__label">{t('setup.password')}</span>
                <input
                  className="field__input"
                  type="password"
                  value={password}
                  maxLength={32}
                  autoComplete="new-password"
                  placeholder={settings.hasPassword ? t('lobby.passwordSet') : t('setup.passwordPlaceholder')}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <span className="field__hint">{t('setup.passwordHint')}</span>
              </label>
              <div className="entry__row">
                <button
                  type="button"
                  className="btn btn--small btn--ghost"
                  onClick={() => {
                    onSetPassword(password.trim() ? password.trim() : null);
                    setPassword('');
                  }}
                >
                  {t('lobby.passwordApply')}
                </button>
                {settings.hasPassword ? (
                  <button
                    type="button"
                    className="btn btn--small btn--ghost"
                    onClick={() => {
                      onSetPassword(null);
                      setPassword('');
                    }}
                  >
                    {t('lobby.passwordRemove')}
                  </button>
                ) : null}
              </div>

              <div className="field field--row">
                <label className="field__cell">
                  <span className="field__label">{t('setup.maxPlayers')}</span>
                  <input
                    className="field__input field__input--num"
                    type="number"
                    min={2}
                    max={24}
                    value={settings.maxPlayers}
                    onChange={(event) => patchSettings({ maxPlayers: Number(event.target.value) })}
                  />
                </label>
                <label className="field__cell">
                  <span className="field__label">{t('setup.roleSet')}</span>
                  <select
                    className="field__input"
                    value={settings.roleSet}
                    onChange={(event) =>
                      patchSettings({
                        roleSet: event.target.value === 'custom' ? 'custom' : 'standard',
                        composition:
                          event.target.value === 'custom'
                            ? settings.composition
                            : standardComposition(Math.max(6, Math.min(12, count || 6))),
                      })
                    }
                  >
                    <option value="standard">{t('setup.roleSetStandard')}</option>
                    <option value="custom">{t('setup.roleSetCustom')}</option>
                  </select>
                </label>
              </div>

              <div className="timers">
                <p className="entry__overline">{t('setup.timers')}</p>
                <div className="timers__grid">
                  <TimerField
                    label={t('setup.night')}
                    value={settings.nightSeconds}
                    min={10}
                    max={180}
                    onChange={(value) => patchSettings({ nightSeconds: value })}
                  />
                  <TimerField
                    label={t('setup.discussion')}
                    value={settings.discussionSeconds}
                    min={15}
                    max={300}
                    onChange={(value) => patchSettings({ discussionSeconds: value })}
                  />
                  <TimerField
                    label={t('setup.voting')}
                    value={settings.votingSeconds}
                    min={10}
                    max={180}
                    onChange={(value) => patchSettings({ votingSeconds: value })}
                  />
                  <TimerField
                    label={t('setup.reveal')}
                    value={settings.revealSeconds}
                    min={3}
                    max={30}
                    onChange={(value) => patchSettings({ revealSeconds: value })}
                  />
                </div>
              </div>

              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.manualPhases}
                  onChange={(event) => patchSettings({ manualPhases: event.target.checked })}
                />
                <span>{t('setup.manualPhases')}</span>
              </label>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.openByLink}
                  onChange={(event) => patchSettings({ openByLink: event.target.checked })}
                />
                <span>{t('setup.openByLink')}</span>
              </label>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.fillWithBots}
                  onChange={(event) => patchSettings({ fillWithBots: event.target.checked })}
                />
                <span>{t('setup.fillWithBots')}</span>
              </label>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.voiceEnabled}
                  onChange={(event) => patchSettings({ voiceEnabled: event.target.checked })}
                />
                <span>{t('setup.voice')}</span>
              </label>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.allowIncomplete}
                  onChange={(event) => patchSettings({ allowIncomplete: event.target.checked })}
                />
                <span>{t('setup.allowIncomplete')}</span>
              </label>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.doctorCanRepeatTarget}
                  onChange={(event) => patchSettings({ doctorCanRepeatTarget: event.target.checked })}
                />
                <span>{t('setup.doctorRepeat')}</span>
              </label>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.mafiaBossHides}
                  onChange={(event) => patchSettings({ mafiaBossHides: event.target.checked })}
                />
                <span>{t('setup.bossHides')}</span>
              </label>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.jokerEndsGame}
                  onChange={(event) => patchSettings({ jokerEndsGame: event.target.checked })}
                />
                <span>{t('setup.jokerEnds')}</span>
              </label>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.nightDeathCancelsCheck}
                  onChange={(event) => patchSettings({ nightDeathCancelsCheck: event.target.checked })}
                />
                <span>{t('setup.deathCancels')}</span>
              </label>

              <div className="field field--row">
                <label className="field__cell">
                  <span className="field__label">{t('setup.avengerShots')}</span>
                  <input
                    className="field__input field__input--num"
                    type="number"
                    min={0}
                    max={10}
                    value={settings.avengerShots}
                    onChange={(event) => patchSettings({ avengerShots: Number(event.target.value) })}
                  />
                </label>
                <label className="field__cell">
                  <span className="field__label">{t('setup.mayorReveals')}</span>
                  <input
                    className="field__input field__input--num"
                    type="number"
                    min={0}
                    max={5}
                    value={settings.mayorReveals}
                    onChange={(event) => patchSettings({ mayorReveals: Number(event.target.value) })}
                  />
                </label>
              </div>

              {settings.roleSet === 'custom' ? (
                <>
                  <RoleEditor
                    composition={settings.composition}
                    seats={count}
                    onChange={(next: RoleComposition) => onAction({ type: 'setComposition', composition: next })}
                  />
                  <button
                    type="button"
                    className="btn btn--small btn--ghost"
                    onClick={() => onAction({ type: 'resetComposition' })}
                  >
                    {t('setup.resetRoles')}
                  </button>
                </>
              ) : null}
            </section>
          ) : null}
        </section>

        <aside className="lobby__side">
          <div className="panel panel--flat">
            <p className="entry__overline">{t('menu.roles')}</p>
            <h2 className="lobby__subtitle">{t('lobby.composition')}</h2>
            <ul className="composition">
              {ROLE_ORDER.filter((role) => (roleSummary[role] ?? 0) > 0).map((role) => (
                <li key={role} className={`composition__row composition__row--${role}`}>
                  <span className="composition__name">{roleName(t, role)}</span>
                  <span className="composition__dots" aria-hidden="true" />
                  <span className="composition__num">{roleSummary[role]}</span>
                </li>
              ))}
            </ul>
            <div className="panel__rule" />
            <p className="panel__hint">
              {t('lobby.rulesSummary', {
                city: t('rules.cityShort'),
                mafia: t('rules.mafiaShort'),
                maniac: t('rules.maniacShort'),
              })}
            </p>
            <p className="panel__hint panel__hint--warn">
              {t('rules.voteRule')}
            </p>
            {isHost ? (
              <>
                <button
                  type="button"
                  className="btn btn--primary btn--wide"
                  onClick={() => onAction({ type: 'start' })}
                  disabled={!canStart}
                >
                  <span>{t('lobby.start')}</span>
                  <ArrowRightIcon size={18} />
                </button>
                {!allReady ? (
                  <p className="panel__hint">{t('lobby.waitReady', { ready: view.readyCount, total: view.readyNeeded })}</p>
                ) : null}
                {!seatsMatch ? (
                  <p className="panel__hint panel__hint--warn">
                    {settings.roleSet === 'custom'
                      ? t('lobby.needSeats', { total, seats: count })
                      : t('lobby.need', { n: view.minPlayers })}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="panel__hint">{t('lobby.waitingHost')}</p>
            )}
          </div>

          <div className="lobby__note">
            <p>{t('menu.onlineNote')}</p>
          </div>
        </aside>
      </main>
    </div>
  );
}

function TimerField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field__cell">
      <span className="field__label">{label}</span>
      <input
        className="field__input field__input--num"
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          onChange(Math.max(min, Math.min(max, Number.isFinite(next) ? next : min)));
        }}
      />
    </label>
  );
}
