import { contextBridge, ipcRenderer } from 'electron';
import { ipcChannels } from '../../shared/contracts/ipc-channels';
import type { AllowedActionsDto } from '../../shared/dto/allowed-actions.dto';
import type { ApplicationStatusDto } from '../../shared/dto/application-status.dto';

export interface PalcmApi {
  app: {
    getStatus: () => Promise<ApplicationStatusDto>;
    getActions: () => Promise<AllowedActionsDto>;
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
  window: {
    minimize: () => ipcRenderer.invoke(ipcChannels.windowMinimize) as Promise<void>,
    toggleMaximize: () => ipcRenderer.invoke(ipcChannels.windowToggleMaximize) as Promise<void>,
    close: () => ipcRenderer.invoke(ipcChannels.windowClose) as Promise<void>
  }
};

contextBridge.exposeInMainWorld('palcm', api);
