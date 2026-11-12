import { describe, expect, it } from 'vitest';
import { errorMessage } from '../src/net/errors';

describe('the errors of the transport', () => {
  it('maps a missing peer to "not found"', () => {
    expect(errorMessage({ type: 'peer-unavailable', message: 'Could not connect to peer' })).toBe(
      'net.notFound',
    );
    expect(errorMessage({ type: 'unavailable-id', message: 'ID is taken' })).toBe('net.notFound');
  });

  it('maps a broken signalling server to "server"', () => {
    expect(errorMessage({ type: 'server-error', message: 'Could not get an ID from the server.' })).toBe(
      'net.server',
    );
    expect(errorMessage({ type: 'network', message: 'Lost connection to server.' })).toBe('net.server');
    expect(errorMessage({ type: 'socket-closed', message: 'Underlying socket is already closed' })).toBe(
      'net.server',
    );
  });

  it('recognises the text of an error without a type', () => {
    expect(errorMessage(new Error('Could not get an ID from the server.'))).toBe('net.server');
    expect(errorMessage(new Error('Lost connection to server.'))).toBe('net.server');
    expect(errorMessage(new Error('Could not connect to peer'))).toBe('net.notFound');
  });

  it('keeps our own codes', () => {
    expect(errorMessage(new Error('net.wrongPassword'))).toBe('net.wrongPassword');
    expect(errorMessage(new Error('net.full'))).toBe('net.full');
  });

  it('falls back to a general error', () => {
    expect(errorMessage(new Error('something odd'))).toBe('net.error');
    expect(errorMessage(undefined)).toBe('net.error');
  });
});
