export interface ZeroToggleSettingDefinition {
  key: string;
  zeroValue: string;
  defaultValue: string;
  enabledLabel: string;
  disabledLabel: string;
}

const DECIMAL_DEFAULT = '1.000000';

export const ZERO_TOGGLE_SETTINGS: Record<string, ZeroToggleSettingDefinition> = {
  PalEggDefaultHatchingTime: {
    key: 'PalEggDefaultHatchingTime',
    zeroValue: '0.000000',
    defaultValue: DECIMAL_DEFAULT,
    enabledLabel: 'Con tiempo',
    disabledLabel: 'Instantaneo'
  },
  BuildObjectDeteriorationDamageRate: {
    key: 'BuildObjectDeteriorationDamageRate',
    zeroValue: '0.000000',
    defaultValue: DECIMAL_DEFAULT,
    enabledLabel: 'Activo',
    disabledLabel: 'Sin deterioro'
  },
  BuildObjectDamageRate: {
    key: 'BuildObjectDamageRate',
    zeroValue: '0.000000',
    defaultValue: DECIMAL_DEFAULT,
    enabledLabel: 'Activo',
    disabledLabel: 'Sin dano'
  },
  EquipmentDurabilityDamageRate: {
    key: 'EquipmentDurabilityDamageRate',
    zeroValue: '0.000000',
    defaultValue: DECIMAL_DEFAULT,
    enabledLabel: 'Activo',
    disabledLabel: 'Sin desgaste'
  },
  ItemCorruptionMultiplier: {
    key: 'ItemCorruptionMultiplier',
    zeroValue: '0.000000',
    defaultValue: DECIMAL_DEFAULT,
    enabledLabel: 'Activo',
    disabledLabel: 'Sin deterioro'
  },
  PlayerStomachDecreaceRate: {
    key: 'PlayerStomachDecreaceRate',
    zeroValue: '0.000000',
    defaultValue: DECIMAL_DEFAULT,
    enabledLabel: 'Activo',
    disabledLabel: 'Sin hambre'
  },
  PlayerStaminaDecreaceRate: {
    key: 'PlayerStaminaDecreaceRate',
    zeroValue: '0.000000',
    defaultValue: DECIMAL_DEFAULT,
    enabledLabel: 'Activo',
    disabledLabel: 'Sin consumo'
  },
  PalStomachDecreaceRate: {
    key: 'PalStomachDecreaceRate',
    zeroValue: '0.000000',
    defaultValue: DECIMAL_DEFAULT,
    enabledLabel: 'Activo',
    disabledLabel: 'Sin hambre'
  },
  PalStaminaDecreaceRate: {
    key: 'PalStaminaDecreaceRate',
    zeroValue: '0.000000',
    defaultValue: DECIMAL_DEFAULT,
    enabledLabel: 'Activo',
    disabledLabel: 'Sin consumo'
  },
  MaxBuildingLimitNum: {
    key: 'MaxBuildingLimitNum',
    zeroValue: '0',
    defaultValue: '10000',
    enabledLabel: 'Limitado',
    disabledLabel: 'Sin limite'
  },
  GuildRejoinCooldownMinutes: {
    key: 'GuildRejoinCooldownMinutes',
    zeroValue: '0',
    defaultValue: '10',
    enabledLabel: 'Con espera',
    disabledLabel: 'Sin espera'
  }
};

export function getZeroToggleSetting(key: string): ZeroToggleSettingDefinition | undefined {
  return ZERO_TOGGLE_SETTINGS[key];
}

export function isZeroSettingValue(value: string): boolean {
  return Number(value) === 0;
}
