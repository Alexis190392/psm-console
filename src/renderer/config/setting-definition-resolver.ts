import {
  PALWORLD_SETTING_DEFINITIONS,
  type PalworldSettingDefinition
} from './palworld-settings-catalog';
import { PALWORLD_SETTINGS_CATEGORIES } from './palworld-settings-categories';
import { PALWORLD_SETTING_COPY } from './palworld-settings-copy';

const SELECT_OPTION_LABELS: Record<string, string> = {
  All: 'Todo',
  Easy: 'Facil',
  Hard: 'Dificil',
  Item: 'Items',
  ItemAndEquipment: 'Items y equipo',
  Json: 'JSON',
  None: 'Ninguno',
  Normal: 'Normal',
  Region: 'Por region',
  Text: 'Texto'
};

export function getSettingDefinition(key: string, value: string): PalworldSettingDefinition {
  const known = PALWORLD_SETTING_DEFINITIONS[key];
  const copy = PALWORLD_SETTING_COPY[key];

  const base: PalworldSettingDefinition = known ?? {
    key,
    group: PALWORLD_SETTINGS_CATEGORIES.OTHER,
    kind: inferSettingKind(value)
  };

  return copy ? { ...base, ...copy, key } : base;
}

export function inferSettingKind(value: string): 'text' | 'number' | 'boolean' {
  if (['true', 'false'].includes(value.toLowerCase())) {
    return 'boolean';
  }

  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return 'number';
  }

  return 'text';
}

export function formatSelectOptionLabel(option: string): string {
  return SELECT_OPTION_LABELS[option] ?? option;
}
