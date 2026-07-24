import { describe, expect, it } from 'vitest';
import { ApplicationStateService } from '../src/backend/application-state/application-state.service';
import type { PalworldConfigurationService } from '../src/backend/palworld-configuration/palworld-configuration.service';
import type { PalworldInstallationService } from '../src/backend/palworld-installation/palworld-installation.service';
import type { PalworldProcessService } from '../src/backend/palworld-process/palworld-process.service';
import { PortablePathService } from '../src/backend/portable-path/portable-path.service';
import { ApplicationStatus } from '../src/shared/enums/application-status';
import type { SteamCmdService } from '../src/backend/steamcmd/steamcmd.service';

describe('ApplicationStateService', () => {
  it('enables SteamCMD install when SteamCMD is missing', () => {
    const service = new ApplicationStateService(
      new PortablePathService(),
      createSteamCmdServiceStub('MISSING'),
      createPalworldInstallationServiceStub('MISSING'),
      createPalworldConfigurationServiceStub('MISSING'),
      createPalworldProcessServiceStub('STOPPED')
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
      createSteamCmdServiceStub('READY'),
      createPalworldInstallationServiceStub('MISSING'),
      createPalworldConfigurationServiceStub('MISSING'),
      createPalworldProcessServiceStub('STOPPED')
    );

    expect(service.getStatus().status).toBe(ApplicationStatus.SERVER_MISSING);
    expect(service.getAllowedActions()).toMatchObject({
      canInstallSteamCmd: false,
      canInstallServer: true
    });
  });

  it('moves to configuration missing after the server is installed', () => {
    const service = new ApplicationStateService(
      new PortablePathService(),
      createSteamCmdServiceStub('READY'),
      createPalworldInstallationServiceStub('READY'),
      createPalworldConfigurationServiceStub('MISSING'),
      createPalworldProcessServiceStub('STOPPED')
    );

    expect(service.getStatus().status).toBe(ApplicationStatus.CONFIGURATION_MISSING);
    expect(service.getAllowedActions()).toMatchObject({
      canEditConfiguration: true,
      canStartServer: false
    });
  });

  it('moves to ready after the active configuration exists', () => {
    const service = new ApplicationStateService(
      new PortablePathService(),
      createSteamCmdServiceStub('READY'),
      createPalworldInstallationServiceStub('READY'),
      createPalworldConfigurationServiceStub('READY'),
      createPalworldProcessServiceStub('STOPPED')
    );

    expect(service.getStatus().status).toBe(ApplicationStatus.READY);
  });

  it('moves to server running when the Palworld process is active', () => {
    const service = new ApplicationStateService(
      new PortablePathService(),
      createSteamCmdServiceStub('READY'),
      createPalworldInstallationServiceStub('READY'),
      createPalworldConfigurationServiceStub('READY'),
      createPalworldProcessServiceStub('RUNNING')
    );

    expect(service.getStatus().status).toBe(ApplicationStatus.SERVER_RUNNING);
    expect(service.getAllowedActions()).toMatchObject({
      canStartServer: false,
      canStopServer: true
    });
  });

  it('allows stopping while the server is starting', () => {
    const service = new ApplicationStateService(
      new PortablePathService(),
      createSteamCmdServiceStub('READY'),
      createPalworldInstallationServiceStub('READY'),
      createPalworldConfigurationServiceStub('READY'),
      createPalworldProcessServiceStub('STARTING')
    );

    expect(service.getStatus().status).toBe(ApplicationStatus.SERVER_STARTING);
    expect(service.getAllowedActions()).toMatchObject({
      canStartServer: false,
      canStopServer: true
    });
  });

  it('allows retrying after a runtime error', () => {
    const service = new ApplicationStateService(
      new PortablePathService(),
      createSteamCmdServiceStub('READY'),
      createPalworldInstallationServiceStub('READY'),
      createPalworldConfigurationServiceStub('READY'),
      createPalworldProcessServiceStub('ERROR')
    );

    expect(service.getStatus().status).toBe(ApplicationStatus.ERROR);
    expect(service.getAllowedActions()).toMatchObject({
      canStartServer: true,
      canStopServer: false
    });
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

function createPalworldInstallationServiceStub(status: 'MISSING' | 'READY'): PalworldInstallationService {
  return {
    getStatus: () => ({
      status,
      appId: '2394010',
      installDirectory: 'C:\\portable\\server\\palworld',
      executablePath: 'C:\\portable\\server\\palworld\\PalServer.exe',
      message: status
    })
  } as PalworldInstallationService;
}

function createPalworldConfigurationServiceStub(status: 'MISSING' | 'READY'): PalworldConfigurationService {
  return {
    getStatus: () => ({
      status,
      templatePath: 'C:\\portable\\server\\palworld\\DefaultPalWorldSettings.ini',
      activePath: 'C:\\portable\\server\\palworld\\Pal\\Saved\\Config\\WindowsServer\\PalWorldSettings.ini',
      message: status
    })
  } as PalworldConfigurationService;
}

function createPalworldProcessServiceStub(
  state: 'STOPPED' | 'STARTING' | 'RUNNING' | 'ERROR'
): PalworldProcessService {
  return {
    getRuntimeStatus: () => ({
      state,
      executablePath: 'C:\\portable\\server\\palworld\\PalServer.exe',
      updatedAt: new Date().toISOString(),
      message: state,
      logs: []
    })
  } as unknown as PalworldProcessService;
}
