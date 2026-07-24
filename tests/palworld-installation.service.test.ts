import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { OperationManagerService } from '../src/backend/operations/operation-manager.service';
import { PALWORLD_DEDICATED_SERVER_APP_ID, PalworldInstallationService } from '../src/backend/palworld-installation/palworld-installation.service';
import { PortablePathService } from '../src/backend/portable-path/portable-path.service';
import { PortableStateService } from '../src/backend/portable-state/portable-state.service';
import { PalworldMaintenanceSnapshotService } from '../src/backend/palworld-maintenance/palworld-maintenance-snapshot.service';
import type { SteamCmdService } from '../src/backend/steamcmd/steamcmd.service';

describe('PalworldInstallationService', () => {
  const portableRoot = join(process.cwd(), '.tmp-tests', 'palworld-installation');
  const portablePathService = new PortablePathService({
    isPackaged: true,
    getPath: () => join(portableRoot, 'PalCM.exe')
  });
  const portableStateService = new PortableStateService(portablePathService);
  const maintenanceSnapshotService = new PalworldMaintenanceSnapshotService(portablePathService);
  const serverRoot = portablePathService.getPalworldServerRoot();
  const steamCmdService = {
    getStatus: () => ({
      status: 'READY',
      installDirectory: 'C:\\portable\\tools\\steamcmd',
      executablePath: 'C:\\portable\\tools\\steamcmd\\steamcmd.exe',
      officialDownloadUrl: 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip',
      message: 'READY'
    })
  } as SteamCmdService;

  afterEach(async () => {
    await rm(portableRoot, { recursive: true, force: true });
  });

  it('reports missing when PalServer.exe does not exist', () => {
    const service = new PalworldInstallationService(
      portablePathService,
      new OperationManagerService(),
      steamCmdService,
      portableStateService,
      maintenanceSnapshotService
    );

    expect(service.getStatus()).toMatchObject({
      status: 'MISSING',
      appId: PALWORLD_DEDICATED_SERVER_APP_ID
    });
  });

  it('reports ready when PalServer.exe exists', async () => {
    await mkdir(serverRoot, { recursive: true });
    await writeFile(join(serverRoot, 'PalServer.exe'), '');
    const service = new PalworldInstallationService(
      portablePathService,
      new OperationManagerService(),
      steamCmdService,
      portableStateService,
      maintenanceSnapshotService
    );

    expect(service.getStatus().status).toBe('READY');
  });

  it('requires explicit confirmation before starting installation', () => {
    const service = new PalworldInstallationService(
      portablePathService,
      new OperationManagerService(),
      steamCmdService,
      portableStateService,
      maintenanceSnapshotService
    );

    expect(() => service.install({ confirmed: false })).toThrow('PALWORLD_INSTALL_REQUIRES_CONFIRMATION');
  });

  it('requires explicit confirmation before updating the server', () => {
    const service = new PalworldInstallationService(
      portablePathService,
      new OperationManagerService(),
      steamCmdService,
      portableStateService,
      maintenanceSnapshotService
    );

    expect(() => service.update({ confirmed: false })).toThrow('PALWORLD_UPDATE_REQUIRES_CONFIRMATION');
  });

  it('requires explicit confirmation before repairing the server', () => {
    const service = new PalworldInstallationService(
      portablePathService,
      new OperationManagerService(),
      steamCmdService,
      portableStateService,
      maintenanceSnapshotService
    );

    expect(() => service.repair({ confirmed: false })).toThrow('PALWORLD_REPAIR_REQUIRES_CONFIRMATION');
  });

  it('requires the server to be installed before updating', () => {
    const service = new PalworldInstallationService(
      portablePathService,
      new OperationManagerService(),
      steamCmdService,
      portableStateService,
      maintenanceSnapshotService
    );

    expect(() => service.update({ confirmed: true })).toThrow('PALWORLD_SERVER_NOT_READY');
  });

  it('requires the server to be stopped before updating', async () => {
    await mkdir(serverRoot, { recursive: true });
    await writeFile(join(serverRoot, 'PalServer.exe'), '');
    const service = new PalworldInstallationService(
      portablePathService,
      new OperationManagerService(),
      steamCmdService,
      portableStateService,
      maintenanceSnapshotService
    );

    expect(() => service.update({ confirmed: true }, () => 'RUNNING')).toThrow(
      'PALWORLD_UPDATE_REQUIRES_SERVER_STOPPED'
    );
  });
});
