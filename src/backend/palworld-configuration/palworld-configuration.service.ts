import { Injectable } from '@nestjs/common';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { OperationManagerService } from '../operations/operation-manager.service';
import { PortablePathService } from '../portable-path/portable-path.service';
import { PortableStateService } from '../portable-state/portable-state.service';
import type {
  PalworldConfigurationFileDto,
  PalworldRestoreDefaultConfigurationRequestDto,
  PalworldSaveConfigurationRequestDto
} from '../../shared/dto/palworld-configuration-file.dto';
import type { OperationAcceptedDto } from '../../shared/dto/operation-progress.dto';
import type {
  PalworldConfigurationStatusDto,
  PalworldCreateDefaultConfigurationRequestDto
} from '../../shared/dto/palworld-configuration-status.dto';

const DEFAULT_ADMIN_PASSWORD = 'admin';

@Injectable()
export class PalworldConfigurationService {
  constructor(
    private readonly portablePathService: PortablePathService,
    private readonly operationManagerService: OperationManagerService,
    private readonly portableStateService: PortableStateService
  ) {}

  getStatus(): PalworldConfigurationStatusDto {
    const state = this.portableStateService.read();
    const persistedActivePath = state.configuration?.activePath;
    const templatePath =
      persistedActivePath && existsSync(persistedActivePath)
        ? state.configuration?.templatePath ?? this.getTemplatePath()
        : this.getTemplatePath();
    const activePath = persistedActivePath && existsSync(persistedActivePath) ? persistedActivePath : this.getActivePath();
    const isReady = this.isUsableConfigurationFile(activePath);

    if (isReady) {
      this.portableStateService.rememberConfiguration(templatePath, activePath);
    }

    return {
      status: isReady ? 'READY' : 'MISSING',
      templatePath,
      activePath,
      message: isReady
        ? 'La configuracion activa existe.'
        : existsSync(activePath)
          ? 'La configuracion activa existe, pero esta vacia o no contiene OptionSettings valido.'
          : 'Falta crear la configuracion activa desde la plantilla instalada.'
    };
  }

  createDefault(request: PalworldCreateDefaultConfigurationRequestDto): OperationAcceptedDto {
    if (!request.confirmed) {
      throw new Error('CONFIGURATION_CREATE_DEFAULT_REQUIRES_CONFIRMATION');
    }

    const operation = this.operationManagerService.create(
      'Creacion de configuracion inicial',
      'Preparando configuracion inicial de Palworld.'
    );

    void this.createDefaultAsync(operation.operationId);

    return {
      operationId: operation.operationId
    };
  }

  async readActive(): Promise<PalworldConfigurationFileDto> {
    const activePath = this.getStatus().activePath;

    if (!existsSync(activePath)) {
      throw new Error(`ACTIVE_CONFIGURATION_NOT_FOUND: ${activePath}`);
    }

    const content = await readFile(activePath, 'utf8');
    if (!this.isUsableConfigurationContent(content)) {
      throw new Error(`ACTIVE_CONFIGURATION_INVALID: ${activePath}`);
    }

    const normalizedContent = await this.ensureAdminPassword(activePath, content);

    return {
      path: activePath,
      content: normalizedContent,
      updatedAt: new Date().toISOString()
    };
  }

  saveActive(request: PalworldSaveConfigurationRequestDto): OperationAcceptedDto {
    if (!request.confirmed) {
      throw new Error('CONFIGURATION_SAVE_REQUIRES_CONFIRMATION');
    }

    const operation = this.operationManagerService.create(
      'Guardado de configuracion',
      'Preparando guardado seguro de PalWorldSettings.ini.'
    );

    void this.saveActiveAsync(operation.operationId, request.content);

    return {
      operationId: operation.operationId
    };
  }

  restoreDefault(request: PalworldRestoreDefaultConfigurationRequestDto): OperationAcceptedDto {
    if (!request.confirmed) {
      throw new Error('CONFIGURATION_RESTORE_DEFAULT_REQUIRES_CONFIRMATION');
    }

    const operation = this.operationManagerService.create(
      'Restauracion de configuracion default',
      'Preparando restauracion desde DefaultPalWorldSettings.ini.'
    );

    void this.restoreDefaultAsync(operation.operationId);

    return {
      operationId: operation.operationId
    };
  }

