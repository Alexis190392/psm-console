import { getSettingDefinition } from './setting-definition-resolver';
import { BUNDLED_ZERO_TOGGLE_SETTINGS, type ZeroToggleSettingDefinition } from './palworld-settings-zero-toggles';

export type { ZeroToggleSettingDefinition } from './palworld-settings-zero-toggles';
export const ZERO_TOGGLE_SETTINGS = BUNDLED_ZERO_TOGGLE_SETTINGS;

export function getZeroToggleSetting(key: string): ZeroToggleSettingDefinition | undefined {
  const zeroToggle = getSettingDefinition(key, '').zeroToggle;
  return zeroToggle ? { key, ...zeroToggle } : undefined;
}

export function isZeroSettingValue(value: string): boolean {
  return Number(value) === 0;
}
