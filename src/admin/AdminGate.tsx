import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { useI18n } from '../i18n';
import { ADMIN_DIGEST } from './credentials';
import {
  isLocked,
  lockoutSeconds,
  registerFailure,
  verifyPassword,
  type AttemptState,
} from './password';

const ATTEMPT_KEY = 'btcmafia.admin.attempts';
const SESSION_KEY = 'btcmafia.admin.session';

/** The keyboard combination that opens the admin panel. */
export const ADMIN_SHORTCUT = 'Ctrl + Shift + A';

function readAttempts(): AttemptState {
  try {
    const raw = window.localStorage.getItem(ATTEMPT_KEY);
    if (!raw) return { failures: 0, lockedUntil: 0 };
    const parsed = JSON.parse(raw) as Partial<AttemptState>;
    return {
      failures: Number(parsed.failures) || 0,
      lockedUntil: Number(parsed.lockedUntil) || 0,
    };
  } catch {
    return { failures: 0, lockedUntil: 0 };
  }
}

function writeAttempts(state: AttemptState): void {
  try {
    window.localStorage.setItem(ATTEMPT_KEY, JSON.stringify(state));
  } catch {
    /* storage disabled */
  }
}

function readSession(): boolean {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === 'ok';
  } catch {
    return false;
  }
}

interface AdminContextValue {
  /** The password was entered in this tab. */
  isAdmin: boolean;
  /** The dashboard is open. */
  dashboardOpen: boolean;
  openDashboard: () => void;
  closeDashboard: () => void;
}

const AdminContext = createContext<AdminContextValue | null>(null);

export function useAdmin(): AdminContextValue {
  const value = useContext(AdminContext);
  if (!value) throw new Error('useAdmin must be used inside AdminGate');
  return value;
}

/**
 * Hidden admin access.
 *
 * The panel opens only with the keyboard shortcut, the password is checked
 * against a PBKDF2 digest and repeated failures are throttled. This is a
 * convenience gate for the diagnostics screen, not a security boundary:
 * everything the panel shows lives in the browser of the viewer.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [loginOpen, setLoginOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(readSession);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<AttemptState>(() => readAttempts());
  const [now, setNow] = useState(() => Date.now());

  const lockedSeconds = lockoutSeconds(attempts, now);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || !event.shiftKey) return;
      if (event.code !== 'KeyA' && event.key.toLowerCase() !== 'a') return;
      event.preventDefault();
      setLoginOpen(true);
      setDashboardOpen(isAdmin);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isAdmin]);

  useEffect(() => {
    if (!loginOpen) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [loginOpen]);

  useEffect(() => {
    if (!dashboardOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDashboardOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dashboardOpen]);

  const submit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (isLocked(attempts, Date.now())) {
        setError(t('admin.locked', { n: lockoutSeconds(attempts, Date.now()) }));
        return;
      }
      const ok = await verifyPassword(password, ADMIN_DIGEST);
      if (ok) {
        try {
          window.sessionStorage.setItem(SESSION_KEY, 'ok');
        } catch {
          /* storage disabled */
        }
        setIsAdmin(true);
        setDashboardOpen(true);
        setLoginOpen(false);
        setAttempts({ failures: 0, lockedUntil: 0 });
        writeAttempts({ failures: 0, lockedUntil: 0 });
        setError(null);
        setPassword('');
        return;
      }
      const next = registerFailure(attempts, Date.now());
      setAttempts(next);
      writeAttempts(next);
      setPassword('');
      setError(t('admin.wrong'));
    },
    [attempts, password, t],
  );

  const value = useMemo<AdminContextValue>(
    () => ({
      isAdmin,
      dashboardOpen,
      openDashboard: () => setDashboardOpen(true),
      closeDashboard: () => setDashboardOpen(false),
    }),
    [isAdmin, dashboardOpen],
  );

  return (
    <AdminContext.Provider value={value}>
      {children}
      {loginOpen && !isAdmin ? (
        <div className="adminlogin" role="dialog" aria-modal="true" aria-label={t('admin.title')}>
          <form className="adminlogin__box" onSubmit={submit}>
            <p className="adminlogin__eyebrow">{t('admin.eyebrow')}</p>
            <h2 className="adminlogin__title">{t('admin.title')}</h2>
            <label className="field">
              <span className="field__label">{t('admin.password')}</span>
              <input
                className="field__input"
                type="password"
                value={password}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                maxLength={64}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {error ? (
              <p className="adminlogin__error" role="alert">
                {error}
              </p>
            ) : null}
            {lockedSeconds > 0 ? (
              <p className="adminlogin__hint">{t('admin.lockout', { n: lockedSeconds })}</p>
            ) : null}
            <div className="adminlogin__actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setLoginOpen(false);
                  setPassword('');
                  setError(null);
                }}
              >
                {t('admin.cancel')}
              </button>
              <button
                type="submit"
                className="btn btn--primary"
                disabled={lockedSeconds > 0 || !password}
              >
                {t('admin.enter')}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </AdminContext.Provider>
  );
}
