import { MafiaEngine } from './game/engine';
import { buildView, type GameView } from './game/view';
import { MIN_PLAYERS, MAX_PLAYERS, type Action, type RoomSettings } from './game/types';
import { normalizeCode } from './net/code';
import { findQuickMatch, roomStatus, checkJoinAccess, type QuickMatchPrefs, type RoomListing } from './net/rooms';
import type { Discovery } from './net/discovery';
import { voiceAudience, voicePermission } from './net/voice-rules';
import { RelayClient, type RelayPayload } from './net/relay';
import type { VoiceHub } from './net/voice';
import type { ClientMessage, GuestNet, HostNet } from './net/peer';

export type SessionMode = 'solo' | 'host' | 'guest';
export type SessionStatus = 'idle' | 'connecting' | 'ready' | 'error';
export type RoomsStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface SessionSnapshot {
  mode: SessionMode | null;
  status: SessionStatus;
  view: GameView | null;
  code: string | null;
  myId: string | null;
  error: string | null;
  isHost: boolean;
  /** The host asked for a password: the guest has to send it. */
  passwordRequired: boolean;
  /** Catalog of public rooms. */
  rooms: RoomListing[];
  roomsStatus: RoomsStatus;
  roomsError: string | null;
  voiceError: string | null;
  voicePublishing: boolean;
  voiceMuted: boolean;
  /** Peer id -> is publishing. */
  speaking: Record<string, boolean>;
  /** The last rejected action, shown as a hint. */
  actionError: string | null;
  /** The address of the room service (catalog and backup channel). */
  discoveryUrl: string;
}

const IDLE: SessionSnapshot = {
  mode: null,
  status: 'idle',
  view: null,
  code: null,
  myId: null,
  error: null,
  isHost: false,
  passwordRequired: false,
  rooms: [],
  roomsStatus: 'idle',
  roomsError: null,
  voiceError: null,
  voicePublishing: false,
  voiceMuted: false,
  speaking: {},
  actionError: null,
  discoveryUrl: '',
};

export interface HostRoomOptions {
  /** Custom rooms allow any composition and up to 24 seats. */
  custom?: boolean;
  /** The password is kept in the session only and never leaves the host. */
  password?: string | null;
  settings?: Partial<RoomSettings>;
}

export class GameSession {
  private snapshot: SessionSnapshot = IDLE;

  private readonly listeners = new Set<() => void>();

  private engine: MafiaEngine | null = null;

  private hostNet: HostNet | null = null;

  private guestNet: GuestNet | null = null;

  private loop: number | null = null;

  private detachHooks: (() => void) | null = null;

  private lastVersion = -1;

  /** Password of a protected room. Only the host keeps it. */
  private password: string | null = null;

  private voice: VoiceHub | null = null;

  private discoveryTimer: number | null = null;

  private detachDiscovery: (() => void) | null = null;

  /** The service client, kept for the synchronous close on unload. */
  private discovery: Discovery | null = null;

  /** The backup channel through the room service. */
  private relay: RelayClient | null = null;

  private relayTimer: number | null = null;

  /** Identifiers of the relay messages that were already applied. */
  private readonly appliedRelayActions = new Set<string>();

  /** The seat of the guest that came through the backup channel. */
  private relayGuestId: string | null = null;

  /** The key the guest uses on the backup channel. */
  private readonly relayKey = `r${Math.random().toString(36).slice(2, 10)}`;

  /** The counter of the relay messages of this guest. */
  private relayCounter = 0;

  /** The name of the guest, used by the backup channel. */
  private guestName = '';

  /** The password of the guest, used by the backup channel. */
  private guestPassword: string | null = null;

  /** The answers of the host for the relay guests. */
  private readonly relayWelcome: Record<string, string> = {};

  private speaking: Record<string, boolean> = {};

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot = (): SessionSnapshot => this.snapshot;

  // ------------------------------------------------------------------ solo

