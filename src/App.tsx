import { lazy, Suspense, useCallback, useEffect, useState, useSyncExternalStore, type ReactElement } from 'react';
import { Game } from './components/Game';
import { Lobby } from './components/Lobby';
import { Menu } from './components/Menu';
import type { Action, RoomSettings } from './game/types';
import { I18nProvider, loadEnglish, useI18n, type Locale } from './i18n';
import { GameSession } from './session';
import { parseInviteHash, storedServiceUrl } from './net/code';

const RoomSetup = lazy(() => import('./components/RoomSetup').then((m) => ({ default: m.RoomSetup })));
const FindGame = lazy(() => import('./components/FindGame').then((m) => ({ default: m.FindGame })));

interface Route {
  mode: 'menu' | 'join';
  code: string;
  /** The address of the room service from the invite link. */
  service: string;
}

type Screen = 'menu' | 'custom' | 'find';

function parseHash(): Route {
  const invite = parseInviteHash(window.location.hash);
  if (invite.code) {
    return { mode: 'join', code: invite.code, service: invite.service };
  }
  return { mode: 'menu', code: '', service: '' };
}

function readStorage(key: string, fallback: string): string {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage disabled */
  }
}

export function App() {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const stored = readStorage('btcmafia.locale', 'ru');
    return stored === 'en' ? 'en' : 'ru';
  });

  const setLocale = useCallback((next: Locale) => {
    if (next === 'en') {
      // The English strings are loaded on demand.
      void loadEnglish().then(() => {
        setLocaleState('en');
        writeStorage('btcmafia.locale', 'en');
      });
      return;
    }
    setLocaleState(next);
    writeStorage('btcmafia.locale', next);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = locale === 'ru' ? 'BlackTec Mafia — Ночной совет' : 'BlackTec Mafia — Night Council';
  }, [locale]);

  return (
    <I18nProvider locale={locale} setLocale={setLocale}>
      <Root />
    </I18nProvider>
  );
}

function Root() {
  const { t } = useI18n();
  const [session] = useState(() => new GameSession());
  const [route, setRoute] = useState<Route>(() => parseHash());
  const [screen, setScreen] = useState<Screen>('menu');
  const subscribe = useCallback(
    (listener: () => void) => session.subscribe(listener),
    [session],
  );
  const snapshot = useSyncExternalStore(subscribe, session.getSnapshot, session.getSnapshot);
  const [name, setName] = useState(() => readStorage('btcmafia.name', ''));
  const [discoveryUrl, setDiscoveryUrl] = useState(() => storedServiceUrl());

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => () => session.leave(), [session]);

  const clearHash = () => {
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  };

  const rememberName = (value: string) => {
    setName(value);
    writeStorage('btcmafia.name', value);
  };

  const goMenu = () => {
    session.leave();
    clearHash();
    setScreen('menu');
    setRoute({ mode: 'menu', code: '', service: '' });
  };

  const startSolo = (playerName: string, count: number) => {
    rememberName(playerName);
    clearHash();
    setScreen('menu');
    session.startSolo(playerName, count);
  };

  const startHost = (playerName: string) => {
    rememberName(playerName);
    clearHash();
    setScreen('menu');
    void session.hostRoom(playerName);
  };

  const startCustomRoom = (values: { settings: RoomSettings; password: string | null }) => {
    rememberName(name);
    clearHash();
    setScreen('menu');
    void session.hostRoom(name, {
      custom: true,
      password: values.password,
      settings: values.settings,
    });
  };

  const startJoin = (code: string, playerName: string, password: string | null) => {
    rememberName(playerName);
    setScreen('menu');
    // The invite link can carry the address of the room service.
    if (route.service) void session.setDiscoveryUrl(route.service);
    void session.joinRoom(code, playerName, password);
  };

  const dispatch = (action: Action) => session.dispatch(action);
  const busy = snapshot.status === 'connecting';
  const error = snapshot.status === 'error' ? snapshot.error : null;
  const passwordRequired = snapshot.passwordRequired;

  let content: ReactElement;
  if (screen === 'custom') {
    content = (
      <RoomSetup
        playerName={name}
        onCancel={() => setScreen('menu')}
        onCreate={(values) => startCustomRoom(values)}
      />
    );
  } else if (screen === 'find') {
    content = (
      <FindGame
        rooms={snapshot.rooms}
        status={snapshot.roomsStatus}
        error={snapshot.roomsError}
        joinError={snapshot.status === 'error' ? snapshot.error : null}
        serviceUrl={discoveryUrl}
        playerName={name}
        onRefresh={() => void session.refreshRooms()}
        onServiceUrl={(url) => {
          setDiscoveryUrl(url.trim());
          void session.setDiscoveryUrl(url);
        }}
        onQuickMatch={(mode, players) => {
          void session.quickMatch({ mode, players }, name).then((match) => {
            if (match) setScreen('menu');
          });
        }}
        onJoin={(code) => {
          void session.joinRoom(code, name).then((joined) => {
            if (joined) setScreen('menu');
          });
        }}
        onBack={() => setScreen('menu')}
      />
    );
  } else if (snapshot.view && snapshot.view.phase === 'lobby') {
    content = (
      <Lobby
        view={snapshot.view}
        code={snapshot.code}
        isHost={snapshot.isHost}
        onAction={dispatch}
        onLeave={goMenu}
        onSetPassword={(password) => session.setRoomPassword(password)}
      />
    );
  } else if (snapshot.view) {
    content = (
      <Game
        view={snapshot.view}
        code={snapshot.code}
        isHost={snapshot.isHost}
        onAction={dispatch}
        onLeave={goMenu}
        voice={{
          publishing: snapshot.voicePublishing,
          muted: snapshot.voiceMuted,
          error: snapshot.voiceError,
          speaking: snapshot.speaking,
        }}
        onVoice={(action) => {
          if (action === 'toggle') {
            if (snapshot.voicePublishing) session.disableMicrophone();
            else void session.enableMicrophone();
            return;
          }
          session.toggleMute();
        }}
      />
    );
  } else {
    content = (
      <Menu
        initialName={name}
        initialCode={route.code}
        initialMode={route.mode}
        busy={busy}
        error={error}
        passwordRequired={passwordRequired}
        onSolo={startSolo}
        onHost={startHost}
        onCustomRoom={() => setScreen('custom')}
        onFindGame={() => setScreen('find')}
        onJoin={startJoin}
        onSubmitPassword={(password) => session.submitPassword(password)}
        onClearError={() => session.leave()}
      />
    );
  }

  return (
    <>
      <Suspense fallback={<div className="screen screen--menu" />}>
        {content}
      </Suspense>
      {error && snapshot.view && !passwordRequired ? (
        <div className="toast" role="alert">
          <span>{t(error)}</span>
          <button type="button" className="btn btn--small btn--primary" onClick={goMenu}>
            {t('gameover.menu')}
          </button>
        </div>
      ) : null}
      {snapshot.actionError ? (
        <div className="toast toast--hint" role="status">
          <span>{t(snapshot.actionError)}</span>
        </div>
      ) : null}
    </>
  );
}
