import { describe, expect, it } from 'vitest';
import { ApplicationStateService } from '../src/backend/application-state/application-state.service';
import { PortablePathService } from '../src/backend/portable-path/portable-path.service';
import { ApplicationStatus } from '../src/shared/enums/application-status';

describe('ApplicationStateService', () => {
  it('enables SteamCMD install only when SteamCMD is missing', () => {
    const service = new ApplicationStateService(new PortablePathService());

    service.setStatus(ApplicationStatus.STEAMCMD_MISSING);

    expect(service.getAllowedActions()).toMatchObject({
      canInstallSteamCmd: true,
      canStartServer: false
    });
  });
});
