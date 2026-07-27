import { Injectable } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import { PortablePathService } from '../portable-path/portable-path.service';
import {
  DEFAULT_BACKUP_POLICY,
  DEFAULT_REMOTE_API_SETTINGS,
  DEFAULT_SERVER_IDLE_POLICY
} from '../../shared/constants/app-settings-defaults';
import type { AppSettingsDto, AppSettingsStatusDto } from '../../shared/dto/app-settings.dto';
import type { BackupPolicyDto } from '../../shared/dto/backup-status.dto';
import type {
  RemoteApiClientSettingsDto,
  RemoteApiProfile,
  RemoteApiSettingsDto,
  RemoteApiUpdateRequestDto
} from '../../shared/dto/remote-api.dto';
import type { ServerIdlePolicyDto } from '../../shared/dto/server-idle-policy.dto';
import type {
  StoredRemoteApiClientSettings,
  StoredRemoteApiSettings
} from '../remote-api/remote-api-settings.types';

const APP_SETTINGS_SCHEMA_VERSION = 3;
const PASSWORD_KEY_LENGTH = 64;
const scryptAsync = promisify(scrypt);

interface StoredAppSettings {
  schemaVersion: 3;
  automation: {
    idleShutdown: ServerIdlePolicyDto;
    backups: BackupPolicyDto;
  };
  remoteApi: StoredRemoteApiSettings;
}

