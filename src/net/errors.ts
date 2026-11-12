/**
 * Maps an error of the transport to one of our codes.
 *
 * The transport (PeerJS) reports the kind of the failure in `type` and only a
 * free text in `message`. Without the mapping the text would end up in the
 * interface, and the backup channel would not know that the direct connection
 * is hopeless.
 */
export function errorMessage(error: unknown): string {
  const type = (error as { type?: string })?.type ?? '';
  switch (type) {
    case 'peer-unavailable':
    case 'unavailable-id':
      return 'net.notFound';
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
    case 'disconnected':
      return 'net.server';
    case 'invalid-id':
    case 'invalid-key':
    case 'browser-incompatible':
      return 'net.error';
    default:
      break;
  }
  const text = error instanceof Error ? error.message : '';
  if (text.startsWith('net.')) return text;
  if (/could not connect to peer|no such peer|not found|unavailable/i.test(text)) return 'net.notFound';
  if (/could not get an id|lost connection|server|network|fetch/i.test(text)) return 'net.server';
  return 'net.error';
}
