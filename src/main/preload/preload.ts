import { contextBridge, ipcRenderer } from 'electron';
import type { AllowedActionsDto } from '../../shared/dto/allowed-actions.dto';
import type { ApplicationStatusDto } from '../../shared/dto/application-status.dto';
import type {
  BackupCreateRequestDto,
  BackupDeleteRequestDto,
  BackupRestoreRequestDto,
  BackupSummaryDto
} from '../../shared/dto/backup-status.dto';
import type { OperationAcceptedDto, OperationProgressDto } from '../../shared/dto/operation-progress.dto';
import type { FirewallApplyRulesRequestDto, FirewallStatusDto } from '../../shared/dto/firewall-status.dto';
import type { LogsRecentDto, LogsRecentRequestDto } from '../../shared/dto/log-status.dto';
import type {
  PalworldConfigurationFileDto,
  PalworldRestoreDefaultConfigurationRequestDto,
  PalworldSaveConfigurationRequestDto
} from '../../shared/dto/palworld-configuration-file.dto';
import type {
  PalworldConfigurationStatusDto,
  PalworldCreateDefaultConfigurationRequestDto
} from '../../shared/dto/palworld-configuration-status.dto';
import type {
  PalworldInstallationStatusDto,
  PalworldInstallRequestDto,
  PalworldUpdateRequestDto
} from '../../shared/dto/palworld-installation-status.dto';
import type {
  PalworldRuntimeStatusDto,
  PalworldStartRequestDto,
  PalworldStopRequestDto
} from '../../shared/dto/palworld-runtime-status.dto';
import type {
  PalworldAdminActionRequestDto,
  PalworldAdminActionResultDto,
  PalworldAdminStatusDto
} from '../../shared/dto/palworld-admin.dto';
import type { PalworldPlayersStatusDto } from '../../shared/dto/palworld-players-status.dto';
import type { SteamCmdInstallRequestDto, SteamCmdStatusDto } from '../../shared/dto/steamcmd-status.dto';
import type { NetworkDiagnosticsDto, PublicAddressRequestDto } from '../../shared/dto/network-diagnostics.dto';

