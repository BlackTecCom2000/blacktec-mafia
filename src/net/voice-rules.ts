/** Pure rules for the voice chat. Kept separate so the UI does not pull in WebRTC. */

export type VoicePermission = 'allowed' | 'notNow' | 'denied';

/** Decides whether the microphone may be used right now. */
export function voicePermission(options: {
  phase: string;
  alive: boolean;
  isMafia: boolean;
  roleEnabled: boolean;
}): VoicePermission {
  if (!options.roleEnabled) return 'denied';
  if (options.phase === 'discussion') return 'allowed';
  if (options.phase === 'night' && options.isMafia) return 'allowed';
  return 'notNow';
}

/**
 * The side of the table a stream belongs to.
 * Dead players speak to dead players only.
 */
export function voiceAudience(alive: boolean): 'alive' | 'dead' {
  return alive ? 'alive' : 'dead';
}
