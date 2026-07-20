import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BackupService } from '../src/backend/backup/backup.service';
import { OperationManagerService } from '../src/backend/operations/operation-manager.service';
import { PalworldConfigurationService } from '../src/backend/palworld-configuration/palworld-configuration.service';
import { PortablePathService } from '../src/backend/portable-path/portable-path.service';
import { PortableStateService } from '../src/backend/portable-state/portable-state.service';

describe('BackupService', () => {
  const portableRoot = join(process.cwd(), '.tmp-tests', 'backup-service');
  const portablePathService = new PortablePathService({
    isPackaged: true,
    getPath: () => join(portableRoot, 'PalCM.exe')
  });
  const portableStateService = new PortableStateService(portablePathService);
  const operationManager = new OperationManagerService();
  const configurationService = new PalworldConfigurationService(
    portablePathService,
    operationManager,
    portableStateService
  );
  const service = new BackupService(portablePathService, configurationService, operationManager);
  const serverRoot = portablePathService.getPalworldServerRoot();
  const activeConfigurationPath = join(
    serverRoot,
    'Pal',
    'Saved',
    'Config',
    'WindowsServer',
    'PalWorldSettings.ini'
  );
  const saveGamesPath = join(serverRoot, 'Pal', 'Saved', 'SaveGames');

  afterEach(async () => {
    await rm(portableRoot, { recursive: true, force: true });
  });

  it('reports empty backup lists before any backup exists', async () => {
    const summary = await service.getSummary();

    expect(summary.configurationBackups).toHaveLength(0);
    expect(summary.worldBackups).toHaveLength(0);
    expect(summary.configurationSourcePath).toBe(activeConfigurationPath);
    expect(summary.worldSourcePath).toBe(saveGamesPath);
  });

  it('requires confirmation before creating backups', () => {
    expect(() => service.createConfigurationBackup({ confirmed: false })).toThrow(
      'BACKUP_CONFIGURATION_REQUIRES_CONFIRMATION'
    );
    expect(() => service.createWorldBackup({ confirmed: false })).toThrow('BACKUP_WORLD_REQUIRES_CONFIRMATION');
  });

  it('creates a configuration backup inside the portable backup folder', async () => {
    await mkdir(dirname(activeConfigurationPath), { recursive: true });
    await writeFile(activeConfigurationPath, '[/Script/Pal.PalGameWorldSettings]\nOptionSettings=(Difficulty=None)');

    const accepted = service.createConfigurationBackup({ confirmed: true });
    await waitForOperation(accepted.operationId, operationManager);

    const summary = await service.getSummary();
    expect(summary.configurationBackups).toHaveLength(1);
    expect(summary.configurationBackups[0]?.path).toContain(join('backups', 'configuration'));
    expect(existsSync(summary.configurationBackups[0]?.path ?? '')).toBe(true);
  });

  it('creates a world backup from SaveGames without touching the source', async () => {
    const worldFile = join(saveGamesPath, 'WorldOption.sav');
    await mkdir(saveGamesPath, { recursive: true });
    await writeFile(worldFile, 'fixture');

    const accepted = service.createWorldBackup({ confirmed: true });
    await waitForOperation(accepted.operationId, operationManager);

    const summary = await service.getSummary();
    expect(summary.worldBackups).toHaveLength(1);
    expect(summary.worldBackups[0]?.path).toContain(join('backups', 'world'));
    expect(existsSync(worldFile)).toBe(true);
  });
});

async function waitForOperation(operationId: string, operationManager: OperationManagerService): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const operation = operationManager.get(operationId);

    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(operation.status)) {
      expect(operation.status).toBe('COMPLETED');
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 25);
    });
  }

  throw new Error('Timed out waiting for backup operation.');
}
