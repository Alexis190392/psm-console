import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { OperationManagerService } from '../src/backend/operations/operation-manager.service';
import { PALWORLD_DEDICATED_SERVER_APP_ID, PalworldInstallationService } from '../src/backend/palworld-installation/palworld-installation.service';
import { PortablePathService } from '../src/backend/portable-path/portable-path.service';
import type { SteamCmdService } from '../src/backend/steamcmd/steamcmd.service';

describe('PalworldInstallationService', () => {
  const portablePathService = new PortablePathService();
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
    await rm(serverRoot, { recursive: true, force: true });
  });

  it('reports missing when PalServer.exe does not exist', () => {
    const service = new PalworldInstallationService(
      portablePathService,
      new OperationManagerService(),
      steamCmdService
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
      steamCmdService
    );

    expect(service.getStatus().status).toBe('READY');
  });

  it('requires explicit confirmation before starting installation', () => {
    const service = new PalworldInstallationService(
      portablePathService,
      new OperationManagerService(),
      steamCmdService
    );

    expect(() => service.install({ confirmed: false })).toThrow('PALWORLD_INSTALL_REQUIRES_CONFIRMATION');
  });
});
