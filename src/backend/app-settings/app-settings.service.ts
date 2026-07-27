import { Injectable } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { PortablePathService } from '../portable-path/portable-path.service';
import {
  DEFAULT_BACKUP_POLICY,
  DEFAULT_SERVER_IDLE_POLICY
} from '../../shared/constants/app-settings-defaults';
import type { AppSettingsDto, AppSettingsStatusDto } from '../../shared/dto/app-settings.dto';
import type { BackupPolicyDto } from '../../shared/dto/backup-status.dto';
import type { ServerIdlePolicyDto } from '../../shared/dto/server-idle-policy.dto';

const APP_SETTINGS_SCHEMA_VERSION = 1;

@Injectable()
export class AppSettingsService {
  constructor(private readonly portablePathService: PortablePathService) {}

  async getStatus(): Promise<AppSettingsStatusDto> {
    return {
      settings: await this.read(),
      portableRoot: this.portablePathService.getPortableRoot(),
      settingsRelativePath: 'config/app-settings.json',
      logsRelativePath: 'logs/',
      backupsRelativePath: 'backups/'
    };
  }

  async read(): Promise<AppSettingsDto> {
    const path = this.getSettingsPath();
    if (existsSync(path)) {
      try {
        return validateSettings(JSON.parse(await readFile(path, 'utf8')) as Partial<AppSettingsDto>);
      } catch {
        return createDefaultSettings();
      }
    }

    const migrated = await this.readLegacySettings();
    await this.write(migrated);
    return migrated;
  }

  async updateBackupPolicy(policy: BackupPolicyDto): Promise<BackupPolicyDto> {
    const settings = await this.read();
    settings.automation.backups = validateBackupPolicy(policy);
    await this.write(settings);
    return settings.automation.backups;
  }

  async updateIdlePolicy(policy: ServerIdlePolicyDto): Promise<ServerIdlePolicyDto> {
    const settings = await this.read();
    settings.automation.idleShutdown = validateIdlePolicy(policy);
    await this.write(settings);
    return settings.automation.idleShutdown;
  }

  private async readLegacySettings(): Promise<AppSettingsDto> {
    const settings = createDefaultSettings();
    settings.automation.backups = await readLegacyJson(
      join(this.portablePathService.getConfigRoot(), 'backup-policy.json'),
      settings.automation.backups,
      validateBackupPolicy
    );
    settings.automation.idleShutdown = await readLegacyJson(
      join(this.portablePathService.getConfigRoot(), 'server-idle-policy.json'),
      settings.automation.idleShutdown,
      validateIdlePolicy
    );
    return settings;
  }

  private async write(settings: AppSettingsDto): Promise<void> {
    const validated = validateSettings(settings);
    const path = this.getSettingsPath();
    const temporaryPath = `${path}.${randomUUID()}.tmp`;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(temporaryPath, JSON.stringify(validated, null, 2), 'utf8');
    await rename(temporaryPath, path);
  }

  private getSettingsPath(): string {
    return join(this.portablePathService.getConfigRoot(), 'app-settings.json');
  }
}

function createDefaultSettings(): AppSettingsDto {
  return {
    schemaVersion: APP_SETTINGS_SCHEMA_VERSION,
    automation: {
      idleShutdown: { ...DEFAULT_SERVER_IDLE_POLICY },
      backups: { ...DEFAULT_BACKUP_POLICY }
    }
  };
}

function validateSettings(settings: Partial<AppSettingsDto>): AppSettingsDto {
  if (settings.schemaVersion !== APP_SETTINGS_SCHEMA_VERSION || !settings.automation) {
    throw new Error('APP_SETTINGS_SCHEMA_UNSUPPORTED');
  }
  return {
    schemaVersion: APP_SETTINGS_SCHEMA_VERSION,
    automation: {
      idleShutdown: validateIdlePolicy(settings.automation.idleShutdown),
      backups: validateBackupPolicy(settings.automation.backups)
    }
  };
}

function validateBackupPolicy(policy: BackupPolicyDto): BackupPolicyDto {
  if (typeof policy.automaticEnabled !== 'boolean' || typeof policy.compressWorldBackups !== 'boolean') {
    throw new Error('BACKUP_POLICY_BOOLEAN_INVALID');
  }
  if (!Number.isInteger(policy.automaticIntervalHours) || policy.automaticIntervalHours < 1 || policy.automaticIntervalHours > 168) {
    throw new Error('BACKUP_POLICY_INTERVAL_OUT_OF_RANGE');
  }
  if (!Number.isInteger(policy.automaticRetentionPerType) || policy.automaticRetentionPerType < 1 || policy.automaticRetentionPerType > 100) {
    throw new Error('BACKUP_POLICY_RETENTION_OUT_OF_RANGE');
  }
  return { ...policy };
}

function validateIdlePolicy(policy: ServerIdlePolicyDto): ServerIdlePolicyDto {
  if (typeof policy.enabled !== 'boolean') {
    throw new Error('SERVER_IDLE_POLICY_ENABLED_INVALID');
  }
  if (!Number.isInteger(policy.emptySeconds) || policy.emptySeconds < 10 || policy.emptySeconds > 86_400) {
    throw new Error('SERVER_IDLE_POLICY_SECONDS_OUT_OF_RANGE');
  }
  return { ...policy };
}

async function readLegacyJson<T>(
  path: string,
  fallback: T,
  validate: (value: T) => T
): Promise<T> {
  if (!existsSync(path)) {
    return { ...fallback };
  }
  try {
    return validate({ ...fallback, ...JSON.parse(await readFile(path, 'utf8')) } as T);
  } catch {
    return { ...fallback };
  }
}
