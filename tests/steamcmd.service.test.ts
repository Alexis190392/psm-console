import { join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OperationManagerService } from '../src/backend/operations/operation-manager.service';
import { PortablePathService } from '../src/backend/portable-path/portable-path.service';
import { PortableStateService } from '../src/backend/portable-state/portable-state.service';
import {
  isSteamCmdBootstrapReady,
  SteamCmdService
} from '../src/backend/steamcmd/steamcmd.service';

describe('SteamCmdService maintenance policy', () => {
  const portableRoot = join(process.cwd(), '.tmp-tests', 'steamcmd-service');
  const portablePathService = new PortablePathService({
    isPackaged: true,
    getPath: () => join(portableRoot, 'PalCM.exe')
  });
  const service = new SteamCmdService(
    portablePathService,
    new OperationManagerService(),
    new PortableStateService(portablePathService)
  );

  it('requires confirmation before installing SteamCMD', () => {
    expect(() => service.install({ confirmed: false })).toThrow(
      'STEAMCMD_INSTALL_REQUIRES_CONFIRMATION'
    );
  });

  it('requires confirmation before repairing SteamCMD', () => {
    expect(() => service.repair({ confirmed: false })).toThrow(
      'STEAMCMD_REPAIR_REQUIRES_CONFIRMATION'
    );
  });

  it('only accepts a bootstrap with the executable and initialized client library', () => {
    const bootstrapRoot = join(portableRoot, 'bootstrap-validation');
    rmSync(bootstrapRoot, { recursive: true, force: true });
    mkdirSync(bootstrapRoot, { recursive: true });
    writeFileSync(join(bootstrapRoot, 'steamcmd.exe'), '');

    expect(isSteamCmdBootstrapReady(bootstrapRoot)).toBe(false);

    writeFileSync(join(bootstrapRoot, 'steamclient.dll'), '');

    expect(isSteamCmdBootstrapReady(bootstrapRoot)).toBe(true);
    rmSync(bootstrapRoot, { recursive: true, force: true });
  });
});
