import { describe, expect, it, beforeAll } from 'vitest';
import { loadEnglish, translate } from '../src/i18n';
import { voiceAudience, voicePermission } from '../src/net/voice';

beforeAll(async () => {
  await loadEnglish();
});

/** Every key that the interface uses has to exist in both languages. */
const REQUIRED_KEYS = [
  'menu.custom',
  'menu.find',
  'setup.title',
  'setup.roomName',
  'setup.password',
  'setup.usePassword',
  'setup.maxPlayers',
  'setup.roleSet',
  'setup.roleSetCustom',
  'setup.allowIncomplete',
  'setup.timers',
  'setup.manualPhases',
  'setup.openByLink',
  'setup.fillWithBots',
  'setup.voice',
  'setup.resetRoles',
  'setup.maniacRule',
  'setup.maniacRuleAlone',
  'setup.maniacRuleFaction',
  'find.title',
  'find.quick',
  'find.list',
  'find.locked',
  'find.status.open',
  'find.status.ready',
  'find.status.playing',
  'find.status.full',
  'find.join',
  'roleset.total',
  'roleset.seats',
  'roleset.mismatch',
  'rules.voteRule',
  'rules.voteRuleShort',
  'rules.cityShort',
  'rules.mafiaShort',
  'rules.maniacShort',
  'lobby.ready',
  'lobby.unready',
  'lobby.readyCount',
  'lobby.settings',
  'lobby.passwordApply',
  'lobby.passwordRemove',
  'lobby.kickAsk',
  'lobby.kickTitle',
  'lobby.kickYes',
  'lobby.kickNo',
  'voice.title',
  'voice.start',
  'voice.stop',
  'voice.warning',
  'table.confirmNight',
  'table.nightLocked',
  'table.manualPhases',
  'table.check.maniac',
  'role.sheriff.name',
  'role.sheriff.desc',
  'join.password',
  'join.passwordSubmit',
  'net.passwordRequired',
  'net.wrongPassword',
  'net.noDiscovery',
  'err.dead',
  'err.manual',
  'err.composition',
  'err.notReady',
  'err.voteOpen',
  'err.cooldown',
];

describe('localization', () => {
  it('describes every role in both languages', async () => {
    await loadEnglish();
    const { ROLE_ORDER, ROLE_INFO } = await import('../src/game/roles');
    for (const role of ROLE_ORDER) {
      for (const part of ['name', 'desc', 'ability', 'when', 'limit', 'visibility']) {
        const key = `role.${role}.${part}`;
        expect(translate('ru', key), `missing RU ${key}`).not.toBe(key);
        expect(translate('en', key), `missing EN ${key}`).not.toBe(key);
      }
      const factionKey = `role.faction.${ROLE_INFO[role].faction}`;
      expect(translate('ru', factionKey)).not.toBe(factionKey);
      expect(translate('en', factionKey)).not.toBe(factionKey);
    }
  });

  it('keeps the same set of keys in both languages', async () => {
    await loadEnglish();
    const source = import.meta.glob('../src/i18n*.ts*', {
      eager: true,
      query: '?raw',
      import: 'default',
    }) as Record<string, string>;
    const ru = source['../src/i18n.tsx'] ?? '';
    const en = source['../src/i18n.en.ts'] ?? '';
    const keys = (text: string) =>
      new Set([...text.matchAll(/^  '([a-zA-Z0-9._]+)':/gm)].map((match) => match[1]));
    const ruKeys = keys(ru);
    const enKeys = keys(en);
    for (const key of ruKeys) expect(enKeys.has(key), `EN misses ${key}`).toBe(true);
    for (const key of enKeys) expect(ruKeys.has(key), `RU misses ${key}`).toBe(true);
  });

  it('translates every new setting into Russian and English', () => {
    for (const key of REQUIRED_KEYS) {
      const ru = translate('ru', key);
      const en = translate('en', key);
      expect(ru, `missing RU key ${key}`).not.toBe(key);
      expect(en, `missing EN key ${key}`).not.toBe(key);
      expect(ru.length).toBeGreaterThan(1);
      expect(en.length).toBeGreaterThan(1);
    }
  });

  it('keeps the placeholders of the new strings', () => {
    expect(translate('ru', 'lobby.readyCount', { ready: 3, total: 8 })).toContain('3');
    expect(translate('ru', 'lobby.readyCount', { ready: 3, total: 8 })).toContain('8');
    expect(translate('en', 'roleset.total', { n: 9 })).toContain('9');
    expect(translate('ru', 'setup.maxPlayersHint', { max: 24 })).toContain('24');
  });

  it('describes the new rules in both languages', () => {
    expect(translate('ru', 'rules.voteRule')).toContain('голос');
    expect(translate('en', 'rules.voteRule')).toContain('vote');
    expect(translate('ru', 'rules.p2')).toContain('шериф');
    expect(translate('en', 'rules.p2')).toContain('sheriff');
  });
});

describe('voice access', () => {
  it('allows the microphone during the discussion', () => {
    expect(
      voicePermission({ phase: 'discussion', alive: true, isMafia: false, roleEnabled: true }),
    ).toBe('allowed');
  });

  it('allows the microphone for the mafia at night', () => {
    expect(
      voicePermission({ phase: 'night', alive: true, isMafia: true, roleEnabled: true }),
    ).toBe('allowed');
  });

  it('closes the microphone for everybody else at night', () => {
    expect(
      voicePermission({ phase: 'night', alive: true, isMafia: false, roleEnabled: true }),
    ).toBe('notNow');
  });

  it('keeps dead players in the spectator channel', () => {
    expect(
      voicePermission({ phase: 'discussion', alive: false, isMafia: false, roleEnabled: true }),
    ).toBe('allowed');
    expect(voiceAudience(false)).toBe('dead');
    expect(voiceAudience(true)).toBe('alive');
  });

  it('closes the microphone when the room does not allow it', () => {
    expect(
      voicePermission({ phase: 'discussion', alive: true, isMafia: false, roleEnabled: false }),
    ).toBe('denied');
  });
});
