import { describe, expect, it } from 'vitest';
import { ApplicationStateService } from '../src/backend/application-state/application-state.service';
import { PortablePathService } from '../src/backend/portable-path/portable-path.service';
import { ApplicationStatus } from '../src/shared/enums/application-status';
import type { SteamCmdService } from '../src/backend/steamcmd/steamcmd.service';

describe('ApplicationStateService', () => {
  it('enables SteamCMD install when SteamCMD is missing', () => {
    const service = new ApplicationStateService(
      new PortablePathService(),
      createSteamCmdServiceStub('MISSING')
    );

    expect(service.getStatus().status).toBe(ApplicationStatus.STEAMCMD_MISSING);
    expect(service.getAllowedActions()).toMatchObject({
      canInstallSteamCmd: true,
      canStartServer: false
    });
  });

  it('moves to server missing after SteamCMD is ready', () => {
    const service = new ApplicationStateService(
      new PortablePathService(),
      createSteamCmdServiceStub('READY')
    );

    expect(service.getStatus().status).toBe(ApplicationStatus.SERVER_MISSING);
  });
});

function createSteamCmdServiceStub(status: 'MISSING' | 'READY'): SteamCmdService {
  return {
    getStatus: () => ({
      status,
      installDirectory: 'C:\\portable\\tools\\steamcmd',
      executablePath: 'C:\\portable\\tools\\steamcmd\\steamcmd.exe',
      officialDownloadUrl: 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip',
      message: status
    })
  } as SteamCmdService;
}
