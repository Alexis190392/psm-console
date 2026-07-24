import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PalworldMaintenanceSnapshotService } from '../src/backend/palworld-maintenance/palworld-maintenance-snapshot.service';
import { PortablePathService } from '../src/backend/portable-path/portable-path.service';

describe('PalworldMaintenanceSnapshotService', () => {
  const portableRoot = join(process.cwd(), '.tmp-tests', 'maintenance-snapshot');
  const portablePathService = new PortablePathService({
    isPackaged: true,
    getPath: () => join(portableRoot, 'PalCM.exe')
  });
  const service = new PalworldMaintenanceSnapshotService(portablePathService);
  const serverRoot = portablePathService.getPalworldServerRoot();
  const configPath = join(serverRoot, 'Pal', 'Saved', 'Config', 'WindowsServer', 'PalWorldSettings.ini');
  const worldFile = join(serverRoot, 'Pal', 'Saved', 'SaveGames', 'world.sav');
  const defaultPath = join(serverRoot, 'DefaultPalWorldSettings.ini');

  afterEach(async () => {
    await rm(portableRoot, { recursive: true, force: true });
  });

  it('restores protected configuration and world data after a failed update', async () => {
    await mkdir(join(configPath, '..'), { recursive: true });
    await mkdir(join(worldFile, '..'), { recursive: true });
    await writeFile(configPath, 'before-config');
    await writeFile(worldFile, 'before-world');
    await writeFile(defaultPath, 'OptionSettings=(A=1)');
    const snapshot = await service.create();

    await writeFile(configPath, 'broken-config');
    await writeFile(worldFile, 'broken-world');
    await service.restore(snapshot);

    expect(await readFile(configPath, 'utf8')).toBe('before-config');
    expect(await readFile(worldFile, 'utf8')).toBe('before-world');
  });

  it('reports changes in the official INI catalog after an update', async () => {
    await mkdir(serverRoot, { recursive: true });
    await writeFile(defaultPath, 'OptionSettings=(A=1,B=2)');
    const snapshot = await service.create();
    await writeFile(defaultPath, 'OptionSettings=(A=1,C=3)');

    await expect(service.describeCatalogChanges(snapshot)).resolves.toContain(
      '1 agregados, 1 retirados'
    );
  });
});
