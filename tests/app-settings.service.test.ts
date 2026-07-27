import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AppSettingsService } from '../src/backend/app-settings/app-settings.service';
import { PortablePathService } from '../src/backend/portable-path/portable-path.service';

describe('AppSettingsService', () => {
  const portableRoot = join(process.cwd(), '.tmp-tests', 'app-settings');
  const paths = new PortablePathService({
    isPackaged: true,
    getPath: () => join(portableRoot, 'PSM Console.exe')
  });
  const service = new AppSettingsService(paths);

  afterEach(async () => {
    await rm(portableRoot, { recursive: true, force: true });
  });

  it('creates a versioned settings file with safe defaults', async () => {
    const settings = await service.read();
    const stored = JSON.parse(
      await readFile(join(paths.getConfigRoot(), 'app-settings.json'), 'utf8')
    ) as { schemaVersion: number };

    expect(settings.schemaVersion).toBe(4);
    expect(settings.automation.idleShutdown.enabled).toBe(false);
    expect(settings.remoteApi.enabled).toBe(false);
    expect(settings.remoteApi.passwordConfigured).toBe(false);
    expect(settings.remoteApi.client.enabled).toBe(false);
    expect(stored.schemaVersion).toBe(4);
  });

  it('migrates existing backup and idle policies without changing their values', async () => {
    await mkdir(paths.getConfigRoot(), { recursive: true });
    await writeFile(
      join(paths.getConfigRoot(), 'backup-policy.json'),
      JSON.stringify({
        automaticEnabled: true,
        automaticIntervalHours: 6,
        automaticRetentionPerType: 25,
        compressWorldBackups: true
      })
    );
    await writeFile(
      join(paths.getConfigRoot(), 'server-idle-policy.json'),
      JSON.stringify({ enabled: true, emptySeconds: 90 })
    );

    const settings = await service.read();

    expect(settings.automation.backups.automaticIntervalHours).toBe(6);
    expect(settings.automation.backups.compressWorldBackups).toBe(true);
    expect(settings.automation.idleShutdown).toEqual({ enabled: true, emptySeconds: 90 });
  });

  it('migrates schema 1 settings and preserves its automation values', async () => {
    await mkdir(paths.getConfigRoot(), { recursive: true });
    await writeFile(
      join(paths.getConfigRoot(), 'app-settings.json'),
      JSON.stringify({
        schemaVersion: 1,
        automation: {
          idleShutdown: { enabled: true, emptySeconds: 180 },
          backups: {
            automaticEnabled: true,
            automaticIntervalHours: 8,
            automaticRetentionPerType: 12,
            compressWorldBackups: false
          }
        }
      })
    );

    const settings = await service.read();
    const stored = JSON.parse(
      await readFile(join(paths.getConfigRoot(), 'app-settings.json'), 'utf8')
    ) as { schemaVersion: number };

    expect(settings.schemaVersion).toBe(4);
    expect(settings.automation.idleShutdown.emptySeconds).toBe(180);
    expect(settings.automation.backups.automaticIntervalHours).toBe(8);
    expect(stored.schemaVersion).toBe(4);
  });

  it('migrates schema 2 administrative API settings and adds a disabled client profile', async () => {
    await mkdir(paths.getConfigRoot(), { recursive: true });
    await writeFile(
      join(paths.getConfigRoot(), 'app-settings.json'),
      JSON.stringify({
        schemaVersion: 2,
        automation: {
          idleShutdown: { enabled: false, emptySeconds: 300 },
          backups: {
            automaticEnabled: false,
            automaticIntervalHours: 24,
            automaticRetentionPerType: 10,
            compressWorldBackups: false
          }
        },
        remoteApi: {
          enabled: true,
          bindMode: 'LOCAL_ONLY',
          port: 9213,
          username: 'operator',
          passwordSalt: 'salt',
          passwordHash: 'hash'
        }
      })
    );

    const settings = await service.read();

    expect(settings.schemaVersion).toBe(4);
    expect(settings.remoteApi.port).toBe(9213);
    expect(settings.remoteApi.username).toBe('operator');
    expect(settings.remoteApi.client.enabled).toBe(false);
    expect(settings.remoteApi.client.port).toBe(9213);
  });

  it('stores a remote API password as a salted hash and verifies it', async () => {
    await service.read();
    const status = await service.updateRemoteApi({
      confirmed: true,
      enabled: true,
      bindMode: 'LOCAL_ONLY',
      port: 8213,
      username: 'operator',
      password: 'a-secure-password'
    });
    const stored = await readFile(join(paths.getConfigRoot(), 'app-settings.json'), 'utf8');

    expect(status.passwordConfigured).toBe(true);
    expect(stored).not.toContain('a-secure-password');
    expect(await service.verifyRemoteApiCredentials('ADMIN', 'operator', 'a-secure-password')).toBe(true);
    expect(await service.verifyRemoteApiCredentials('ADMIN', 'operator', 'wrong-password')).toBe(false);
  });

  it('stores independent client credentials and permissions with a five-character minimum', async () => {
    await service.read();
    const status = await service.updateRemoteApi({
      confirmed: true,
      profile: 'CLIENT',
      enabled: true,
      bindMode: 'LOCAL_ONLY',
      port: 9999,
      username: 'guest',
      password: 'abcde',
      permissions: ['GENERAL', 'PLAYERS']
    });

    expect(status.client.passwordConfigured).toBe(true);
    expect(status.client.permissions).toEqual(['GENERAL', 'PLAYERS']);
    expect(await service.verifyRemoteApiCredentials('CLIENT', 'guest', 'abcde')).toBe(true);
    expect(await service.verifyRemoteApiCredentials('ADMIN', 'guest', 'abcde')).toBe(false);
  });

  it('rejects shorter passwords and keeps both profiles on the shared connection', async () => {
    await service.read();
    await expect(service.updateRemoteApi({
      confirmed: true,
      profile: 'CLIENT',
      enabled: true,
      bindMode: 'LOCAL_ONLY',
      port: 9999,
      username: 'guest',
      password: '1234',
      permissions: ['GENERAL']
    })).rejects.toThrow('REMOTE_API_PASSWORD_INVALID');

    await service.updateRemoteApi({
      confirmed: true,
      enabled: true,
      bindMode: 'LOCAL_ONLY',
      port: 8213,
      username: 'admin',
      password: 'abcde'
    });
    const status = await service.updateRemoteApi({
      confirmed: true,
      profile: 'CLIENT',
      enabled: true,
      bindMode: 'LOCAL_NETWORK',
      port: 9999,
      username: 'guest',
      password: 'abcde',
      permissions: ['GENERAL']
    });

    expect(status.client.bindMode).toBe('LOCAL_ONLY');
    expect(status.client.port).toBe(8213);
  });
});
