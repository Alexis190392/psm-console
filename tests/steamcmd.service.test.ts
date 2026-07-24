import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OperationManagerService } from '../src/backend/operations/operation-manager.service';
import { PortablePathService } from '../src/backend/portable-path/portable-path.service';
import { PortableStateService } from '../src/backend/portable-state/portable-state.service';
import { SteamCmdService } from '../src/backend/steamcmd/steamcmd.service';

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
});