  private async createDefaultAsync(operationId: string): Promise<void> {
    const templatePath = this.getTemplatePath();
    const activePath = this.getActivePath();

    try {
      if (!existsSync(templatePath)) {
        throw new Error(`DEFAULT_CONFIGURATION_TEMPLATE_NOT_FOUND: ${templatePath}`);
      }

      await this.assertUsableConfigurationFile(templatePath, 'DEFAULT_CONFIGURATION_TEMPLATE_INVALID');

      if (this.isUsableConfigurationFile(activePath)) {
        this.portableStateService.rememberConfiguration(templatePath, activePath);
        this.operationManagerService.update(operationId, {
          status: 'COMPLETED',
          percent: 100,
          message: 'La configuracion activa ya existia.'
        });
        return;
      }

      if (existsSync(activePath)) {
        const backupPath = join(
          this.portablePathService.getPortableRoot(),
          'backups',
          'configuration',
          `PalWorldSettings.invalid.${new Date().toISOString().replace(/[:.]/g, '-')}.ini`
        );
        await mkdir(dirname(backupPath), { recursive: true });
        await copyFile(activePath, backupPath);
        this.operationManagerService.appendLog(operationId, `backup invalid "${activePath}" "${backupPath}"`);
      }

      this.operationManagerService.update(operationId, {
        status: 'RUNNING',
        percent: 30,
        message: `Creando carpeta ${dirname(activePath)}`
      });
      await mkdir(dirname(activePath), { recursive: true });
      this.operationManagerService.appendLog(operationId, `mkdir "${dirname(activePath)}"`);

      this.operationManagerService.update(operationId, {
        status: 'RUNNING',
        percent: 70,
        message: 'Copiando plantilla oficial como configuracion activa.'
      });
      this.operationManagerService.appendLog(operationId, `copy "${templatePath}" "${activePath}"`);
      const templateContent = await readFile(templatePath, 'utf8');
      await writeFile(
        activePath,
        applyInitialServerName(
          normalizeAdminPassword(templateContent),
          this.portablePathService.getSelectedInitialServerName()
        ),
        'utf8'
      );
      this.portableStateService.rememberConfiguration(templatePath, activePath);

      this.operationManagerService.update(operationId, {
        status: 'COMPLETED',
        percent: 100,
        message: 'Configuracion inicial creada correctamente.'
      });
    } catch (error) {
      this.operationManagerService.update(operationId, {
        status: 'FAILED',
        percent: 100,
        message: 'No se pudo crear la configuracion inicial.',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async saveActiveAsync(operationId: string, content: string): Promise<void> {
    const activePath = this.getStatus().activePath;

    try {
      if (!existsSync(activePath)) {
        throw new Error(`ACTIVE_CONFIGURATION_NOT_FOUND: ${activePath}`);
      }

      if (!this.isUsableConfigurationContent(content)) {
        throw new Error('CONFIGURATION_CONTENT_INVALID: falta OptionSettings valido.');
      }

      const backupPath = join(
        this.portablePathService.getPortableRoot(),
        'backups',
        'configuration',
        `PalWorldSettings.${new Date().toISOString().replace(/[:.]/g, '-')}.ini`
      );
      const tempPath = `${activePath}.tmp`;

      this.operationManagerService.update(operationId, {
        status: 'RUNNING',
        percent: 25,
        message: 'Creando backup de configuracion actual.'
      });
      await mkdir(dirname(backupPath), { recursive: true });
      await copyFile(activePath, backupPath);
      this.operationManagerService.appendLog(operationId, `copy "${activePath}" "${backupPath}"`);

      this.operationManagerService.update(operationId, {
        status: 'RUNNING',
        percent: 65,
        message: 'Escribiendo configuracion temporal.'
      });
      await writeFile(tempPath, normalizeAdminPassword(content), 'utf8');
      this.operationManagerService.appendLog(operationId, `write "${tempPath}"`);

      this.operationManagerService.update(operationId, {
        status: 'RUNNING',
        percent: 90,
        message: 'Reemplazando configuracion activa.'
      });
      await copyFile(tempPath, activePath);
      this.operationManagerService.appendLog(operationId, `replace "${activePath}"`);

      this.operationManagerService.update(operationId, {
        status: 'COMPLETED',
        percent: 100,
        message: 'Configuracion guardada correctamente.'
      });
    } catch (error) {
      this.operationManagerService.update(operationId, {
        status: 'FAILED',
        percent: 100,
        message: 'No se pudo guardar la configuracion.',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async restoreDefaultAsync(operationId: string): Promise<void> {
    const templatePath = this.getStatus().templatePath;
    const activePath = this.getStatus().activePath;

    try {
      if (!existsSync(templatePath)) {
        throw new Error(`DEFAULT_CONFIGURATION_TEMPLATE_NOT_FOUND: ${templatePath}`);
      }

      await this.assertUsableConfigurationFile(templatePath, 'DEFAULT_CONFIGURATION_TEMPLATE_INVALID');

      if (!existsSync(activePath)) {
        throw new Error(`ACTIVE_CONFIGURATION_NOT_FOUND: ${activePath}`);
      }

      const backupPath = join(
        this.portablePathService.getPortableRoot(),
        'backups',
        'configuration',
        `PalWorldSettings.before-default.${new Date().toISOString().replace(/[:.]/g, '-')}.ini`
      );

      this.operationManagerService.update(operationId, {
        status: 'RUNNING',
        percent: 30,
        message: 'Creando backup antes de restaurar defaults.'
      });
      await mkdir(dirname(backupPath), { recursive: true });
      await copyFile(activePath, backupPath);
      this.operationManagerService.appendLog(operationId, `copy "${activePath}" "${backupPath}"`);

      this.operationManagerService.update(operationId, {
        status: 'RUNNING',
        percent: 75,
        message: 'Copiando plantilla default como configuracion activa.'
      });
      const templateContent = await readFile(templatePath, 'utf8');
      await writeFile(activePath, normalizeAdminPassword(templateContent), 'utf8');
      this.operationManagerService.appendLog(operationId, `copy "${templatePath}" "${activePath}"`);

      this.operationManagerService.update(operationId, {
        status: 'COMPLETED',
        percent: 100,
        message: 'Configuracion restaurada a valores default.'
      });
    } catch (error) {
      this.operationManagerService.update(operationId, {
        status: 'FAILED',
        percent: 100,
        message: 'No se pudo restaurar la configuracion default.',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private getTemplatePath(): string {
    return join(this.portablePathService.getPalworldServerRoot(), 'DefaultPalWorldSettings.ini');
  }

  private getActivePath(): string {
    return join(
      this.portablePathService.getPalworldServerRoot(),
      'Pal',
      'Saved',
      'Config',
      'WindowsServer',
      'PalWorldSettings.ini'
    );
  }

  private isUsableConfigurationFile(path: string): boolean {
    if (!existsSync(path)) {
      return false;
    }

    try {
      return this.isUsableConfigurationContent(readFileSync(path, 'utf8'));
    } catch {
      return false;
    }
  }

  private async assertUsableConfigurationFile(path: string, code: string): Promise<void> {
    const content = await readFile(path, 'utf8');
    if (!this.isUsableConfigurationContent(content)) {
      throw new Error(`${code}: ${path}`);
    }
  }

  private isUsableConfigurationContent(content: string): boolean {
    const match = content.match(/OptionSettings=\(([\s\S]*)\)/);
    return Boolean(match?.[1]?.includes('='));
  }

  private async ensureAdminPassword(activePath: string, content: string): Promise<string> {
    const normalizedContent = normalizeAdminPassword(content);
    if (normalizedContent === content) {
      return content;
    }

    const backupPath = join(
      this.portablePathService.getPortableRoot(),
      'backups',
      'configuration',
      `PalWorldSettings.before-admin-password.${new Date().toISOString().replace(/[:.]/g, '-')}.ini`
    );

    await mkdir(dirname(backupPath), { recursive: true });
    await copyFile(activePath, backupPath);
    await writeFile(activePath, normalizedContent, 'utf8');

    return normalizedContent;
  }
}

function normalizeAdminPassword(content: string): string {
  const settings = parseOptionSettings(content);
  const currentValue = settings.get('AdminPassword');

  if (currentValue !== undefined && unquoteSetting(currentValue).trim().length > 0) {
    return content;
  }

  return upsertOptionSettings(content, new Map([['AdminPassword', `"${DEFAULT_ADMIN_PASSWORD}"`]]));
}

function applyInitialServerName(content: string, serverName: string | undefined): string {
  const normalizedName = serverName?.trim();
  if (!normalizedName) {
    return content;
  }

  const escapedName = normalizedName.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return upsertOptionSettings(content, new Map([['ServerName', `"${escapedName}"`]]));
}

function parseOptionSettings(content: string): Map<string, string> {
  const marker = 'OptionSettings=(';
  const start = content.indexOf(marker);
  if (start < 0) {
    return new Map();
  }

  const valueStart = start + marker.length;
  const valueEnd = findOptionSettingsEnd(content, valueStart);
  if (valueEnd < valueStart) {
    return new Map();
  }

  return splitTopLevel(content.slice(valueStart, valueEnd)).reduce((settings, entry) => {
    const separator = entry.indexOf('=');
    if (separator <= 0) {
      return settings;
    }

    settings.set(entry.slice(0, separator).trim(), entry.slice(separator + 1).trim());
    return settings;
  }, new Map<string, string>());
}

function upsertOptionSettings(content: string, updates: Map<string, string>): string {
  const marker = 'OptionSettings=(';
  const start = content.indexOf(marker);
  if (start < 0) {
    throw new Error('CONFIGURATION_CONTENT_INVALID: falta OptionSettings.');
  }

  const valueStart = start + marker.length;
  const valueEnd = findOptionSettingsEnd(content, valueStart);
  if (valueEnd < valueStart) {
    throw new Error('CONFIGURATION_CONTENT_INVALID: OptionSettings incompleto.');
  }

  const entries = splitTopLevel(content.slice(valueStart, valueEnd));
  const seen = new Set<string>();
  const nextEntries = entries.map((entry) => {
    const separator = entry.indexOf('=');
    if (separator <= 0) {
      return entry;
    }

    const key = entry.slice(0, separator).trim();
    const update = updates.get(key);
    if (update === undefined) {
      return entry;
    }

    seen.add(key);
    return `${key}=${update}`;
  });

  updates.forEach((value, key) => {
    if (!seen.has(key)) {
      nextEntries.push(`${key}=${value}`);
    }
  });

  return `${content.slice(0, valueStart)}${nextEntries.join(',')}${content.slice(valueEnd)}`;
}

function findOptionSettingsEnd(content: string, valueStart: number): number {
  let isQuoted = false;
  let depth = 0;

  for (let index = valueStart; index < content.length; index += 1) {
    const char = content[index];

    if (char === '"' && content[index - 1] !== '\\') {
      isQuoted = !isQuoted;
      continue;
    }

    if (!isQuoted && char === '(') {
      depth += 1;
      continue;
    }

    if (!isQuoted && char === ')' && depth > 0) {
      depth -= 1;
      continue;
    }

    if (!isQuoted && char === ')') {
      return index;
    }
  }

  return -1;
}

function splitTopLevel(value: string): string[] {
  const result: string[] = [];
  let current = '';
  let isQuoted = false;
  let depth = 0;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index] ?? '';

    if (char === '"' && value[index - 1] !== '\\') {
      isQuoted = !isQuoted;
    }

    if (!isQuoted && char === '(') {
      depth += 1;
    }

    if (!isQuoted && char === ')') {
      depth -= 1;
    }

    if (char === ',' && !isQuoted && depth === 0) {
      result.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    result.push(current.trim());
  }

  return result;
}

function unquoteSetting(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}
