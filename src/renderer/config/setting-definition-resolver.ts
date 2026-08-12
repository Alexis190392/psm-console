import {
  PALWORLD_SETTING_DEFINITIONS,
  type PalworldSettingDefinition
} from './palworld-settings-catalog';
import { PALWORLD_SETTINGS_CATEGORIES } from './palworld-settings-categories';
import { PALWORLD_SETTING_COPY } from './palworld-settings-copy';
import { BUNDLED_ZERO_TOGGLE_SETTINGS } from './palworld-settings-zero-toggles';
import type {
  PalworldSettingDefinitionFileEntryDto,
  PalworldSettingDefinitionOverrideDto,
  PalworldSettingsDefinitionsFileDto
} from '../../shared/dto/palworld-settings-definitions.dto';

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

let externalDefinitions: Record<string, PalworldSettingDefinitionOverrideDto> = {};

export function setExternalSettingDefinitions(definitions: Record<string, PalworldSettingDefinitionOverrideDto>): void {
  externalDefinitions = { ...definitions };
}

export function resetExternalSettingDefinitions(): void {
  externalDefinitions = {};
}

export function getSettingDefinition(key: string, value: string): PalworldSettingDefinition {
  const known = PALWORLD_SETTING_DEFINITIONS[key];
  const copy = PALWORLD_SETTING_COPY[key];
  const zeroToggle = BUNDLED_ZERO_TOGGLE_SETTINGS[key];
  const override = externalDefinitions[key];

  const base: PalworldSettingDefinition = known ?? {
    key,
    group: PALWORLD_SETTINGS_CATEGORIES.OTHER,
    kind: inferSettingKind(value)
  };

  return {
    ...base,
    ...(copy ?? {}),
    ...(zeroToggle ? { zeroToggle: omitKey(zeroToggle) } : {}),
    ...(override ?? {}),
    key
  };
}

export function getBundledSettingsDefinitionsFile(): PalworldSettingsDefinitionsFileDto {
  const keys = new Set([
    ...Object.keys(PALWORLD_SETTING_DEFINITIONS),
    ...Object.keys(PALWORLD_SETTING_COPY),
    ...Object.keys(BUNDLED_ZERO_TOGGLE_SETTINGS)
  ]);

  const parametros: Record<string, PalworldSettingDefinitionFileEntryDto> = {};
  keys.forEach((key) => {
    const technical = PALWORLD_SETTING_DEFINITIONS[key];
    const copy = PALWORLD_SETTING_COPY[key];
    const zeroToggle = BUNDLED_ZERO_TOGGLE_SETTINGS[key];
    parametros[key] = removeUndefined({
      titulo: copy?.label ?? technical?.label,
      descripcion: copy?.help ?? technical?.help,
      categoria: copy?.group ?? technical?.group,
      tipo: technical?.kind,
      rango: copy?.range ?? technical?.range,
      minimo: technical?.min,
      maximo: technical?.max,
      paso: technical?.step,
      opciones: technical?.options,
      cero: zeroToggle ? {
        valorCero: zeroToggle.zeroValue,
        valorPredeterminado: zeroToggle.defaultValue,
        etiquetaActiva: zeroToggle.enabledLabel,
        etiquetaDesactivada: zeroToggle.disabledLabel
      } : undefined
    });
  });

  return { version: 1, parametros };
}

function omitKey(setting: { key: string; zeroValue: string; defaultValue: string; enabledLabel: string; disabledLabel: string }): PalworldSettingDefinition['zeroToggle'] {
  return {
    zeroValue: setting.zeroValue,
    defaultValue: setting.defaultValue,
    enabledLabel: setting.enabledLabel,
    disabledLabel: setting.disabledLabel
  };
}

function removeUndefined(entry: PalworldSettingDefinitionFileEntryDto): PalworldSettingDefinitionFileEntryDto {
  return Object.fromEntries(
    Object.entries(entry).filter(([, value]) => value !== undefined)
  );
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
