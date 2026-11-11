import type { Server } from 'node:http';

export interface DiscoveryRoom {
  code: string;
  name: string;
  players: number;
  maxPlayers: number;
  hasPassword: boolean;
  rules: 'standard' | 'custom';
  status: 'open' | 'ready' | 'playing' | 'full';
  seats: number;
  allowIncomplete: boolean;
  updatedAt: number;
}

export declare const STALE_MS: number;

export declare function createDiscoveryServer(options?: { staleMs?: number }): {
  server: Server;
  rooms: Map<string, DiscoveryRoom>;
  prune: () => void;
  staleMs: number;
};
