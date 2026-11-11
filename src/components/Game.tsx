import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { Action } from '../game/types';
import type { GameView, ViewPlayer } from '../game/view';
import { logText, roleName, useI18n, type Translate } from '../i18n';
import { formatClock, LanguageToggle, monogram, useCountdown } from './ui';
import {
  BanIcon,
  CheckIcon,
  DaggerIcon,
  ExitIcon,
  MicIcon,
  MicOffIcon,
  MoonIcon,
  SealIcon,
  SkullIcon,
  SpeakerOffIcon,
  phaseIcon,
  roleIcon,
} from './icons';
import { LogPanel } from './LogPanel';
import { RoleCard } from './RoleCard';

const NIGHT_ROLES = ['mafia', 'doctor', 'detective', 'sheriff', 'maniac'] as const;
type NightRole = (typeof NIGHT_ROLES)[number];

function isNightRole(role: string | undefined): role is NightRole {
  return role !== undefined && (NIGHT_ROLES as readonly string[]).includes(role);
}

function nightAction(role: NightRole, targetId: string): Action {
  switch (role) {
    case 'mafia':
      return { type: 'kill', targetId };
    case 'doctor':
      return { type: 'heal', targetId };
    case 'detective':
      return { type: 'investigate', targetId };
    case 'sheriff':
      return { type: 'sheriffCheck', targetId };
    case 'maniac':
      return { type: 'maniacKill', targetId };
  }
}

function dayLabel(t: Translate, view: GameView): string {
  if (view.phase === 'lobby') return '';
  if (view.phase === 'night') return t('table.night', { n: view.day });
  return t('table.day', { n: view.day });
}

