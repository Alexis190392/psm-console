import { contextBridge, ipcRenderer } from 'electron';
import type { AllowedActionsDto } from '../../shared/dto/allowed-actions.dto';
import type { ApplicationStatusDto } from '../../shared/dto/application-status.dto';
import type { OperationAcceptedDto, OperationProgressDto } from '../../shared/dto/operation-progress.dto';
import type {
  PalworldInstallationStatusDto,
  PalworldInstallRequestDto
} from '../../shared/dto/palworld-installation-status.dto';
import type { SteamCmdInstallRequestDto, SteamCmdStatusDto } from '../../shared/dto/steamcmd-status.dto';

const ipcChannels = {
  appGetStatus: 'app:get-status',
  appGetActions: 'app:get-actions',
  operationGet: 'operation:get',
  steamCmdGetStatus: 'steamcmd:get-status',
  steamCmdInstall: 'steamcmd:install',
  serverGetInstallationStatus: 'server:get-installation-status',
  serverInstall: 'server:install',
  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggle-maximize',
  windowClose: 'window:close'
} as const;

export interface PalcmApi {
  app: {
    getStatus: () => Promise<ApplicationStatusDto>;
    getActions: () => Promise<AllowedActionsDto>;
  };
  operation: {
    get: (operationId: string) => Promise<OperationProgressDto>;
  };
  steamCmd: {
    getStatus: () => Promise<SteamCmdStatusDto>;
    install: (request: SteamCmdInstallRequestDto) => Promise<OperationAcceptedDto>;
  };
  server: {
    getInstallationStatus: () => Promise<PalworldInstallationStatusDto>;
    install: (request: PalworldInstallRequestDto) => Promise<OperationAcceptedDto>;
  };
  window: {
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<void>;
    close: () => Promise<void>;
  };
}

const api: PalcmApi = {
  app: {
    getStatus: () => ipcRenderer.invoke(ipcChannels.appGetStatus) as Promise<ApplicationStatusDto>,
    getActions: () => ipcRenderer.invoke(ipcChannels.appGetActions) as Promise<AllowedActionsDto>
  },
  operation: {
    get: (operationId) =>
      ipcRenderer.invoke(ipcChannels.operationGet, { operationId }) as Promise<OperationProgressDto>
  },
  steamCmd: {
    getStatus: () => ipcRenderer.invoke(ipcChannels.steamCmdGetStatus) as Promise<SteamCmdStatusDto>,
    install: (request) =>
      ipcRenderer.invoke(ipcChannels.steamCmdInstall, request) as Promise<OperationAcceptedDto>
  },
  server: {
    getInstallationStatus: () =>
      ipcRenderer.invoke(ipcChannels.serverGetInstallationStatus) as Promise<PalworldInstallationStatusDto>,
    install: (request) =>
      ipcRenderer.invoke(ipcChannels.serverInstall, request) as Promise<OperationAcceptedDto>
  },
  window: {
    minimize: () => ipcRenderer.invoke(ipcChannels.windowMinimize) as Promise<void>,
    toggleMaximize: () => ipcRenderer.invoke(ipcChannels.windowToggleMaximize) as Promise<void>,
    close: () => ipcRenderer.invoke(ipcChannels.windowClose) as Promise<void>
  }
};

contextBridge.exposeInMainWorld('palcm', api);
contextBridge.exposeInMainWorld('windowControls', {
  minimize: api.window.minimize,
  maximizeToggle: api.window.toggleMaximize,
  close: api.window.close
});