const ipcChannels = {
  appGetStatus: 'app:get-status',
  appGetActions: 'app:get-actions',
  operationGet: 'operation:get',
  steamCmdGetStatus: 'steamcmd:get-status',
  steamCmdInstall: 'steamcmd:install',
  serverGetInstallationStatus: 'server:get-installation-status',
  serverInstall: 'server:install',
  serverUpdate: 'server:update',
  serverStart: 'server:start',
  serverStop: 'server:stop',
  serverGetRuntimeStatus: 'server:get-runtime-status',
  playersGetStatus: 'players:get-status',
  adminGetStatus: 'admin:get-status',
  adminExecuteAction: 'admin:execute-action',
  configRead: 'config:read',
  configValidate: 'config:validate',
  configSave: 'config:save',
  configCreateDefault: 'config:create-default',
  configRestoreDefault: 'config:restore-default',
  firewallGetStatus: 'firewall:get-status',
  firewallCreateRule: 'firewall:create-rule',
  networkGetLocalAddresses: 'network:get-local-addresses',
  networkGetPublicAddress: 'network:get-public-address',
  backupGetSummary: 'backup:get-summary',
  backupCreateConfiguration: 'backup:create-configuration',
  backupCreateWorld: 'backup:create-world',
  backupRestore: 'backup:restore',
  backupDelete: 'backup:delete',
  logsGetRecent: 'logs:get-recent',
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
    update: (request: PalworldUpdateRequestDto) => Promise<OperationAcceptedDto>;
    start: (request: PalworldStartRequestDto) => Promise<OperationAcceptedDto>;
    stop: (request: PalworldStopRequestDto) => Promise<OperationAcceptedDto>;
    getRuntimeStatus: () => Promise<PalworldRuntimeStatusDto>;
  };
  players: {
    getStatus: () => Promise<PalworldPlayersStatusDto>;
  };
  admin: {
    getStatus: () => Promise<PalworldAdminStatusDto>;
    executeAction: (request: PalworldAdminActionRequestDto) => Promise<PalworldAdminActionResultDto>;
  };
  config: {
    getStatus: () => Promise<PalworldConfigurationStatusDto>;
    read: () => Promise<PalworldConfigurationFileDto>;
    save: (request: PalworldSaveConfigurationRequestDto) => Promise<OperationAcceptedDto>;
    restoreDefault: (request: PalworldRestoreDefaultConfigurationRequestDto) => Promise<OperationAcceptedDto>;
    createDefault: (request: PalworldCreateDefaultConfigurationRequestDto) => Promise<OperationAcceptedDto>;
  };
  firewall: {
    getStatus: () => Promise<FirewallStatusDto>;
    applyRules: (request: FirewallApplyRulesRequestDto) => Promise<OperationAcceptedDto>;
  };
  network: {
    getLocalAddresses: () => Promise<string[]>;
    getPublicAddress: (request?: PublicAddressRequestDto) => Promise<NetworkDiagnosticsDto>;
  };
  backup: {
    getSummary: () => Promise<BackupSummaryDto>;
    createConfiguration: (request: BackupCreateRequestDto) => Promise<OperationAcceptedDto>;
    createWorld: (request: BackupCreateRequestDto) => Promise<OperationAcceptedDto>;
    restore: (request: BackupRestoreRequestDto) => Promise<OperationAcceptedDto>;
    delete: (request: BackupDeleteRequestDto) => Promise<OperationAcceptedDto>;
  };
  logs: {
    getRecent: (request?: LogsRecentRequestDto) => Promise<LogsRecentDto>;
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
      ipcRenderer.invoke(ipcChannels.serverInstall, request) as Promise<OperationAcceptedDto>,
    update: (request) =>
      ipcRenderer.invoke(ipcChannels.serverUpdate, request) as Promise<OperationAcceptedDto>,
    start: (request) =>
      ipcRenderer.invoke(ipcChannels.serverStart, request) as Promise<OperationAcceptedDto>,
    stop: (request) =>
      ipcRenderer.invoke(ipcChannels.serverStop, request) as Promise<OperationAcceptedDto>,
    getRuntimeStatus: () =>
      ipcRenderer.invoke(ipcChannels.serverGetRuntimeStatus) as Promise<PalworldRuntimeStatusDto>
  },
  players: {
    getStatus: () => ipcRenderer.invoke(ipcChannels.playersGetStatus) as Promise<PalworldPlayersStatusDto>
  },
  admin: {
    getStatus: () => ipcRenderer.invoke(ipcChannels.adminGetStatus) as Promise<PalworldAdminStatusDto>,
    executeAction: (request) =>
      ipcRenderer.invoke(ipcChannels.adminExecuteAction, request) as Promise<PalworldAdminActionResultDto>
  },
  config: {
    read: () => ipcRenderer.invoke(ipcChannels.configRead) as Promise<PalworldConfigurationFileDto>,
    getStatus: () => ipcRenderer.invoke(ipcChannels.configValidate) as Promise<PalworldConfigurationStatusDto>,
    save: (request) => ipcRenderer.invoke(ipcChannels.configSave, request) as Promise<OperationAcceptedDto>,
    restoreDefault: (request) =>
      ipcRenderer.invoke(ipcChannels.configRestoreDefault, request) as Promise<OperationAcceptedDto>,
    createDefault: (request) =>
      ipcRenderer.invoke(ipcChannels.configCreateDefault, request) as Promise<OperationAcceptedDto>
  },
  firewall: {
    getStatus: () => ipcRenderer.invoke(ipcChannels.firewallGetStatus) as Promise<FirewallStatusDto>,
    applyRules: (request) =>
      ipcRenderer.invoke(ipcChannels.firewallCreateRule, request) as Promise<OperationAcceptedDto>
  },
  network: {
    getLocalAddresses: () => ipcRenderer.invoke(ipcChannels.networkGetLocalAddresses) as Promise<string[]>,
    getPublicAddress: (request) =>
      ipcRenderer.invoke(ipcChannels.networkGetPublicAddress, request) as Promise<NetworkDiagnosticsDto>
  },
  backup: {
    getSummary: () => ipcRenderer.invoke(ipcChannels.backupGetSummary) as Promise<BackupSummaryDto>,
    createConfiguration: (request) =>
      ipcRenderer.invoke(ipcChannels.backupCreateConfiguration, request) as Promise<OperationAcceptedDto>,
    createWorld: (request) =>
      ipcRenderer.invoke(ipcChannels.backupCreateWorld, request) as Promise<OperationAcceptedDto>,
    restore: (request) =>
      ipcRenderer.invoke(ipcChannels.backupRestore, request) as Promise<OperationAcceptedDto>,
    delete: (request) =>
      ipcRenderer.invoke(ipcChannels.backupDelete, request) as Promise<OperationAcceptedDto>
  },
  logs: {
    getRecent: (request) => ipcRenderer.invoke(ipcChannels.logsGetRecent, request) as Promise<LogsRecentDto>
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
