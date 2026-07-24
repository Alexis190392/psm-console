import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BackupService } from '../src/backend/backup/backup.service';
import { BackupArchiveService } from '../src/backend/backup/backup-archive.service';
import { BackupIntegrityService, getManifestPath } from '../src/backend/backup/backup-integrity.service';
import { BackupPolicyService } from '../src/backend/backup/backup-policy.service';
import { OperationManagerService } from '../src/backend/operations/operation-manager.service';
import { PalworldConfigurationService } from '../src/backend/palworld-configuration/palworld-configuration.service';
import type { PalworldProcessService } from '../src/backend/palworld-process/palworld-process.service';
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
  const policyService = new BackupPolicyService(portablePathService);
  const integrityService = new BackupIntegrityService();
  const archiveService = new BackupArchiveService();
  const service = new BackupService(
    portablePathService,
    configurationService,
    operationManager,
    policyService,
    integrityService,
    archiveService
  );
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

  beforeEach(async () => {
    await rm(portableRoot, { recursive: true, force: true });
  });

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
    expect(() => service.restoreBackup({ confirmed: false, backupId: 'configuration:test.ini' })).toThrow(
      'BACKUP_RESTORE_REQUIRES_CONFIRMATION'
    );
  });

  it('creates a configuration backup inside the portable backup folder', async () => {
    await mkdir(dirname(activeConfigurationPath), { recursive: true });
    await writeFile(activeConfigurationPath, '[/Script/Pal.PalGameWorldSettings]\nOptionSettings=(Difficulty=None)');

    const accepted = service.createConfigurationBackup({ confirmed: true });
    await waitForOperation(accepted.operationId, operationManager);

    const summary = await service.getSummary();
    expect(summary.configurationBackups).toHaveLength(1);
    expect(summary.configurationBackups[0]?.path).toContain(join('backups', 'configuration'));
    expect(summary.configurationBackups[0]?.integrity).toBe('VERIFIED');
    expect(existsSync(getManifestPath(summary.configurationBackups[0]?.path ?? ''))).toBe(true);
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

  it('sends a selected backup to trash by validated backup id', async () => {
    await mkdir(dirname(activeConfigurationPath), { recursive: true });
    await writeFile(activeConfigurationPath, '[/Script/Pal.PalGameWorldSettings]\nOptionSettings=(Difficulty=None)');

    const accepted = service.createConfigurationBackup({ confirmed: true });
    await waitForOperation(accepted.operationId, operationManager);
    const summary = await service.getSummary();
    const backup = summary.configurationBackups[0];
    const trashedPaths: string[] = [];

    expect(backup).toBeDefined();

    const deleteAccepted = service.deleteBackup(
      {
        confirmed: true,
        backupId: backup?.id ?? ''
      },
      (path) => {
        trashedPaths.push(path);
        return Promise.resolve();
      }
    );
    await waitForOperation(deleteAccepted.operationId, operationManager);

    expect(trashedPaths).toEqual([backup?.path, getManifestPath(backup?.path ?? '')]);
  });

  it('restores a configuration backup and keeps a safety copy of the current INI', async () => {
    const originalContent = '[/Script/Pal.PalGameWorldSettings]\nOptionSettings=(ServerName="Original")';
    const changedContent = '[/Script/Pal.PalGameWorldSettings]\nOptionSettings=(ServerName="Changed")';
    await mkdir(dirname(activeConfigurationPath), { recursive: true });
    await writeFile(activeConfigurationPath, originalContent);

    const accepted = service.createConfigurationBackup({ confirmed: true });
    await waitForOperation(accepted.operationId, operationManager);
    const summary = await service.getSummary();
    const backup = summary.configurationBackups[0];

    await writeFile(activeConfigurationPath, changedContent);
    const restoreAccepted = service.restoreBackup({
      confirmed: true,
      backupId: backup?.id ?? ''
    });
    await waitForOperation(restoreAccepted.operationId, operationManager);

    await expect(readFile(activeConfigurationPath, 'utf8')).resolves.toBe(originalContent);
    const afterRestore = await service.getSummary();
    expect(afterRestore.configurationBackups.some((entry) => entry.origin === 'safety')).toBe(true);
  });

  it('restores a world backup only when the server is stopped', async () => {
    const worldFile = join(saveGamesPath, 'WorldOption.sav');
    await mkdir(saveGamesPath, { recursive: true });
    await writeFile(worldFile, 'original-world');

    const accepted = service.createWorldBackup({ confirmed: true });
    await waitForOperation(accepted.operationId, operationManager);
    const summary = await service.getSummary();
    const backup = summary.worldBackups[0];

    await writeFile(worldFile, 'changed-world');
    const restoreAccepted = service.restoreBackup({
      confirmed: true,
      backupId: backup?.id ?? ''
    });
    await waitForOperation(restoreAccepted.operationId, operationManager);

    await expect(readFile(worldFile, 'utf8')).resolves.toBe('original-world');
    const afterRestore = await service.getSummary();
    expect(afterRestore.worldBackups.some((entry) => entry.origin === 'safety')).toBe(true);
  });

  it('rejects a modified backup before replacing the active configuration', async () => {
    const originalContent = '[/Script/Pal.PalGameWorldSettings]\nOptionSettings=(ServerName="Original")';
    await mkdir(dirname(activeConfigurationPath), { recursive: true });
    await writeFile(activeConfigurationPath, originalContent);

    const accepted = service.createConfigurationBackup({ confirmed: true });
    await waitForOperation(accepted.operationId, operationManager);
    const backup = (await service.getSummary()).configurationBackups[0];
    await writeFile(backup?.path ?? '', '[/Script/Pal.PalGameWorldSettings]\nOptionSettings=(ServerName="Altered")');

    const verifyAccepted = service.verifyBackup({ backupId: backup?.id ?? '' });
    await waitForOperationStatus(verifyAccepted.operationId, operationManager, 'FAILED');
    const restoreAccepted = service.restoreBackup({ confirmed: true, backupId: backup?.id ?? '' });
    await waitForOperationStatus(restoreAccepted.operationId, operationManager, 'FAILED');

    await expect(readFile(activeConfigurationPath, 'utf8')).resolves.toBe(originalContent);
  });

  it('creates and restores a compressed world backup when compression is enabled', async () => {
    const worldFile = join(saveGamesPath, 'WorldOption.sav');
    await mkdir(saveGamesPath, { recursive: true });
    await writeFile(worldFile, 'compressed-world');
    const policyAccepted = service.updatePolicy({
      confirmed: true,
      automaticEnabled: false,
      automaticIntervalHours: 24,
      automaticRetentionPerType: 10,
      compressWorldBackups: true
    });
    await waitForOperation(policyAccepted.operationId, operationManager);

    const accepted = service.createWorldBackup({ confirmed: true });
    await waitForOperation(accepted.operationId, operationManager);
    const backup = (await service.getSummary()).worldBackups[0];
    expect(backup?.format).toBe('tar-gzip');
    expect(backup?.name.endsWith('.tar.gz')).toBe(true);

    await writeFile(worldFile, 'changed-world');
    const restoreAccepted = service.restoreBackup({ confirmed: true, backupId: backup?.id ?? '' });
    await waitForOperation(restoreAccepted.operationId, operationManager);

    await expect(readFile(worldFile, 'utf8')).resolves.toBe('compressed-world');
  });

  it('applies retention only to automatic backups', async () => {
    const backupDirectory = join(portableRoot, 'backups', 'configuration');
    const olderAutomatic = join(backupDirectory, 'PalWorldSettings.automatic.older.ini');
    const newerAutomatic = join(backupDirectory, 'PalWorldSettings.automatic.newer.ini');
    const manual = join(backupDirectory, 'PalWorldSettings.manual.keep.ini');
    const content = '[/Script/Pal.PalGameWorldSettings]\nOptionSettings=(Difficulty=None)';
    await mkdir(backupDirectory, { recursive: true });
    await writeFile(olderAutomatic, content);
    await integrityService.createManifest(olderAutomatic, 'configuration', 'automatic', 'file');
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    await writeFile(newerAutomatic, content);
    await integrityService.createManifest(newerAutomatic, 'configuration', 'automatic', 'file');
    await writeFile(manual, content);
    await integrityService.createManifest(manual, 'configuration', 'manual', 'file');

    const policyAccepted = service.updatePolicy({
      confirmed: true,
      automaticEnabled: false,
      automaticIntervalHours: 24,
      automaticRetentionPerType: 1,
      compressWorldBackups: false
    });
    await waitForOperation(policyAccepted.operationId, operationManager);

    const summary = await service.getSummary();
    expect(summary.configurationBackups.filter((entry) => entry.origin === 'automatic')).toHaveLength(1);
    expect(summary.configurationBackups.some((entry) => entry.name === 'PalWorldSettings.manual.keep.ini')).toBe(true);
    expect(existsSync(olderAutomatic)).toBe(false);
    expect(existsSync(newerAutomatic)).toBe(true);
  });

  it('fails world restore when the server is running', async () => {
    const worldFile = join(saveGamesPath, 'WorldOption.sav');
    await mkdir(saveGamesPath, { recursive: true });
    await writeFile(worldFile, 'original-world');

    const accepted = service.createWorldBackup({ confirmed: true });
    await waitForOperation(accepted.operationId, operationManager);
    const summary = await service.getSummary();
    const backup = summary.worldBackups[0];
    const runningProcessService = {
      getRuntimeStatus: () => ({
        state: 'RUNNING',
        executablePath: 'PalServer.exe',
        updatedAt: new Date().toISOString(),
        message: 'Servidor activo.',
        logs: []
      })
    } as unknown as PalworldProcessService;
    const guardedService = new BackupService(
      portablePathService,
      configurationService,
      operationManager,
      policyService,
      integrityService,
      archiveService,
      runningProcessService
    );

    const restoreAccepted = guardedService.restoreBackup({
      confirmed: true,
      backupId: backup?.id ?? ''
    });

    await waitForOperationStatus(restoreAccepted.operationId, operationManager, 'FAILED');
    await expect(readFile(worldFile, 'utf8')).resolves.toBe('original-world');
  });
});

async function waitForOperation(operationId: string, operationManager: OperationManagerService): Promise<void> {
  await waitForOperationStatus(operationId, operationManager, 'COMPLETED');
}

async function waitForOperationStatus(
  operationId: string,
  operationManager: OperationManagerService,
  expectedStatus: 'COMPLETED' | 'FAILED'
): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const operation = operationManager.get(operationId);

    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(operation.status)) {
      expect(operation.status).toBe(expectedStatus);
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 25);
    });
  }

  throw new Error('Timed out waiting for backup operation.');
}
