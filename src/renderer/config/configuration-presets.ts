export const CONFIGURATION_PRESETS = [
  {
    id: 'casual',
    label: 'Casual',
    values: {
      DeathPenalty: 'Item',
      ExpRate: '1.500000',
      PalCaptureRate: '1.250000',
      CollectionDropRate: '1.250000',
      WorkSpeedRate: '1.250000'
    }
  },
  {
    id: 'farm',
    label: 'Farm rapido',
    values: {
      ExpRate: '2.000000',
      PalCaptureRate: '1.500000',
      CollectionDropRate: '2.000000',
      CollectionObjectRespawnSpeedRate: '2.000000',
      WorkSpeedRate: '2.000000',
      PalEggDefaultHatchingTime: '0.500000'
    }
  },
  {
    id: 'hard',
    label: 'Dificil',
    values: {
      DeathPenalty: 'All',
      ExpRate: '0.750000',
      PalCaptureRate: '0.750000',
      PlayerDamageRateAttack: '0.850000',
      PlayerDamageRateDefense: '1.250000',
      EnemyDropItemRate: '0.850000'
    }
  },
  {
    id: 'solo-friends',
    label: 'Solo amigos',
    values: {
      ServerPlayerMaxNum: '8',
      RCONEnabled: 'False',
      RESTAPIEnabled: 'False',
      bShowPlayerList: 'False',
      bEnableNonLoginPenalty: 'True'
    }
  }
] as const;

export type ConfigurationPreset = (typeof CONFIGURATION_PRESETS)[number];

