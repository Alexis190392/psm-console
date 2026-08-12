export type PalworldSettingInputType = 'text' | 'number' | 'boolean' | 'select';

export interface PalworldZeroToggleDefinitionDto {
  valorCero: string;
  valorPredeterminado: string;
  etiquetaActiva: string;
  etiquetaDesactivada: string;
}

/**
 * Forma editable almacenada en palworld-settings.definitions.json.
 * Los campos omitidos conservan el comportamiento inferido por PSM Console.
 */
export interface PalworldSettingDefinitionFileEntryDto {
  titulo?: string;
  descripcion?: string;
  categoria?: string;
  tipo?: PalworldSettingInputType;
  rango?: string;
  minimo?: number;
  maximo?: number;
  paso?: number;
  opciones?: string[];
  cero?: PalworldZeroToggleDefinitionDto;
}

export interface PalworldSettingsDefinitionsFileDto {
  version: 1;
  parametros: Record<string, PalworldSettingDefinitionFileEntryDto>;
}

export interface PalworldSettingDefinitionOverrideDto {
  label?: string;
  help?: string;
  group?: string;
  kind?: PalworldSettingInputType;
  range?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  zeroToggle?: {
    zeroValue: string;
    defaultValue: string;
    enabledLabel: string;
    disabledLabel: string;
  };
}

export interface PalworldSettingsDefinitionsStatusDto {
  relativePath: string;
  definitions: Record<string, PalworldSettingDefinitionOverrideDto>;
}
