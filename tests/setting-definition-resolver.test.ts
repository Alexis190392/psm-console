import { describe, expect, it } from 'vitest';
import {
  formatSelectOptionLabel,
  getSettingDefinition,
  inferSettingKind,
  splitSettingKey
} from '../src/renderer/config/setting-definition-resolver';

describe('setting definition resolver', () => {
  it('resolves copied labels and keeps guild translated as gremio', () => {
    expect(getSettingDefinition('GuildPlayerMaxNum', '20').label).toContain('gremio');
    expect(splitSettingKey('BaseCampMaxNumInGuild')).toBe('Base Campamento Maximo Cantidad In Gremio');
  });

  it('infers fallback setting kinds', () => {
    expect(inferSettingKind('True')).toBe('boolean');
    expect(inferSettingKind('1.250000')).toBe('number');
    expect(inferSettingKind('Palworld')).toBe('text');
  });

  it('formats select option labels without changing values', () => {
    expect(formatSelectOptionLabel('ItemAndEquipment')).toBe('Items y equipo');
    expect(formatSelectOptionLabel('CustomValue')).toBe('CustomValue');
  });
});
