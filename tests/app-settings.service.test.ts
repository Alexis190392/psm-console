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

    expect(settings.schemaVersion).toBe(1);
    expect(settings.automation.idleShutdown.enabled).toBe(false);
    expect(stored.schemaVersion).toBe(1);
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
});