interface LegacyAppSettings {
  schemaVersion?: number;
  automation?: {
    idleShutdown?: ServerIdlePolicyDto;
    backups?: BackupPolicyDto;
  };
  remoteApi?: Partial<StoredRemoteApiSettings>;
}

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
    return toPublicSettings(await this.readStored());
  }

  async getRemoteApiSettings(): Promise<StoredRemoteApiSettings> {
    const settings = (await this.readStored()).remoteApi;
    return {
      ...settings,
      client: {
        ...settings.client,
        permissions: [...settings.client.permissions]
      }
    };
  }

  async verifyRemoteApiCredentials(
    profile: RemoteApiProfile,
    username: string,
    password: string
  ): Promise<boolean> {
    const remoteApi = await this.getRemoteApiSettings();
    const settings = profile === 'CLIENT' ? remoteApi.client : remoteApi;
    if (
      username !== settings.username
      || !settings.passwordSalt
      || !settings.passwordHash
      || !password
    ) {
      return false;
    }

    const actualHash = await hashPassword(password, settings.passwordSalt);
    const expected = Buffer.from(settings.passwordHash, 'hex');
    const actual = Buffer.from(actualHash, 'hex');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  async updateRemoteApi(request: RemoteApiUpdateRequestDto): Promise<RemoteApiSettingsDto> {
    if (!request.confirmed) {
      throw new Error('REMOTE_API_UPDATE_REQUIRES_CONFIRMATION');
    }

    const settings = await this.readStored();
    const profile = request.profile ?? 'ADMIN';
    const current = profile === 'CLIENT' ? settings.remoteApi.client : settings.remoteApi;
    const username = validateRemoteApiUsername(request.username);
    const password = request.password?.trim() ?? '';
    let passwordSalt = current.passwordSalt;
    let passwordHash = current.passwordHash;

    if (password) {
      validateRemoteApiPassword(password);
      passwordSalt = randomBytes(24).toString('hex');
      passwordHash = await hashPassword(password, passwordSalt);
    }

    if (request.enabled && (!passwordSalt || !passwordHash)) {
      throw new Error('REMOTE_API_PASSWORD_REQUIRED');
    }

    if (profile === 'CLIENT') {
      settings.remoteApi.client = validateStoredRemoteApiClient({
        enabled: request.enabled,
        bindMode: request.bindMode,
        port: request.port,
        username,
        passwordSalt,
        passwordHash,
        permissions: request.permissions ?? settings.remoteApi.client.permissions
      });
      if (settings.remoteApi.client.enabled && settings.remoteApi.client.permissions.length === 0) {
        throw new Error('REMOTE_API_CLIENT_PERMISSION_REQUIRED');
      }
    } else {
      settings.remoteApi = validateStoredRemoteApi({
        ...settings.remoteApi,
        enabled: request.enabled,
        bindMode: request.bindMode,
        port: request.port,
        username,
        passwordSalt,
        passwordHash
      });
    }

    if (
      settings.remoteApi.enabled
      && settings.remoteApi.client.enabled
      && settings.remoteApi.port === settings.remoteApi.client.port
    ) {
      throw new Error('REMOTE_API_PORT_CONFLICT');
    }
    await this.write(settings);
    return toPublicRemoteApiSettings(settings.remoteApi);
  }

  async updateBackupPolicy(policy: BackupPolicyDto): Promise<BackupPolicyDto> {
    const settings = await this.readStored();
    settings.automation.backups = validateBackupPolicy(policy);
    await this.write(settings);
    return settings.automation.backups;
  }

  async updateIdlePolicy(policy: ServerIdlePolicyDto): Promise<ServerIdlePolicyDto> {
    const settings = await this.readStored();
    settings.automation.idleShutdown = validateIdlePolicy(policy);
    await this.write(settings);
    return settings.automation.idleShutdown;
  }

  private async readStored(): Promise<StoredAppSettings> {
    const path = this.getSettingsPath();
    if (existsSync(path)) {
      try {
        const parsed = JSON.parse(await readFile(path, 'utf8')) as LegacyAppSettings;
        const validated = validateSettings(parsed);
        if (parsed.schemaVersion !== APP_SETTINGS_SCHEMA_VERSION) {
          await this.write(validated);
        }
        return validated;
      } catch {
        return createDefaultSettings();
      }
    }

    const migrated = await this.readLegacySettings();
    await this.write(migrated);
    return migrated;
  }

  private async readLegacySettings(): Promise<StoredAppSettings> {
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

  private async write(settings: StoredAppSettings): Promise<void> {
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

function createDefaultSettings(): StoredAppSettings {
  return {
    schemaVersion: APP_SETTINGS_SCHEMA_VERSION,
    automation: {
      idleShutdown: { ...DEFAULT_SERVER_IDLE_POLICY },
      backups: { ...DEFAULT_BACKUP_POLICY }
    },
    remoteApi: {
      enabled: DEFAULT_REMOTE_API_SETTINGS.enabled,
      bindMode: DEFAULT_REMOTE_API_SETTINGS.bindMode,
      port: DEFAULT_REMOTE_API_SETTINGS.port,
      username: DEFAULT_REMOTE_API_SETTINGS.username,
      passwordSalt: '',
      passwordHash: '',
      client: {
        enabled: DEFAULT_REMOTE_API_SETTINGS.client.enabled,
        bindMode: DEFAULT_REMOTE_API_SETTINGS.client.bindMode,
        port: DEFAULT_REMOTE_API_SETTINGS.client.port,
        username: DEFAULT_REMOTE_API_SETTINGS.client.username,
        passwordSalt: '',
        passwordHash: '',
        permissions: [...DEFAULT_REMOTE_API_SETTINGS.client.permissions]
      }
    }
  };
}

function validateSettings(settings: LegacyAppSettings): StoredAppSettings {
  if (!settings.automation) {
    throw new Error('APP_SETTINGS_SCHEMA_UNSUPPORTED');
  }

  const defaults = createDefaultSettings();
  return {
    schemaVersion: APP_SETTINGS_SCHEMA_VERSION,
    automation: {
      idleShutdown: validateIdlePolicy(settings.automation.idleShutdown ?? defaults.automation.idleShutdown),
      backups: validateBackupPolicy(settings.automation.backups ?? defaults.automation.backups)
    },
    remoteApi: validateStoredRemoteApi({
      ...defaults.remoteApi,
      ...settings.remoteApi
    })
  };
}

function validateStoredRemoteApi(settings: Partial<StoredRemoteApiSettings>): StoredRemoteApiSettings {
  if (typeof settings.enabled !== 'boolean') {
    throw new Error('REMOTE_API_ENABLED_INVALID');
  }
  if (settings.bindMode !== 'LOCAL_ONLY' && settings.bindMode !== 'LOCAL_NETWORK') {
    throw new Error('REMOTE_API_BIND_MODE_INVALID');
  }
  if (
    typeof settings.port !== 'number'
    || !Number.isInteger(settings.port)
    || settings.port < 1024
    || settings.port > 65_535
  ) {
    throw new Error('REMOTE_API_PORT_OUT_OF_RANGE');
  }

  return {
    enabled: settings.enabled,
    bindMode: settings.bindMode,
    port: settings.port,
    username: validateRemoteApiUsername(settings.username ?? ''),
    passwordSalt: typeof settings.passwordSalt === 'string' ? settings.passwordSalt : '',
    passwordHash: typeof settings.passwordHash === 'string' ? settings.passwordHash : '',
    client: validateStoredRemoteApiClient(settings.client)
  };
}

function validateStoredRemoteApiClient(
  settings: Partial<StoredRemoteApiClientSettings> | undefined
): StoredRemoteApiClientSettings {
  const defaults = createDefaultSettings().remoteApi.client;
  const candidate = {
    ...defaults,
    ...settings
  };
  const bindMode: unknown = candidate.bindMode;
  if (typeof candidate.enabled !== 'boolean') {
    throw new Error('REMOTE_API_CLIENT_ENABLED_INVALID');
  }
  if (bindMode !== 'LOCAL_ONLY' && bindMode !== 'LOCAL_NETWORK') {
    throw new Error('REMOTE_API_CLIENT_BIND_MODE_INVALID');
  }
  if (
    typeof candidate.port !== 'number'
    || !Number.isInteger(candidate.port)
    || candidate.port < 1024
    || candidate.port > 65_535
  ) {
    throw new Error('REMOTE_API_CLIENT_PORT_OUT_OF_RANGE');
  }

  return {
    enabled: candidate.enabled,
    bindMode,
    port: candidate.port,
    username: validateRemoteApiUsername(candidate.username),
    passwordSalt: typeof candidate.passwordSalt === 'string' ? candidate.passwordSalt : '',
    passwordHash: typeof candidate.passwordHash === 'string' ? candidate.passwordHash : '',
    permissions: validateRemoteApiPermissions(candidate.permissions)
  };
}

function validateRemoteApiUsername(username: string): string {
  const normalized = username.trim();
  if (normalized.length < 3 || normalized.length > 64 || !/^[a-zA-Z0-9._-]+$/.test(normalized)) {
    throw new Error('REMOTE_API_USERNAME_INVALID');
  }
  return normalized;
}

function validateRemoteApiPassword(password: string): void {
  if (password.length < 5 || password.length > 128) {
    throw new Error('REMOTE_API_PASSWORD_INVALID');
  }
}

function validateRemoteApiPermissions(
  permissions: StoredRemoteApiClientSettings['permissions']
): StoredRemoteApiClientSettings['permissions'] {
  const allowed = new Set(['GENERAL', 'SERVER_CONTROL', 'PLAYERS', 'LOGS']);
  if (!Array.isArray(permissions) || permissions.some((permission) => !allowed.has(permission))) {
    throw new Error('REMOTE_API_CLIENT_PERMISSIONS_INVALID');
  }
  return [...new Set(permissions)];
}

function toPublicSettings(settings: StoredAppSettings): AppSettingsDto {
  return {
    schemaVersion: APP_SETTINGS_SCHEMA_VERSION,
    automation: {
      idleShutdown: { ...settings.automation.idleShutdown },
      backups: { ...settings.automation.backups }
    },
    remoteApi: toPublicRemoteApiSettings(settings.remoteApi)
  };
}

function toPublicRemoteApiSettings(settings: StoredRemoteApiSettings): RemoteApiSettingsDto {
  return {
    enabled: settings.enabled,
    bindMode: settings.bindMode,
    port: settings.port,
    username: settings.username,
    passwordConfigured: Boolean(settings.passwordSalt && settings.passwordHash),
    client: toPublicRemoteApiClientSettings(settings.client)
  };
}

function toPublicRemoteApiClientSettings(
  settings: StoredRemoteApiClientSettings
): RemoteApiClientSettingsDto {
  return {
    enabled: settings.enabled,
    bindMode: settings.bindMode,
    port: settings.port,
    username: settings.username,
    passwordConfigured: Boolean(settings.passwordSalt && settings.passwordHash),
    permissions: [...settings.permissions]
  };
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const key = await scryptAsync(password, salt, PASSWORD_KEY_LENGTH) as Buffer;
  return key.toString('hex');
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
