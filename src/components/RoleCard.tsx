import { useState } from 'react';
import type { GameView } from '../game/view';
import { roleDesc, roleFaction, roleName, useI18n } from '../i18n';
import { CheckIcon, SealIcon, roleIcon } from './icons';

export function RoleCard({ view }: { view: GameView }) {
  const { t } = useI18n();
  const [hidden, setHidden] = useState(false);
  const me = view.me;
  if (!me) return null;
  const role = me.role;
  const dead = !me.alive;
  const checks = view.myChecks;

  return (
    <div className={`rolecard rolecard--${role} ${hidden ? 'is-hidden' : ''} ${dead ? 'is-dead' : ''}`}>
      <span className="rolecard__stamp" aria-hidden="true">
        {dead ? '†' : t('role.secret')}
      </span>

      {hidden ? (
        <div className="rolecard__back">
          <span className="rolecard__seal" aria-hidden="true">
            <SealIcon size={42} />
          </span>
          <p className="rolecard__backtext">{t('role.yourRole')}</p>
          <button type="button" className="btn btn--ink btn--small" onClick={() => setHidden(false)}>
            {t('role.show')}
          </button>
        </div>
      ) : (
        <>
          <div className="rolecard__top">
            <span className="rolecard__overline">{t('role.yourRole')}</span>
            <span className="rolecard__icon" aria-hidden="true">
              {roleIcon(role, { size: 26 })}
            </span>
          </div>
          <h2 className="rolecard__name">{roleName(t, role)}</h2>
          <p className="rolecard__faction">
            {t('role.team')} · {roleFaction(t, role)}
          </p>
          <p className="rolecard__desc">{roleDesc(t, role)}</p>

          {checks.length > 0 ? (
            <div className="rolecard__checks">
              <p className="rolecard__label">{t('table.checks')}</p>
              <ul>
                {checks.map((check) => {
                  const player = view.players.find((item) => item.id === check.id);
                  if (!player) return null;
                  const hostile = check.result !== 'clean';
                  return (
                    <li key={check.id} className={hostile ? 'is-mafia' : 'is-clean'}>
                      <span>{player.name}</span>
                      <span className="checkbadge">
                        {hostile ? <SealIcon size={12} /> : <CheckIcon size={12} />}
                        {t(hostile ? `table.check.${check.result}` : 'table.check.clean')}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          <div className="rolecard__foot">
            <span className="ability">{t(`role.${role}.ability`)}</span>
            <button type="button" className="btn btn--ink btn--small" onClick={() => setHidden(true)}>
              {t('role.hide')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
