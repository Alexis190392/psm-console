import { describe, expect, it } from 'vitest';
import {
  getZeroToggleSetting,
  isZeroSettingValue,
  ZERO_TOGGLE_SETTINGS
} from '../src/renderer/config/zero-toggle-settings';

describe('zero toggle settings', () => {
  it('includes the supported optional numeric settings', () => {
    expect(Object.keys(ZERO_TOGGLE_SETTINGS)).toEqual(
      expect.arrayContaining([
        'PalEggDefaultHatchingTime',
        'BuildObjectDeteriorationDamageRate',
        'BuildObjectDamageRate',
        'EquipmentDurabilityDamageRate',
        'ItemCorruptionMultiplier',
        'PlayerStomachDecreaceRate',
        'PlayerStaminaDecreaceRate',
        'PalStomachDecreaceRate',
        'PalStaminaDecreaceRate',
        'MaxBuildingLimitNum',
        'GuildRejoinCooldownMinutes'
      ])
    );
    expect(getZeroToggleSetting('RespawnPenaltyDurationThreshold')).toBeUndefined();
  });

  it('recognizes equivalent zero formats', () => {
    expect(isZeroSettingValue('0')).toBe(true);
    expect(isZeroSettingValue('0.000000')).toBe(true);
    expect(isZeroSettingValue('0.1')).toBe(false);
  });
});