  /** Solo: one human, the rest are bots, the match starts immediately. */
  startSolo(name: string, playerCount: number): void {
    this.teardown();
    const engine = new MafiaEngine({ hostId: 'p1', seed: Math.floor(Math.random() * 2 ** 31) });
    this.engine = engine;
    engine.addPlayer('p1', name.trim() || 'Вы');
    engine.fillBots(Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, Math.round(playerCount))));
    // A solo game needs no lobby confirmation.
    for (const player of engine.state.players) player.lobbyReady = true;
    engine.startMatch('p1', Date.now());
    this.snapshot = {
      ...IDLE,
      mode: 'solo',
      status: 'ready',
      view: buildView(engine.state, 'p1', Date.now()),
      code: null,
      myId: 'p1',
      isHost: true,
    };
    this.emit();
    this.startLoop();
  }

  // ------------------------------------------------------------------ host

  /** Host: creates a PeerJS room, waits in the lobby for guests and bots. */
  async hostRoom(name: string, options: HostRoomOptions = {}): Promise<void> {
    this.teardown();
    const password = options.password?.trim() || null;
    const settings: Partial<RoomSettings> = {
      ...options.settings,
      name: name.trim() || options.settings?.name || '',
      custom: options.custom ?? options.settings?.custom ?? false,
      hasPassword: password !== null,
    };
    const engine = new MafiaEngine({
      hostId: 'host',
      seed: Math.floor(Math.random() * 2 ** 31),
      settings,
    });
    this.engine = engine;
    this.password = password;
    engine.addPlayer('host', name.trim() || 'Хост');
    this.snapshot = {
      ...IDLE,
      mode: 'host',
      status: 'connecting',
      view: buildView(engine.state, 'host', Date.now()),
      code: null,
      myId: 'host',
      isHost: true,
    };
    this.emit();
    this.startLoop();

    try {
      const { HostNet } = await import('./net/peer');
      if (this.snapshot.mode !== 'host') return;
      const net = new HostNet({
        onJoin: (playerId: string, guestName: string, guestPassword: string | null) => {
          if (!this.engine) return 'net.error';
          if (this.engine.state.phase !== 'lobby') return 'net.full';
          const access = checkJoinAccess(this.engine.state.settings, this.password, guestPassword);
          if (access === 'passwordRequired') return 'net.passwordRequired';
          if (access === 'wrongPassword') return 'net.wrongPassword';
          const player = this.engine.addPlayer(playerId, guestName || 'Гость');
          if (!player) return 'net.full';
          this.engine.resetReadiness();
          this.push();
          this.publishRoom();
          return null;
        },
        onMessage: (playerId: string, message: ClientMessage) => {
          if (!this.engine) return;
          if (message.t === 'action') {
            const result = this.engine.submit(playerId, message.action, Date.now());
            if (!result.ok && result.error) {
              this.hostNet?.send(playerId, { t: 'actionError', error: result.error });
            }
            this.push();
          }
        },
        onLeave: (playerId: string) => {
          this.engine?.markDisconnected(playerId);
          this.voice?.removePeer(playerId);
          this.push();
          this.publishRoom();
        },
        onVoice: (playerId: string, message) => {
          void this.voice?.handleSignal(message);
          if (this.hostNet) this.hostNet.broadcastVoice(playerId, { ...message, from: playerId });
        },
      });
      this.hostNet = net;

      const code = await net.start();
      if (this.snapshot.mode !== 'host') return;
      this.snapshot = { ...this.snapshot, status: 'ready', code };
      this.emit();
      this.push();
      this.startDiscovery();
      this.startRelay(code, 'host');
      // When the tab goes away the room must disappear from the catalog at once.
      const farewell = () => this.closeRoomInCatalog();
      window.addEventListener('pagehide', farewell);
      window.addEventListener('beforeunload', farewell);
      this.detachHooks = () => {
        window.removeEventListener('pagehide', farewell);
        window.removeEventListener('beforeunload', farewell);
      };
      const { VoiceHub } = await import('./net/voice');
      this.voice = new VoiceHub({
        selfId: 'host',
        isHost: true,
        sendToHost: () => undefined,
        sendToGuest: (peerId, message) => {
          if (peerId === '__all__') this.hostNet?.broadcastVoice('host', message);
          else this.hostNet?.sendVoice(peerId, message);
        },
        onState: (peerId, publishing) => this.setSpeaking(peerId, publishing),
        onError: (message) => this.setVoiceError(message),
        canPublish: () => this.canUseVoice(),
        audienceOf: (peerId) => this.audienceOf(peerId),
        guestIds: () => this.guestIds(),
      });
    } catch (error) {
      if (this.snapshot.mode !== 'host') return;
      this.snapshot = {
        ...this.snapshot,
        status: 'error',
        error: error instanceof Error ? error.message : 'net.error',
      };
      this.emit();
    }
  }

  /** Host: changes or removes the room password. */
  setRoomPassword(password: string | null): void {
    if (this.snapshot.mode !== 'host') return;
    const clean = password?.trim() || null;
    this.password = clean;
    this.engine?.submit('host', { type: 'setPassword', hasPassword: clean !== null }, Date.now());
    this.push();
  }

  // ----------------------------------------------------------------- guest

  /** Guest: joins an existing room by its five-letter code. */
  async joinRoom(rawCode: string, name: string, password?: string | null): Promise<boolean> {
    this.teardown();
    const code = normalizeCode(rawCode);
    this.guestName = (name || 'Гость').trim().slice(0, 18);
    this.guestPassword = password ?? null;
    this.snapshot = {
      ...IDLE,
      mode: 'guest',
      status: 'connecting',
      view: null,
      code,
      myId: null,
      isHost: false,
    };
    this.emit();

    try {
      const { GuestNet } = await import('./net/peer');
      if (this.snapshot.mode !== 'guest') return false;
      const net = new GuestNet({
        onView: (view) => {
          this.snapshot = { ...this.snapshot, view, status: 'ready' };
          this.emit();
        },
        onClose: (error) => {
          this.snapshot = { ...this.snapshot, status: 'error', error };
          this.emit();
        },
        onReject: (error) => {
          this.snapshot = {
            ...this.snapshot,
            status: 'error',
            error,
            passwordRequired: error === 'net.passwordRequired' || error === 'net.wrongPassword',
          };
          this.emit();
        },
        onActionError: (error) => {
          this.snapshot = { ...this.snapshot, actionError: error };
          this.emit();
        },
        onVoice: (message) => {
          void this.voice?.handleSignal(message);
        },
      });
      this.guestNet = net;

      await net.connect(code, this.guestName || 'Гость', password);
      if (this.snapshot.mode !== 'guest') return false;
      // Tell the host we are gone when the tab closes.
      const farewell = () => net.bye();
      window.addEventListener('pagehide', farewell);
      window.addEventListener('beforeunload', farewell);
      this.detachHooks = () => {
        window.removeEventListener('pagehide', farewell);
        window.removeEventListener('beforeunload', farewell);
      };
      this.snapshot = {
        ...this.snapshot,
        status: 'ready',
        myId: net.youId,
        code,
        isHost: false,
        passwordRequired: false,
      };
      this.emit();
      const { VoiceHub } = await import('./net/voice');
      this.voice = new VoiceHub({
        selfId: net.youId ?? 'guest',
        isHost: false,
        sendToHost: (message) => {
          this.guestNet?.sendVoice(message);
        },
        sendToGuest: () => undefined,
        onState: (peerId, publishing) => this.setSpeaking(peerId, publishing),
        onError: (message) => this.setVoiceError(message),
        canPublish: () => this.canUseVoice(),
        audienceOf: (peerId) => this.audienceOf(peerId),
        guestIds: () => [],
      });
    } catch (error) {
      if (this.snapshot.mode !== 'guest') return false;
      const message = error instanceof Error ? error.message : 'net.error';
      // The direct connection did not come through: use the backup channel.
      if (message === 'net.p2p' || message === 'net.timeout' || message === 'net.error') {
        this.fallBackToRelay(code);
        return false;
      }
      this.snapshot = {
        ...this.snapshot,
        status: 'error',
        error: message,
        // A room that cannot be reached is gone — drop it from the catalog.
        rooms: this.snapshot.rooms.filter((room) => room.code !== code),
      };
      this.emit();
      return false;
    }
    return true;
  }

  /** Guest: retries the join with the password. */
  submitPassword(password: string): void {
    if (this.snapshot.mode !== 'guest') return;
    this.snapshot = { ...this.snapshot, status: 'connecting', error: null };
    this.emit();
    const ok = this.guestNet?.retryJoin(password);
    if (ok === false) {
      this.snapshot = {
        ...this.snapshot,
        status: 'error',
        error: 'net.closed',
        passwordRequired: true,
      };
      this.emit();
    }
  }

  // ------------------------------------------------------------ room list

  async refreshRooms(): Promise<void> {
    const { discovery } = await import('./net/discovery');
    this.discovery = discovery;
    if (!discovery.available) {
      this.snapshot = { ...this.snapshot, roomsStatus: 'error', roomsError: 'net.noDiscovery' };
      this.emit();
      return;
    }
    this.snapshot = { ...this.snapshot, roomsStatus: 'loading', roomsError: null };
    this.emit();
    try {
      const rooms = await discovery.list();
      this.snapshot = { ...this.snapshot, rooms, roomsStatus: 'ready' };
      this.emit();
    } catch {
      this.snapshot = { ...this.snapshot, roomsStatus: 'error', roomsError: 'net.discovery' };
      this.emit();
    }
  }

  /** Points the room catalog at another discovery service. */
  async setDiscoveryUrl(url: string): Promise<void> {
    const clean = url.trim().replace(/\/+$/, '');
    const { discovery, storeDiscoveryUrl } = await import('./net/discovery');
    storeDiscoveryUrl(clean);
    this.discovery = discovery;
    discovery.setBaseUrl(clean);
    this.snapshot = { ...this.snapshot, discoveryUrl: clean };
    this.emit();
    await this.refreshRooms();
  }

  /** Finds an open, compatible room and joins it. */
  async quickMatch(prefs: QuickMatchPrefs, name: string): Promise<RoomListing | null> {
    const { discovery } = await import('./net/discovery');
    this.discovery = discovery;
    if (!discovery.available) {
      this.snapshot = { ...this.snapshot, roomsStatus: 'error', roomsError: 'net.noDiscovery' };
      this.emit();
      return null;
    }
    this.snapshot = { ...this.snapshot, roomsStatus: 'loading' };
    this.emit();
    let rooms: RoomListing[] = [];
    try {
      rooms = await discovery.list();
    } catch {
      this.snapshot = { ...this.snapshot, roomsStatus: 'error', roomsError: 'net.discovery' };
      this.emit();
      return null;
    }
    const match = findQuickMatch(rooms, prefs);
    this.snapshot = { ...this.snapshot, rooms, roomsStatus: 'ready' };
    this.emit();
    if (!match) return null;
    await this.joinRoom(match.code, name);
    if (this.snapshot.status === 'error') return null;
    return match;
  }

  /**
   * The backup channel through the room service.
   *
   * The host publishes its snapshot and collects the actions of the guests, the
   * guest reads the snapshot and sends its actions. It is used when the direct
   * peer connection does not come through (symmetric NAT, mobile networks).
   */
  private startRelay(code: string, role: 'host' | 'guest'): void {
    const baseUrl = this.relayUrl();
    if (!baseUrl) return;
    const relay = new RelayClient(baseUrl, code, role);
    this.relay = relay;
    if (role === 'guest') {
      void relay.send(`${this.relayKey}:join`, {
        kind: 'join',
        key: this.relayKey,
        name: this.guestName,
        password: this.guestPassword,
      });
    }

    const tick = async () => {
      if (this.relay !== relay) return;
      if (role === 'host') {
        const view = this.snapshot.view;
        if (view) await relay.pushSnapshot(view, this.relayWelcome);
        const messages = await relay.pullMessages();
        for (const entry of messages) {
          if (!entry.payload || this.appliedRelayActions.has(entry.id)) continue;
          this.appliedRelayActions.add(entry.id);
          if (entry.payload.kind === 'join') {
            this.handleRelayJoin(entry.payload);
            continue;
          }
          const playerId = this.relayGuestId;
          if (!playerId || !this.engine) continue;
          const result = this.engine.submit(playerId, entry.payload.action, Date.now());
          if (!result.ok && result.error) {
            this.hostNet?.send(playerId, { t: 'actionError', error: result.error });
          }
          this.push();
        }
      } else {
        const { snapshot: view, welcome } = await relay.pull();
        const myId = welcome[this.relayKey];
        if (myId && !myId.startsWith('error:')) this.relayGuestId = myId;
        if (view && view.version !== this.snapshot.view?.version) {
          this.snapshot = {
            ...this.snapshot,
            view,
            status: myId?.startsWith('error:') ? 'error' : 'ready',
            error: myId?.startsWith('error:') ? myId.slice(6) : this.snapshot.error,
            myId: myId && !myId.startsWith('error:') ? myId : this.snapshot.myId,
          };
          this.emit();
        }
      }
    };

    this.relayTimer = window.setInterval(() => {
      void tick();
    }, 500);
    void tick();
  }

  /** The host takes a guest that came through the backup channel. */
  private handleRelayJoin(payload: Extract<RelayPayload, { kind: 'join' }>): void {
    if (!this.engine) return;
    if (this.engine.state.phase !== 'lobby') return;
    const access = checkJoinAccess(this.engine.state.settings, this.password, payload.password);
    if (access !== 'ok') {
      this.relayWelcome[payload.key] = `error:${access}`;
      return;
    }
    const existing = this.engine.state.players.find(
      (player) => !player.isBot && player.relay && player.name === (payload.name || 'Гость'),
    );
    const player = existing ?? this.engine.addPlayer(`r${this.engine.state.players.length + 1}`, payload.name || 'Гость');
    if (!player) return;
    player.relay = true;
    player.connected = true;
    this.relayWelcome[payload.key] = player.id;
    this.relayGuestId = player.id;
    this.engine.resetReadiness();
    this.push();
    this.publishRoom();
  }

  /** The address of the room service used for the backup channel. */
  private relayUrl(): string {
    if (this.snapshot.discoveryUrl) return this.snapshot.discoveryUrl;
    try {
      return window.localStorage.getItem('btcmafia.discovery') ?? '';
    } catch {
      return '';
    }
  }

  /** The guest switches to the backup channel when the direct connection fails. */
  private fallBackToRelay(code: string): void {
    if (this.relay) return;
    if (!this.relayUrl()) return;
    this.guestName = this.guestName || 'Гость';
    this.startRelay(code, 'guest');
  }

  // ---------------------------------------------------------------- voice

  async enableMicrophone(): Promise<boolean> {
    if (!this.voice) return false;
    const ok = await this.voice.enableMicrophone();
    this.snapshot = {
      ...this.snapshot,
      voicePublishing: this.voice.isPublishing,
      voiceMuted: this.voice.isMuted,
      voiceError: ok ? null : this.snapshot.voiceError,
    };
    this.emit();
    return ok;
  }

  disableMicrophone(): void {
    this.voice?.disableMicrophone();
    this.snapshot = {
      ...this.snapshot,
      voicePublishing: false,
      voiceMuted: false,
    };
    this.emit();
  }

  toggleMute(): void {
    const muted = this.voice?.toggleMute() ?? false;
    this.snapshot = { ...this.snapshot, voiceMuted: muted };
    this.emit();
  }

  private canUseVoice(): boolean {
    const view = this.snapshot.view;
    if (!view || !view.settings.voiceEnabled) return false;
    return (
      voicePermission({
        phase: view.phase,
        alive: view.me?.alive ?? false,
        isMafia: view.me?.role === 'mafia',
        roleEnabled: view.settings.voiceEnabled,
      }) === 'allowed'
    );
  }

  private audienceOf(peerId: string): 'alive' | 'dead' {
    const view = this.snapshot.view;
    const player = view?.players.find((item) => item.id === peerId);
    if (!player) return 'alive';
    return voiceAudience(player.alive);
  }

  private guestIds(): string[] {
    const view = this.snapshot.view;
    if (!view) return [];
    return view.players.filter((player) => player.id !== view.hostId).map((player) => player.id);
  }

  private setSpeaking(peerId: string, publishing: boolean): void {
    this.speaking = { ...this.speaking, [peerId]: publishing };
    this.snapshot = { ...this.snapshot, speaking: { ...this.speaking } };
    this.emit();
  }

  private setVoiceError(message: string): void {
    this.snapshot = { ...this.snapshot, voiceError: message };
    this.emit();
  }

  // -------------------------------------------------------------- actions

  dispatch(action: Action): void {
    if (this.snapshot.mode === 'guest') {
      // Over the backup channel the actions go through the room service.
      if (this.relay && this.relayGuestId) {
        const id = `${this.relayKey}:${this.relayCounter += 1}`;
        void this.relay.send(id, { kind: 'action', action });
        return;
      }
      this.guestNet?.send(action);
      return;
    }
    if (!this.engine || !this.snapshot.myId) return;
    const result = this.engine.submit(this.snapshot.myId, action, Date.now());
    if (!result.ok && result.error) {
      this.snapshot = { ...this.snapshot, actionError: result.error };
    } else if (this.snapshot.actionError) {
      this.snapshot = { ...this.snapshot, actionError: null };
    }
    this.push();
    if (action.type === 'updateSettings' || action.type === 'setComposition') {
      this.publishRoom();
    }
  }

  leave(): void {
    this.teardown();
    this.snapshot = IDLE;
    this.emit();
  }

  private push(): void {
    const engine = this.engine;
    if (!engine) return;
    const now = Date.now();
    const view = buildView(engine.state, this.snapshot.myId, now);
    this.snapshot = { ...this.snapshot, view };
    this.emit();
    if (this.snapshot.mode === 'host' && this.hostNet) {
      for (const player of engine.state.players) {
        if (player.id === this.snapshot.myId) continue;
        if (!this.hostNet.isPlayerOnline(player.id)) continue;
        this.hostNet.send(player.id, {
          t: 'view',
          view: buildView(engine.state, player.id, now),
        });
      }
    }
  }

  private startLoop(): void {
    this.stopLoop();
    this.lastVersion = -1;
    this.loop = window.setInterval(() => {
      const engine = this.engine;
      if (!engine) return;
      const now = Date.now();
      engine.tick(now);
      if (engine.state.version !== this.lastVersion) {
        this.lastVersion = engine.state.version;
        this.push();
      }
    }, 250);
  }

  private stopLoop(): void {
    if (this.loop !== null) {
      window.clearInterval(this.loop);
      this.loop = null;
    }
  }

  // ------------------------------------------------------------ discovery

  /** Publishes the room of this host in the discovery catalog. */
  private publishRoom(): void {
    if (this.snapshot.mode !== 'host' || !this.snapshot.code) return;
    const engine = this.engine;
    if (!engine) return;
    const listing: RoomListing = {
      code: this.snapshot.code,
      name: engine.state.settings.name,
      players: engine.state.players.length,
      maxPlayers: engine.state.settings.maxPlayers,
      hasPassword: engine.state.settings.hasPassword,
      rules: engine.state.settings.roleSet === 'custom' ? 'custom' : 'standard',
      status: roomStatus(
        engine.state.phase,
        engine.state.players.length,
        engine.state.settings.maxPlayers,
        engine.state.players.filter((player) => !player.isBot).every((player) => player.lobbyReady),
      ),
      seats:
        engine.state.settings.roleSet === 'custom'
          ? Object.values(engine.state.settings.composition).reduce((sum, value) => sum + value, 0)
          : engine.state.settings.maxPlayers,
      allowIncomplete: engine.state.settings.allowIncomplete,
      updatedAt: Date.now(),
    };
    void import('./net/discovery')
      .then(({ discovery }) => {
        this.discovery = discovery;
        return discovery.publish(listing);
      })
      .catch(() => undefined);
  }

  private startDiscovery(): void {
    this.stopDiscovery();
    this.publishRoom();
    this.discoveryTimer = window.setInterval(() => this.publishRoom(), 5000);
    // A hidden tab is throttled by the browser, so refresh as soon as the
    // host comes back to the tab.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') this.publishRoom();
    };
    document.addEventListener('visibilitychange', onVisibility);
    this.detachDiscovery = () => {
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }

  /** Stops the backup channel. */
  private stopRelay(): void {
    if (this.relayTimer !== null) {
      window.clearInterval(this.relayTimer);
      this.relayTimer = null;
    }
    void this.relay?.close();
    this.relay = null;
  }

  private stopDiscovery(): void {
    if (this.discoveryTimer !== null) {
      window.clearInterval(this.discoveryTimer);
      this.discoveryTimer = null;
    }
    this.detachDiscovery?.();
    this.detachDiscovery = null;
  }

  private teardown(): void {
    this.stopLoop();
    this.stopDiscovery();
    this.stopRelay();
    this.detachHooks?.();
    this.detachHooks = null;
    this.voice?.close();
    this.voice = null;
    this.speaking = {};
    const code = this.snapshot.code;
    const wasHost = this.snapshot.mode === 'host';
    this.hostNet?.stop();
    this.hostNet = null;
    this.guestNet?.stop();
    this.guestNet = null;
    this.engine = null;
    this.password = null;
    this.lastVersion = -1;
    if (wasHost && code) {
      void import('./net/discovery')
        .then(({ discovery }) => discovery.unpublish(code))
        .catch(() => undefined);
    }
  }

  /**
   * Closes the room in the catalog right away — the tab is going away and the
   * heartbeat will stop, so the room must not stay in the list as a ghost.
   */
  closeRoomInCatalog(): void {
    const code = this.snapshot.code;
    if (this.snapshot.mode !== 'host' || !code) return;
    // The service client is already loaded for a host that published itself.
    if (this.discovery) {
      this.discovery.closeNow(code);
      return;
    }
    void import('./net/discovery')
      .then(({ discovery }) => discovery.closeNow(code))
      .catch(() => undefined);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
