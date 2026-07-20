import { describe, expect, it } from 'vitest';
import {
  formatSettingValue,
  parsePalworldSettings,
  serializePalworldSettings,
  unquoteSettingValue
} from '../src/renderer/config/palworld-settings-parser';
import type { PalworldSettingDefinition } from '../src/renderer/config/palworld-settings-catalog';

describe('palworld settings parser', () => {
  it('preserves commas inside quoted values', () => {
    const parsed = parsePalworldSettings(
      '[/Script/Pal.PalGameWorldSettings]\nOptionSettings=(ServerName="Uno, Dos",PublicPort=8211,bIsMultiplay=True)'
    );

    expect(parsed.settings).toEqual([
      { key: 'ServerName', value: '"Uno, Dos"' },
      { key: 'PublicPort', value: '8211' },
      { key: 'bIsMultiplay', value: 'True' }
    ]);
  });

  it('serializes changed values without removing unknown settings', () => {
    const parsed = parsePalworldSettings('OptionSettings=(PublicPort=8211,UnknownSetting="keep")');
    const values = new Map([
      ['PublicPort', '8222'],
      ['UnknownSetting', '"keep"']
    ]);

    expect(serializePalworldSettings(parsed, values)).toBe('OptionSettings=(PublicPort=8222,UnknownSetting="keep")');
  });

  it('formats text values only when the INI requires quotes', () => {
    const definition: PalworldSettingDefinition = {
      key: 'ServerName',
      label: 'Nombre',
      group: 'Servidor',
      kind: 'text',
      help: 'Nombre visible'
    };

    expect(formatSettingValue(definition, 'Mi servidor', '')).toBe('"Mi servidor"');
    expect(formatSettingValue(definition, 'Servidor', '')).toBe('Servidor');
    expect(unquoteSettingValue('"Mi servidor"')).toBe('Mi servidor');
  });
});
