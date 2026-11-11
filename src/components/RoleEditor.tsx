import { useI18n } from '../i18n';
import { ROLE_ORDER, compositionTotal } from '../game/roles';
import type { Role, RoleComposition } from '../game/types';
import { DaggerIcon, SealIcon, roleIcon } from './icons';

const FACTION_KEY: Record<Role, string> = {
  mafia: 'role.faction.mafia',
  doctor: 'role.faction.city',
  detective: 'role.faction.city',
  sheriff: 'role.faction.city',
  maniac: 'role.faction.maniac',
  citizen: 'role.faction.city',
};

export function RoleEditor({
  composition,
  seats,
  onChange,
  disabled = false,
}: {
  composition: RoleComposition;
  seats: number;
  onChange: (next: RoleComposition) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const total = compositionTotal(composition);

  const setCount = (role: Role, value: number) => {
    const next = { ...composition, [role]: Math.max(0, Math.min(24, Math.round(value))) };
    onChange(next);
  };

  return (
    <div className="roleset">
      <ul className="roleset__list">
        {ROLE_ORDER.map((role) => {
          const count = composition[role] ?? 0;
          return (
            <li key={role} className={`roleset__row roleset__row--${role}`}>
              <span className={`roleset__icon roleset__icon--${role}`} aria-hidden="true">
                {roleIcon(role, { size: 14 })}
              </span>
              <span className="roleset__name">
                {t(`role.${role}.name`)}
                <em className="roleset__faction">{t(FACTION_KEY[role])}</em>
              </span>
              <span className="roleset__stepper">
                <button
                  type="button"
                  className="roleset__btn"
                  onClick={() => setCount(role, count - 1)}
                  disabled={disabled || count <= 0}
                  aria-label={t('roleset.minus', { role: t(`role.${role}.name`) })}
                >
                  −
                </button>
                <input
                  className="roleset__input"
                  type="number"
                  min={0}
                  max={24}
                  value={count}
                  disabled={disabled}
                  onChange={(event) => setCount(role, Number(event.target.value))}
                  aria-label={t('roleset.count', { role: t(`role.${role}.name`) })}
                />
                <button
                  type="button"
                  className="roleset__btn"
                  onClick={() => setCount(role, count + 1)}
                  disabled={disabled}
                  aria-label={t('roleset.plus', { role: t(`role.${role}.name`) })}
                >
                  +
                </button>
              </span>
            </li>
          );
        })}
      </ul>

      <div className="roleset__summary">
        <span className="roleset__total">
          <SealIcon size={13} />
          {t('roleset.total', { n: total })}
        </span>
        <span className="roleset__seats">
          <DaggerIcon size={13} />
          {t('roleset.seats', { n: seats })}
        </span>
      </div>

      {total !== seats ? (
        <p className="roleset__hint roleset__hint--warn">
          {t('roleset.mismatch', { total, seats })}
        </p>
      ) : (
        <p className="roleset__hint">{t('roleset.match')}</p>
      )}
    </div>
  );
}