export function Game({
  view,
  code,
  isHost,
  onAction,
  onLeave,
  voice,
  onVoice,
}: {
  view: GameView;
  code: string | null;
  isHost: boolean;
  onAction: (action: Action) => void;
  onLeave: () => void;
  voice?: {
    publishing: boolean;
    muted: boolean;
    error: string | null;
    speaking: Record<string, boolean>;
  };
  onVoice?: (action: 'toggle' | 'mute' | 'unmute') => void;
}) {
  const { t } = useI18n();
  const { seconds, progress } = useCountdown(view);
  const [target, setTarget] = useState<string | null>(null);

  const me = view.me;
  const myPlayer = view.players.find((player) => player.isMe) ?? null;
  const meAlive = me?.alive ?? false;
  const nightRole = me && isNightRole(me.role) ? me.role : null;
  const canChooseNight = meAlive && view.phase === 'night' && nightRole !== null;
  const hasVoted = myPlayer?.hasVoted ?? false;
  const canChooseVote = meAlive && view.phase === 'voting' && !hasVoted;

  useEffect(() => {
    setTarget(null);
  }, [view.phase, view.day]);

  const targets = new Set<string>();
  if (canChooseNight && nightRole) {
    for (const player of view.players) {
      if (!player.alive) continue;
      if (nightRole !== 'doctor' && player.isMe) continue;
      if (nightRole === 'mafia' && (player.isMe || player.isTeammate)) continue;
      targets.add(player.id);
    }
  }
  if (canChooseVote) {
    for (const player of view.players) {
      if (player.alive && !player.isMe) targets.add(player.id);
    }
  }

  const targetPlayer = target ? view.players.find((player) => player.id === target) ?? null : null;
  const chosen = view.myTarget;

  const confirm = () => {
    if (!target) return;
    if (view.phase === 'night' && nightRole) {
      onAction(nightAction(nightRole, target));
      setTarget(null);
      return;
    }
    if (view.phase === 'voting') {
      onAction({ type: 'vote', targetId: target });
      setTarget(null);
    }
  };

  const chatEnabled =
    view.phase !== 'lobby' &&
    view.phase !== 'gameover' &&
    !(view.phase === 'night' && me?.role !== 'mafia');
  const chatPlaceholder =
    view.phase === 'night'
      ? t('table.chatNight')
      : !meAlive
        ? t('table.chatDead')
        : t('table.chatPlaceholder');

  const family =
    me?.role === 'mafia'
      ? view.players.filter((player) => player.isMe || player.isTeammate)
      : [];

  let centerBody: ReactNode = null;
  if (view.phase === 'night') {
    if (!meAlive) {
      centerBody = <p className="center__note">{t('table.spectator')}</p>;
    } else if (!nightRole) {
      centerBody = (
        <>
          <p className="center__note">{t('table.sleep')}</p>
          <p className="center__sub">{t('table.sleepHint')}</p>
        </>
      );
    } else if (targetPlayer) {
      centerBody = (
        <>
          <p className="center__target">{t('table.target', { name: targetPlayer.name })}</p>
          <div className="center__buttons">
            <button type="button" className="btn btn--primary btn--small" onClick={confirm}>
              {t('table.confirmNight')}
            </button>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setTarget(null)}>
              {t('table.cancel')}
            </button>
          </div>
          <p className="center__sub">{t('table.nightConfirmHint')}</p>
        </>
      );
    } else if (chosen) {
      centerBody = (
        <>
          <p className="center__target center__target--done">
            <CheckIcon size={15} />
            {t('table.chosen')}
          </p>
          {view.nightLocked ? (
            <p className="center__sub">{t('table.nightLocked')}</p>
          ) : (
            <p className="center__sub">{t('table.nightChangeHint')}</p>
          )}
        </>
      );
    } else {
      centerBody = (
        <>
          <p className="center__note">{t(`role.${nightRole}.ability`)}</p>
          <p className="center__sub">{t('table.chooseTarget')}</p>
        </>
      );
    }
  } else if (view.phase === 'voting') {
    if (!meAlive) {
      centerBody = <p className="center__note">{t('table.spectator')}</p>;
    } else if (hasVoted) {
      const voteName = myPlayer?.votedFor
        ? view.players.find((player) => player.id === myPlayer.votedFor)?.name
        : null;
      centerBody = (
        <>
          <p className="center__target center__target--done">
            <CheckIcon size={15} />
            {voteName ? t('table.yourVote', { name: voteName }) : t('table.abstain')}
          </p>
          <p className="center__sub">{t('table.waitOthers')}</p>
        </>
      );
    } else if (targetPlayer) {
      centerBody = (
        <>
          <p className="center__target">{t('table.target', { name: targetPlayer.name })}</p>
          <div className="center__buttons">
            <button type="button" className="btn btn--primary btn--small" onClick={confirm}>
              {t('table.vote')}
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => onAction({ type: 'vote', targetId: null })}
            >
              {t('table.abstain')}
            </button>
          </div>
          <p className="center__sub">{t('rules.voteRuleShort')}</p>
        </>
      );
    } else {
      centerBody = (
        <>
          <p className="center__note">{t('table.chooseTarget')}</p>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => onAction({ type: 'vote', targetId: null })}
          >
            {t('table.abstain')}
          </button>
        </>
      );
    }
  } else if (view.phase === 'dawn') {
    centerBody = (
      <>
        <NightReport view={view} />
        {isHost && view.settings.manualPhases ? (
          <button type="button" className="btn btn--ghost btn--small" onClick={() => onAction({ type: 'advance' })}>
            {t('table.next')}
          </button>
        ) : null}
      </>
    );
  } else if (view.phase === 'discussion') {
    if (!meAlive) {
      centerBody = <p className="center__note">{t('table.spectator')}</p>;
    } else if (myPlayer?.ready) {
      centerBody = <p className="center__note">{t('table.readyWaiting')}</p>;
    } else {
      centerBody = (
        <>
          <button type="button" className="btn btn--primary btn--small" onClick={() => onAction({ type: 'ready' })}>
            {t('table.ready')}
          </button>
          <p className="center__sub">{t('table.readyHint')}</p>
        </>
      );
    }
  } else if (view.phase === 'execution') {
    centerBody = (
      <>
        <VoteReport view={view} />
        {isHost && view.settings.manualPhases ? (
          <button type="button" className="btn btn--ghost btn--small" onClick={() => onAction({ type: 'advance' })}>
            {t('table.next')}
          </button>
        ) : null}
      </>
    );
  }

  return (
    <div className="screen screen--game">
      <header className="gamebar">
        <div className="gamebar__left">
          <span className="brand__seal brand__seal--tiny" aria-hidden="true">
            <SealIcon size={18} />
          </span>
          <span className="gamebar__brand">BlackTec Mafia</span>
          {code ? <span className="gamebar__room">{code.toUpperCase()}</span> : null}
        </div>
        <div className="gamebar__center">
          <span className={`phasepill phasepill--${view.phase}`}>
            {phaseIcon(view.phase, { size: 14 })}
            {t(`phase.${view.phase}`)}
          </span>
          <span className="gamebar__day">{dayLabel(t, view)}</span>
          {view.settings.manualPhases ? (
            <span className="gamebar__manual">{t('table.manualPhases')}</span>
          ) : null}
        </div>
        <div className="gamebar__right">
          <span className="gamebar__alive">
            {t('table.alive', { n: view.players.filter((player) => player.alive).length })}
          </span>
          {voice && onVoice ? (
            <button
              type="button"
              className={`btn btn--text btn--icon ${voice.publishing ? 'is-live' : ''}`}
              onClick={() => onVoice('toggle')}
              aria-pressed={voice.publishing}
              aria-label={voice.publishing ? t('voice.stop') : t('voice.start')}
            >
              {voice.publishing ? <MicIcon size={17} /> : <MicOffIcon size={17} />}
              <span className="gamebar__leave">{voice.publishing ? t('voice.on') : t('voice.off')}</span>
            </button>
          ) : null}
          <LanguageToggle compact />
          <button type="button" className="btn btn--text btn--icon" onClick={onLeave} aria-label={t('aria.leave')}>
            <ExitIcon size={18} />
            <span className="gamebar__leave">{t('table.leave')}</span>
          </button>
        </div>
      </header>

      <main className="game">
        <section className="tablewrap" aria-label={t('phase.' + view.phase)}>
          <div className="table">
            <div className="table__felt" aria-hidden="true" />
            <div className="table__rim" aria-hidden="true" />

            {view.players.map((player) => {
              const angle = Math.PI / 2 + (player.seat / Math.max(1, view.players.length)) * Math.PI * 2;
              const x = 50 + Math.cos(angle) * 43;
              const y = 50 + Math.sin(angle) * 41;
              const selectable = targets.has(player.id);
              const selected = target === player.id;
              return (
                <Seat
                  key={player.id}
                  player={player}
                  selectable={selectable}
                  selected={selected}
                  showVotes={view.phase === 'voting' || view.phase === 'execution'}
                  t={t}
                  style={{ left: `${x}%`, top: `${y}%` }}
                  onClick={() => {
                    if (selectable) setTarget(player.id);
                  }}
                />
              );
            })}

          </div>

          <div className={`table__center center--${view.phase}`}>
            <div className="center__head">
              <span className="center__icon" aria-hidden="true">
                {view.phase === 'night' ? <MoonIcon size={18} /> : phaseIcon(view.phase, { size: 18 })}
              </span>
              <span className="center__phase">{t(`phase.${view.phase}`)}</span>
            </div>
            <p className="center__day">{dayLabel(t, view)}</p>

            {view.phase !== 'gameover' && view.phase !== 'lobby' ? (
              <div
                className="clock"
                style={{ '--progress': `${Math.round(progress * 360)}deg` } as CSSProperties}
                aria-label={`${t('table.phaseHint')} ${formatClock(seconds)}`}
              >
                <span className="clock__time">{formatClock(seconds)}</span>
              </div>
            ) : null}

            <p className="center__hint">{t(`phase.${view.phase}.hint`)}</p>
            <div className="center__body">{centerBody}</div>
          </div>

          {view.phase === 'gameover' ? (
            <GameOver view={view} isHost={isHost} onAction={onAction} onLeave={onLeave} />
          ) : null}
        </section>

        <aside className="side">
          <RoleCard view={view} />

          {voice && onVoice ? <VoicePanel view={view} voice={voice} onVoice={onVoice} /> : null}

          {family.length > 0 ? (
            <section className="familypanel">
              <p className="side__label">
                <SealIcon size={13} />
                {t('table.family')}
              </p>
              <ul>
                {family.map((player) => {
                  const pick = view.mafiaVotes?.[player.id];
                  const pickName = pick ? view.players.find((item) => item.id === pick)?.name : null;
                  return (
                    <li key={player.id}>
                      <span className={player.isMe ? 'is-me' : ''}>{player.name}</span>
                      <span className="familypanel__pick">{pickName ?? '—'}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <LogPanel
            view={view}
            chatEnabled={chatEnabled}
            chatPlaceholder={chatPlaceholder}
            onAction={onAction}
          />

          <KickPanel view={view} onAction={onAction} />
        </aside>
      </main>
    </div>
  );
}

function VoicePanel({
  view,
  voice,
  onVoice,
}: {
  view: GameView;
  voice: { publishing: boolean; muted: boolean; error: string | null; speaking: Record<string, boolean> };
  onVoice: (action: 'toggle' | 'mute' | 'unmute') => void;
}) {
  const { t } = useI18n();
  if (!view.settings.voiceEnabled) return null;
  const speakers = view.players.filter((player) => voice.speaking[player.id]);
  const canTalk =
    view.phase === 'discussion' ||
    (view.phase === 'night' && view.me?.role === 'mafia');

  return (
    <section className="voicepanel">
      <p className="side__label">
        <MicIcon size={13} />
        {t('voice.title')}
      </p>
      <div className="voicepanel__buttons">
        <button
          type="button"
          className={`btn btn--small ${voice.publishing ? 'btn--ghost' : 'btn--primary'}`}
          onClick={() => onVoice('toggle')}
        >
          {voice.publishing ? <MicOffIcon size={15} /> : <MicIcon size={15} />}
          <span>{voice.publishing ? t('voice.stop') : t('voice.start')}</span>
        </button>
        <button
          type="button"
          className="btn btn--small btn--ghost"
          onClick={() => onVoice(voice.muted ? 'unmute' : 'mute')}
          disabled={!voice.publishing}
        >
          {voice.muted ? <SpeakerOffIcon size={15} /> : <MicIcon size={15} />}
          <span>{voice.muted ? t('voice.unmute') : t('voice.mute')}</span>
        </button>
      </div>
      {!canTalk ? <p className="voicepanel__hint">{t('voice.closed')}</p> : null}
      {voice.error ? <p className="voicepanel__hint voicepanel__hint--warn">{t(voice.error)}</p> : null}
      {speakers.length > 0 ? (
        <p className="voicepanel__speaking">
          {t('voice.speaking', { names: speakers.map((player) => player.name).join(', ') })}
        </p>
      ) : null}
      <p className="voicepanel__warn">{t('voice.warning')}</p>
    </section>
  );
}

function KickPanel({ view, onAction }: { view: GameView; onAction: (action: Action) => void }) {
  const { t } = useI18n();
  const kick = view.kickVote;
  const candidates = view.players.filter((player) => !player.isBot && !player.isMe);
  if (view.phase === 'gameover') return null;

  return (
    <section className="kickpanel">
      <p className="side__label">
        <BanIcon size={13} />
        {t('lobby.kickTitleShort')}
      </p>
      {kick ? (
        <>
          <p className="kickpanel__title">
            {t('lobby.kickTitle', { name: view.players.find((p) => p.id === kick.targetId)?.name ?? '—' })}
          </p>
          <p className="kickpanel__meta">
            {t('lobby.kickMeta', {
              yes: Object.values(kick.votes).filter((choice) => choice === 'yes').length,
              no: Object.values(kick.votes).filter((choice) => choice === 'no').length,
              quorum: kick.quorum,
            })}
          </p>
          <div className="kickpanel__buttons">
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
        </>
      ) : (
        <ul className="kickpanel__list">
          {candidates.map((player) => (
            <li key={player.id}>
              <span className="kickpanel__name">{player.name}</span>
              <button
                type="button"
                className="btn btn--text btn--small"
                onClick={() => onAction({ type: 'kickStart', targetId: player.id })}
              >
                {t('lobby.kickAsk')}
              </button>
            </li>
          ))}
          {candidates.length === 0 ? <li className="kickpanel__empty">{t('lobby.kickNone')}</li> : null}
        </ul>
      )}
    </section>
  );
}

function Seat({
  player,
  selectable,
  selected,
  showVotes,
  style,
  onClick,
  t,
}: {
  player: ViewPlayer;
  selectable: boolean;
  selected: boolean;
  showVotes: boolean;
  style: CSSProperties;
  onClick: () => void;
  t: Translate;
}) {
  const classes = [
    'seat',
    player.alive ? 'seat--alive' : 'seat--dead',
    player.isMe ? 'seat--me' : '',
    player.isTeammate ? 'seat--teammate' : '',
    selectable ? 'seat--targetable' : '',
    selected ? 'seat--selected' : '',
    !player.connected ? 'seat--offline' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={classes}
      style={style}
      disabled={!selectable}
      onClick={onClick}
      aria-label={`${t('aria.seat', { name: player.name, n: player.seat + 1 })}${
        selectable ? `. ${t('aria.target', { name: player.name })}` : ''
      }`}
      aria-pressed={selected}
    >
      <span className="seat__avatar">
        <span className="seat__mono">{monogram(player.name)}</span>
        {!player.alive ? (
          <span className="seat__cross" aria-hidden="true">
            <SkullIcon size={14} />
          </span>
        ) : null}
        {player.alive && player.roleVisible && player.role ? (
          <span className={`seat__roleicon seat__roleicon--${player.role}`} aria-hidden="true">
            {roleIcon(player.role, { size: 11 })}
          </span>
        ) : null}
      </span>
      <span className="seat__name">{player.name}</span>
      {player.roleVisible && player.role ? (
        <span className="seat__role">{roleName(t, player.role)}</span>
      ) : null}
      {player.isMe ? <span className="seat__you">{t('table.you')}</span> : null}
      {showVotes && player.votes > 0 ? <span className="seat__votes">{player.votes}</span> : null}
      {showVotes && player.hasVoted ? (
        <span className="seat__voted" aria-hidden="true">
          <CheckIcon size={10} />
        </span>
      ) : null}
    </button>
  );
}

function NightReport({ view }: { view: GameView }) {
  const { t } = useI18n();
  const night = view.lastNight;
  return (
    <div className="report">
      <p className="report__title">{t('report.nightTitle')}</p>
      {night && night.deaths.length > 0 ? (
        <ul className="report__list">
          {night.deaths.map((death) => {
            const player = view.players.find((item) => item.id === death.id);
            return (
              <li key={death.id}>
                <span className="report__name">
                  <DaggerIcon size={13} />
                  {player?.name ?? '—'}
                </span>
                <span className="report__role">{roleName(t, death.role)}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="report__empty">{t('report.noDeaths')}</p>
      )}
    </div>
  );
}

function VoteReport({ view }: { view: GameView }) {
  const { t } = useI18n();
  const vote = view.lastVote;
  const executed = vote?.executedId
    ? view.players.find((player) => player.id === vote.executedId)
    : null;
  return (
    <div className="report">
      <p className="report__title">{t('report.voteTitle')}</p>
      {executed ? (
        <p className="report__executed">
          {t('report.executed', { name: executed.name })}
          {executed.role ? <span className="report__role">{roleName(t, executed.role)}</span> : null}
        </p>
      ) : (
        <p className="report__empty">{t('report.noExecution')}</p>
      )}
      {vote && vote.abstains > 0 ? (
        <p className="report__abstains">{t('report.abstains', { n: vote.abstains })}</p>
      ) : null}
    </div>
  );
}

function GameOver({
  view,
  isHost,
  onAction,
  onLeave,
}: {
  view: GameView;
  isHost: boolean;
  onAction: (action: Action) => void;
  onLeave: () => void;
}) {
  const { t } = useI18n();
  const winner = view.winner ?? 'city';
  const me = view.me;
  const faction = !me ? 'city' : me.role === 'mafia' ? 'mafia' : me.role === 'maniac' ? 'maniac' : 'city';
  const verdict = faction === winner ? 'gameover.youWon' : 'gameover.youLost';

  return (
    <div className={`gameover gameover--${winner}`}>
      <div className="gameover__inner">
        <p className="gameover__eyebrow">
          <SkullIcon size={16} />
          {t('phase.gameover')}
        </p>
        <h2 className="gameover__title">{t(`gameover.win.${winner}`)}</h2>
        <p className={`gameover__verdict ${faction === winner ? 'is-win' : 'is-loss'}`}>
          {t(verdict)}
        </p>
        {view.winReason ? (
          <p className="gameover__reason">{logText(t, view.winReason)}</p>
        ) : null}

        <p className="gameover__label">{t('gameover.reveal')}</p>
        <ul className="reveal">
          {[...view.players]
            .sort((a, b) => a.seat - b.seat)
            .map((player) => (
              <li key={player.id} className={`reveal__row ${player.isMe ? 'is-me' : ''} ${player.alive ? '' : 'is-dead'}`}>
                <span className="reveal__mono">{monogram(player.name)}</span>
                <span className="reveal__name">{player.name}</span>
                <span className={`reveal__role reveal__role--${player.role ?? 'citizen'}`}>
                  {player.role ? roleName(t, player.role) : t('table.roleHidden')}
                  {player.alive ? null : <span className="reveal__dead">{t('table.dead')}</span>}
                </span>
              </li>
            ))}
        </ul>

        <div className="gameover__actions">
          {isHost ? (
            <button type="button" className="btn btn--primary" onClick={() => onAction({ type: 'restart' })}>
              {t('gameover.again')}
            </button>
          ) : (
            <p className="gameover__wait">{t('gameover.waitHost')}</p>
          )}
          <button type="button" className="btn btn--ghost" onClick={onLeave}>
            {t('gameover.menu')}
          </button>
        </div>
      </div>
    </div>
  );
}
