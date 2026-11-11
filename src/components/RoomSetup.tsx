import { useMemo, useState } from 'react';
import { useI18n } from '../i18n';
import {
  DEFAULT_ROOM_SETTINGS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  TECHNICAL_MAX_PLAYERS,
  type RoleComposition,
  type RoomSettings,
} from '../game/types';
import { compositionTotal, standardComposition } from '../game/roles';
import { RoleEditor } from './RoleEditor';
import { ArrowLeftIcon, ArrowRightIcon, SealIcon } from './icons';

export interface RoomSetupValues {
  settings: RoomSettings;
  password: string | null;
}

export function RoomSetup({
  playerName,
  onCancel,
  onCreate,
}: {
  playerName: string;
  onCancel: () => void;
  onCreate: (values: RoomSetupValues) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [usePassword, setUsePassword] = useState(false);
  const [settings, setSettings] = useState<RoomSettings>(() => ({
    ...DEFAULT_ROOM_SETTINGS,
    custom: true,
    name: '',
    maxPlayers: 10,
    roleSet: 'custom',
    composition: standardComposition(8),
  }));

  const patch = (next: Partial<RoomSettings>) => setSettings((prev) => ({ ...prev, ...next }));

  const total = useMemo(
    () => (settings.roleSet === 'custom' ? compositionTotal(settings.composition) : 0),
    [settings.roleSet, settings.composition],
  );

  const seats = Math.min(settings.maxPlayers, settings.roleSet === 'custom' ? total : settings.maxPlayers);
  const valid =
    (settings.roleSet === 'standard' || total >= 2) &&
    (settings.roleSet === 'custom' ? total <= TECHNICAL_MAX_PLAYERS : true);

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
      </header>

      <main className="menu__main">
        <section className="panel panel--wide" aria-labelledby="setup-title">
          <span className="panel__tick panel__tick--tl" aria-hidden="true" />
          <span className="panel__tick panel__tick--tr" aria-hidden="true" />

          <p className="entry__overline">{t('setup.overline')}</p>
          <h2 className="entry__title" id="setup-title">
            {t('setup.title')}
          </h2>
          <p className="entry__note">{t('setup.lead')}</p>

          <label className="field">
            <span className="field__label">{t('setup.roomName')}</span>
            <input
              className="field__input"
              value={name}
              maxLength={40}
              placeholder={t('setup.roomNamePlaceholder')}
              onChange={(event) => setName(event.target.value)}
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
              placeholder={t('setup.passwordPlaceholder')}
              onChange={(event) => setPassword(event.target.value)}
              disabled={!usePassword}
            />
            <span className="field__hint">{t('setup.passwordHint')}</span>
          </label>

          <label className="switch">
            <input
              type="checkbox"
              checked={usePassword}
              onChange={(event) => setUsePassword(event.target.checked)}
            />
            <span>{t('setup.usePassword')}</span>
          </label>

          <div className="field field--row">
            <label className="field__cell">
              <span className="field__label">{t('setup.maxPlayers')}</span>
              <input
                className="field__input field__input--num"
                type="number"
                min={2}
                max={TECHNICAL_MAX_PLAYERS}
                value={settings.maxPlayers}
                onChange={(event) => patch({ maxPlayers: Number(event.target.value) })}
              />
              <span className="field__hint">{t('setup.maxPlayersHint', { max: TECHNICAL_MAX_PLAYERS })}</span>
            </label>
            <label className="field__cell">
              <span className="field__label">{t('setup.roleSet')}</span>
              <select
                className="field__input"
                value={settings.roleSet}
                onChange={(event) =>
                  patch({
                    roleSet: event.target.value === 'custom' ? 'custom' : 'standard',
                    composition:
                      event.target.value === 'custom'
                        ? settings.composition
                        : standardComposition(Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, settings.maxPlayers))),
                  })
                }
              >
                <option value="standard">{t('setup.roleSetStandard')}</option>
                <option value="custom">{t('setup.roleSetCustom')}</option>
              </select>
              <span className="field__hint">{t('setup.roleSetHint')}</span>
            </label>
          </div>

          {settings.roleSet === 'custom' ? (
            <>
              <RoleEditor
                composition={settings.composition}
                seats={seats}
                onChange={(composition: RoleComposition) => patch({ composition })}
              />
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.allowIncomplete}
                  onChange={(event) => patch({ allowIncomplete: event.target.checked })}
                />
                <span>{t('setup.allowIncomplete')}</span>
              </label>
              <p className="field__hint">{t('setup.allowIncompleteHint')}</p>
            </>
          ) : null}

          <div className="timers">
            <p className="entry__overline">{t('setup.timers')}</p>
            <div className="timers__grid">
              <TimerField
                label={t('setup.night')}
                value={settings.nightSeconds}
                min={10}
                max={180}
                onChange={(value) => patch({ nightSeconds: value })}
              />
              <TimerField
                label={t('setup.discussion')}
                value={settings.discussionSeconds}
                min={15}
                max={300}
                onChange={(value) => patch({ discussionSeconds: value })}
              />
              <TimerField
                label={t('setup.voting')}
                value={settings.votingSeconds}
                min={10}
                max={180}
                onChange={(value) => patch({ votingSeconds: value })}
              />
              <TimerField
                label={t('setup.reveal')}
                value={settings.revealSeconds}
                min={3}
                max={30}
                onChange={(value) => patch({ revealSeconds: value })}
              />
            </div>
          </div>

          <div className="field field--row">
            <label className="field__cell">
              <span className="field__label">{t('setup.maniacRule')}</span>
              <select
                className="field__input"
                value={settings.maniacWinRule}
                onChange={(event) =>
                  patch({ maniacWinRule: event.target.value === 'faction' ? 'faction' : 'alone' })
                }
              >
                <option value="alone">{t('setup.maniacRuleAlone')}</option>
                <option value="faction">{t('setup.maniacRuleFaction')}</option>
              </select>
              <span className="field__hint">{t('setup.maniacRuleHint')}</span>
            </label>
            <div className="field__cell field__cell--stack">
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.manualPhases}
                  onChange={(event) => patch({ manualPhases: event.target.checked })}
                />
                <span>{t('setup.manualPhases')}</span>
              </label>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.openByLink}
                  onChange={(event) => patch({ openByLink: event.target.checked })}
                />
                <span>{t('setup.openByLink')}</span>
              </label>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.fillWithBots}
                  onChange={(event) => patch({ fillWithBots: event.target.checked })}
                />
                <span>{t('setup.fillWithBots')}</span>
              </label>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.voiceEnabled}
                  onChange={(event) => patch({ voiceEnabled: event.target.checked })}
                />
                <span>{t('setup.voice')}</span>
              </label>
            </div>
          </div>

          <div className="entry__row">
            <button type="button" className="btn btn--ghost" onClick={onCancel}>
              <ArrowLeftIcon size={16} />
              <span>{t('setup.back')}</span>
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={!valid}
              onClick={() =>
                onCreate({
                  settings: {
                    ...settings,
                    name: name.trim(),
                    hasPassword: usePassword && password.trim().length > 0,
                    maxPlayers: Math.max(2, Math.min(TECHNICAL_MAX_PLAYERS, settings.maxPlayers)),
                  },
                  password: usePassword && password.trim() ? password.trim() : null,
                })
              }
            >
              <span>{t('setup.create')}</span>
              <ArrowRightIcon size={18} />
            </button>
          </div>
          <p className="entry__hint">
            {t('setup.as', { name: playerName || t('menu.namePlaceholder') })}
          </p>
        </section>
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
  const { t } = useI18n();
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
      <span className="field__hint">{t('setup.seconds', { n: value })}</span>
    </label>
  );
}
