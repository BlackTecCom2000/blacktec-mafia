import { useMemo, useState } from 'react';
import { useI18n } from '../i18n';
import type { GameView } from '../game/view';
import type { Role } from '../game/types';
import { useAdmin } from './AdminGate';

type Tab = 'overview' | 'rounds' | 'players' | 'events' | 'security';

const TABS: Tab[] = ['overview', 'rounds', 'players', 'events', 'security'];

function formatDuration(ms: number): string {
  if (!ms || ms < 0) return '0:00';
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatClock(timestamp: number): string {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  return date.toLocaleTimeString();
}

export interface AdminDashboardProps {
  view: GameView | null;
  mode: string;
  code: string | null;
  isHost: boolean;
  roomsCount: number;
  discoveryUrl: string;
  voicePublished: boolean;
  voiceMuted: boolean;
  peerId: string | null;
}

export function AdminDashboard({
  view,
  mode,
  code,
  isHost,
  roomsCount,
  discoveryUrl,
  voicePublished,
  voiceMuted,
  peerId,
}: AdminDashboardProps) {
  const { t } = useI18n();
  const { closeDashboard } = useAdmin();
  const [tab, setTab] = useState<Tab>('overview');

  const stats = view?.stats;
  const players = view?.players ?? [];
  const alive = players.filter((player) => player.alive);

  const roleRows = useMemo(() => {
    const counts = new Map<Role, number>();
    for (const player of players) {
      if (!player.role) continue;
      counts.set(player.role, (counts.get(player.role) ?? 0) + 1);
    }
    return [...counts.entries()];
  }, [players]);

  return (
    <div className="admin" role="dialog" aria-modal="true" aria-label={t('admin.dashboard')}>
      <div className="admin__panel">
        <header className="admin__head">
          <div>
            <p className="admin__eyebrow">{t('admin.eyebrow')}</p>
            <h2 className="admin__title">{t('admin.dashboard')}</h2>
          </div>
          <button type="button" className="btn btn--ghost btn--small" onClick={closeDashboard}>
            {t('admin.close')}
          </button>
        </header>

        <nav className="admin__tabs" role="tablist">
          {TABS.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={tab === item}
              className={tab === item ? 'admin__tab is-active' : 'admin__tab'}
              onClick={() => setTab(item)}
            >
              {t(`admin.tab.${item}`)}
            </button>
          ))}
        </nav>

        <div className="admin__body">
          {tab === 'overview' ? (
            <div className="admin__grid">
              <Tile label={t('admin.phase')} value={view ? t(`phase.${view.phase}`) : '—'} />
              <Tile label={t('admin.day')} value={view ? String(view.day) : '—'} />
              <Tile label={t('admin.players')} value={`${alive.length} / ${players.length}`} />
              <Tile label={t('admin.rounds')} value={String(stats?.rounds ?? 0)} />
              <Tile label={t('admin.deaths')} value={String((stats?.deathsByCause.mafia ?? 0) + (stats?.deathsByCause.maniac ?? 0) + (stats?.deathsByCause.vote ?? 0))} />
              <Tile label={t('admin.saves')} value={String(stats?.saves ?? 0)} />
              <Tile label={t('admin.votes')} value={String(stats?.votesCast ?? 0)} />
              <Tile label={t('admin.abstains')} value={String(stats?.abstains ?? 0)} />
              <Tile label={t('admin.executed')} value={String(stats?.executed ?? 0)} />
              <Tile label={t('admin.ties')} value={String(stats?.ties ?? 0)} />
              <Tile label={t('admin.messages')} value={String(stats?.messages ?? 0)} />
              <Tile label={t('admin.kicks')} value={String(stats?.kicks ?? 0)} />
              <Tile label={t('admin.duration')} value={formatDuration(stats?.durationMs ?? 0)} />
            </div>
          ) : null}

          {tab === 'rounds' ? (
            <div className="admin__section">
              <h3 className="admin__subtitle">{t('admin.deathsByCause')}</h3>
              <div className="admin__grid admin__grid--tight">
                <Tile label={t('role.mafia.name')} value={String(stats?.deathsByCause.mafia ?? 0)} />
                <Tile label={t('role.maniac.name')} value={String(stats?.deathsByCause.maniac ?? 0)} />
                <Tile label={t('admin.byVote')} value={String(stats?.deathsByCause.vote ?? 0)} />
              </div>

              <h3 className="admin__subtitle">{t('admin.checks')}</h3>
              <div className="admin__grid admin__grid--tight">
                <Tile label={t('table.check.mafia')} value={String(stats?.checks.mafia ?? 0)} />
                <Tile label={t('table.check.maniac')} value={String(stats?.checks.maniac ?? 0)} />
                <Tile label={t('table.check.clean')} value={String(stats?.checks.clean ?? 0)} />
              </div>

              <h3 className="admin__subtitle">{t('admin.roundsList')}</h3>
              {view && view.roundStats.length > 0 ? (
                <table className="admintable">
                  <thead>
                    <tr>
                      <th>{t('admin.round')}</th>
                      <th>{t('admin.deaths')}</th>
                      <th>{t('admin.votes')}</th>
                      <th>{t('admin.executed')}</th>
                      <th>{t('admin.abstains')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...view.roundStats].reverse().map((round) => (
                      <tr key={round.day}>
                        <td>{round.day}</td>
                        <td>
                          {round.deaths.length > 0
                            ? round.deaths
                                .map((death) => `${death.name} (${t(`cause.${death.cause ?? 'unknown'}`)})`)
                                .join(', ')
                            : '—'}
                        </td>
                        <td>
                          {Object.entries(round.votes)
                            .map(([id, count]) => `${players.find((p) => p.id === id)?.name ?? id}: ${count}`)
                            .join(', ') || '—'}
                        </td>
                        <td>
                          {round.executedId
                            ? (players.find((p) => p.id === round.executedId)?.name ?? round.executedId)
                            : round.tie
                              ? t('admin.tie')
                              : '—'}
                        </td>
                        <td>{round.abstains}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="admin__empty">{t('admin.noRounds')}</p>
              )}
            </div>
          ) : null}

          {tab === 'players' ? (
            <div className="admin__section">
              <div className="admin__grid admin__grid--tight">
                {roleRows.map(([role, count]) => (
                  <Tile key={role} label={t(`role.${role}.name`)} value={String(count)} />
                ))}
              </div>
              <table className="admintable">
                <thead>
                  <tr>
                    <th>{t('admin.player')}</th>
                    <th>{t('admin.role')}</th>
                    <th>{t('admin.state')}</th>
                    <th>{t('admin.deathDay')}</th>
                    <th>{t('admin.cause')}</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((player) => (
                    <tr key={player.id}>
                      <td>
                        {player.name}
                        {player.isMe ? ` (${t('table.you')})` : ''}
                        {player.isBot ? ` · ${t('lobby.botTag')}` : ''}
                      </td>
                      <td>{player.role ? t(`role.${player.role}.name`) : t('table.roleHidden')}</td>
                      <td>{player.alive ? t('admin.alive') : t('table.dead')}</td>
                      <td>{player.deathDay ?? '—'}</td>
                      <td>{player.deathCause ? t(`cause.${player.deathCause}`) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="admin__note">{t('admin.hiddenRoles')}</p>
            </div>
          ) : null}

          {tab === 'events' ? (
            <div className="admin__section">
              <ol className="adminlog">
                {(view?.log ?? []).slice(-120).reverse().map((entry) => (
                  <li key={entry.id} className="adminlog__row">
                    <span className="adminlog__meta">
                      {formatClock(entry.day)} · {entry.phase}
                    </span>
                    <span className="adminlog__text">{entry.text ?? entry.code}</span>
                  </li>
                ))}
              </ol>
              {view && view.log.length === 0 ? <p className="admin__empty">{t('admin.noEvents')}</p> : null}
            </div>
          ) : null}

          {tab === 'security' ? (
            <div className="admin__section">
              <div className="admin__grid admin__grid--tight">
                <Tile label={t('admin.mode')} value={mode} />
                <Tile label={t('admin.role')} value={isHost ? 'host' : 'guest'} />
                <Tile label={t('admin.roomCode')} value={code ?? '—'} />
                <Tile label={t('admin.peerId')} value={peerId ?? '—'} />
                <Tile label={t('admin.roomsInCatalog')} value={String(roomsCount)} />
                <Tile label={t('admin.discovery')} value={discoveryUrl || t('admin.notConfigured')} />
                <Tile
                  label={t('admin.voice')}
                  value={voicePublished ? (voiceMuted ? t('admin.voiceMuted') : t('admin.voiceLive')) : t('admin.voiceOff')}
                />
              </div>
              <ul className="admin__list">
                <li>{t('admin.noteHash')}</li>
                <li>{t('admin.noteCsp')}</li>
                <li>{t('admin.noteClient')}</li>
                <li>{t('admin.noteLockout')}</li>
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="tile">
      <span className="tile__label">{label}</span>
      <span className="tile__value">{value}</span>
    </div>
  );
}
