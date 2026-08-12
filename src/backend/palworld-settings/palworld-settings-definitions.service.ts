import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import {
  getBundledSettingsDefinitionsFile,
  setExternalSettingDefinitions
} from '../../renderer/config/setting-definition-resolver';
import type {
  PalworldSettingInputType,
  PalworldSettingDefinitionOverrideDto,
  PalworldSettingsDefinitionsFileDto,
  PalworldSettingsDefinitionsStatusDto,
  PalworldZeroToggleDefinitionDto
} from '../../shared/dto/palworld-settings-definitions.dto';
import { PortablePathService } from '../portable-path/portable-path.service';

const DEFINITIONS_FILE_NAME = 'palworld-settings.definitions.json';
const SETTING_TYPES = new Set(['text', 'number', 'boolean', 'select']);

@Injectable()
export class PalworldSettingsDefinitionsService implements OnApplicationBootstrap {
  private status: PalworldSettingsDefinitionsStatusDto | null = null;
  private loading: Promise<PalworldSettingsDefinitionsStatusDto> | null = null;

  constructor(private readonly portablePathService: PortablePathService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.ensureLoaded();
  }

  async ensureLoaded(): Promise<PalworldSettingsDefinitionsStatusDto> {
    if (this.status) {
      return this.status;
    }

    this.loading ??= this.load();
    this.status = await this.loading;
    return this.status;
  }

  private async load(): Promise<PalworldSettingsDefinitionsStatusDto> {
    const configRoot = this.portablePathService.getApplicationConfigRoot();
    const path = join(configRoot, DEFINITIONS_FILE_NAME);
    const bundled = getBundledSettingsDefinitionsFile();

    if (!existsSync(path)) {
      await mkdir(configRoot, { recursive: true });
      await writeFile(path, `${JSON.stringify(bundled, null, 2)}\n`, 'utf8');
    }

    const definitions = await this.readDefinitions(path);
    setExternalSettingDefinitions(definitions);

    return {
      relativePath: relative(this.portablePathService.getPortableRoot(), path) || DEFINITIONS_FILE_NAME,
      definitions
    };
  }

  private async readDefinitions(path: string): Promise<Record<string, PalworldSettingDefinitionOverrideDto>> {
    try {
      const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown;
      if (!isDefinitionsFile(parsed)) {
        return {};
      }

      return Object.entries(parsed.parametros).reduce<Record<string, PalworldSettingDefinitionOverrideDto>>(
        (definitions, [key, entry]) => {
          const normalized = normalizeDefinitionEntry(entry);
          if (normalized) {
            definitions[key] = normalized;
          }
          return definitions;
        },
        {}
      );
    } catch {
      return {};
    }
  }
}

function isDefinitionsFile(value: unknown): value is PalworldSettingsDefinitionsFileDto {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<PalworldSettingsDefinitionsFileDto>;
  return candidate.version === 1 && isRecord(candidate.parametros);
}

function normalizeDefinitionEntry(value: unknown): PalworldSettingDefinitionOverrideDto | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const tipo = typeof value.tipo === 'string' && SETTING_TYPES.has(value.tipo)
    ? value.tipo as PalworldSettingInputType
    : undefined;
  const opciones = Array.isArray(value.opciones) && value.opciones.every((option) => typeof option === 'string')
    ? [...value.opciones]
    : undefined;
  const zeroToggle = normalizeZeroToggle(value.cero);
  const entry: PalworldSettingDefinitionOverrideDto = {
    ...(readText(value.titulo) ? { label: readText(value.titulo) } : {}),
    ...(readText(value.descripcion) ? { help: readText(value.descripcion) } : {}),
    ...(readText(value.categoria) ? { group: readText(value.categoria) } : {}),
    ...(tipo ? { kind: tipo } : {}),
    ...(readText(value.rango) ? { range: readText(value.rango) } : {}),
    ...(readNumber(value.minimo) !== undefined ? { min: readNumber(value.minimo) } : {}),
    ...(readNumber(value.maximo) !== undefined ? { max: readNumber(value.maximo) } : {}),
    ...(readNumber(value.paso) !== undefined ? { step: readNumber(value.paso) } : {}),
    ...(opciones ? { options: opciones } : {}),
    ...(zeroToggle ? { zeroToggle } : {})
  };

  return Object.keys(entry).length > 0 ? entry : undefined;
}

function normalizeZeroToggle(value: unknown): PalworldSettingDefinitionOverrideDto['zeroToggle'] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const zero = value as Partial<PalworldZeroToggleDefinitionDto>;
  const fields = [zero.valorCero, zero.valorPredeterminado, zero.etiquetaActiva, zero.etiquetaDesactivada];
  if (!fields.every((field) => typeof field === 'string' && field.trim().length > 0)) {
    return undefined;
  }

  return {
    zeroValue: fields[0] as string,
    defaultValue: fields[1] as string,
    enabledLabel: fields[2] as string,
    disabledLabel: fields[3] as string
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
