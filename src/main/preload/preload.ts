import { contextBridge, ipcRenderer } from 'electron';
import type { AllowedActionsDto } from '../../shared/dto/allowed-actions.dto';
import type { ApplicationStatusDto } from '../../shared/dto/application-status.dto';
import type { AppProcessMetricsDto } from '../../shared/dto/app-process-metrics.dto';
import type { AppSettingsStatusDto } from '../../shared/dto/app-settings.dto';
import type {
  BackupCreateRequestDto,
  BackupDeleteRequestDto,
  BackupRestoreRequestDto,
  BackupSummaryDto,
  BackupUpdatePolicyRequestDto,
  BackupVerifyRequestDto
} from '../../shared/dto/backup-status.dto';
import type {
  OperationAcceptedDto,
  OperationCancelRequestDto,
  OperationProgressDto
} from '../../shared/dto/operation-progress.dto';
import type {
  FirewallApplyRulesRequestDto,
  FirewallDiagnosticProgressDto,
  FirewallDiagnosticRequestDto,
  FirewallStatusDto
} from '../../shared/dto/firewall-status.dto';
import type {
  LogFileContentDto,
  LogFileReadRequestDto,
  LogFilesDto,
  LogsRecentDto,
  LogsRecentRequestDto
} from '../../shared/dto/log-status.dto';
import type {
  ServerIdlePolicyUpdateRequestDto,
  ServerIdleStatusDto
} from '../../shared/dto/server-idle-policy.dto';
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
  PalworldRepairRequestDto,
  PalworldUpdateRequestDto
} from '../../shared/dto/palworld-installation-status.dto';
import type {
  PalworldQueryPortStatusDto,
  PalworldRuntimeStatusDto,
  PalworldRestartRequestDto,
  PalworldStartRequestDto,
  PalworldStopQueryPortOwnerRequestDto,
  PalworldStopRequestDto
} from '../../shared/dto/palworld-runtime-status.dto';
import type {
  PalworldAdminActionRequestDto,
  PalworldAdminActionResultDto,
  PalworldAdminStatusDto
} from '../../shared/dto/palworld-admin.dto';
import type { PalworldPlayersStatusDto } from '../../shared/dto/palworld-players-status.dto';
import type {
  SteamCmdInstallRequestDto,
  SteamCmdRepairRequestDto,
  SteamCmdStatusDto
} from '../../shared/dto/steamcmd-status.dto';
import type { NetworkDiagnosticsDto, PublicAddressRequestDto } from '../../shared/dto/network-diagnostics.dto';
import type { AppUpdateStatusDto } from '../../shared/dto/app-update-status.dto';
import type { RemoteApiStatusDto, RemoteApiUpdateRequestDto } from '../../shared/dto/remote-api.dto';

const ipcChannels = {
  appGetStatus: 'app:get-status',
  appGetActions: 'app:get-actions',
  appGetProcessMetrics: 'app:get-process-metrics',
  appSettingsGetStatus: 'app-settings:get-status',
  remoteApiGetStatus: 'remote-api:get-status',
  remoteApiUpdate: 'remote-api:update',
  updateGetStatus: 'update:get-status',
  updateOpenRelease: 'update:open-release',
  operationGet: 'operation:get',
  operationCancel: 'operation:cancel',
  steamCmdGetStatus: 'steamcmd:get-status',
  steamCmdInstall: 'steamcmd:install',
  steamCmdRepair: 'steamcmd:repair',
  serverGetInstallationStatus: 'server:get-installation-status',
  serverInstall: 'server:install',
  serverUpdate: 'server:update',
  serverRepair: 'server:repair',
  serverStart: 'server:start',
  serverStop: 'server:stop',
  serverRestart: 'server:restart',
  serverGetRuntimeStatus: 'server:get-runtime-status',
  serverGetQueryPortStatus: 'server:get-query-port-status',
  serverStopQueryPortOwner: 'server:stop-query-port-owner',
  playersGetStatus: 'players:get-status',
  serverIdleGetStatus: 'server-idle:get-status',
  serverIdleUpdatePolicy: 'server-idle:update-policy',
  adminGetStatus: 'admin:get-status',
  adminExecuteAction: 'admin:execute-action',
  configRead: 'config:read',
  configValidate: 'config:validate',
  configSave: 'config:save',
  configCreateDefault: 'config:create-default',
  configRestoreDefault: 'config:restore-default',
  firewallGetStatus: 'firewall:get-status',
  firewallDiagnosticProgress: 'firewall:diagnostic-progress',
  firewallCreateRule: 'firewall:create-rule',
  networkGetLocalAddresses: 'network:get-local-addresses',
  networkGetPublicAddress: 'network:get-public-address',
  backupGetSummary: 'backup:get-summary',
  backupUpdatePolicy: 'backup:update-policy',
  backupVerify: 'backup:verify',
  backupCreateConfiguration: 'backup:create-configuration',
  backupCreateWorld: 'backup:create-world',
  backupRestore: 'backup:restore',
  backupDelete: 'backup:delete',
  logsGetRecent: 'logs:get-recent',
  logsListFiles: 'logs:list-files',
  logsReadFile: 'logs:read-file',
  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggle-maximize',
  windowClose: 'window:close'
} as const;

export interface PalcmApi {
  app: {
    getStatus: () => Promise<ApplicationStatusDto>;
    getActions: () => Promise<AllowedActionsDto>;
    getProcessMetrics: () => Promise<AppProcessMetricsDto>;
  };
  appSettings: {
    getStatus: () => Promise<AppSettingsStatusDto>;
  };
  remoteApi: {
    getStatus: () => Promise<RemoteApiStatusDto>;
    update: (request: RemoteApiUpdateRequestDto) => Promise<RemoteApiStatusDto>;
  };
  update: {
    getStatus: () => Promise<AppUpdateStatusDto>;
    openRelease: () => Promise<void>;
  };
  operation: {
    get: (operationId: string) => Promise<OperationProgressDto>;
    cancel: (request: OperationCancelRequestDto) => Promise<OperationProgressDto>;
  };
  steamCmd: {
    getStatus: () => Promise<SteamCmdStatusDto>;
    install: (request: SteamCmdInstallRequestDto) => Promise<OperationAcceptedDto>;
    repair: (request: SteamCmdRepairRequestDto) => Promise<OperationAcceptedDto>;
  };
  server: {
    getInstallationStatus: () => Promise<PalworldInstallationStatusDto>;
    install: (request: PalworldInstallRequestDto) => Promise<OperationAcceptedDto>;
    update: (request: PalworldUpdateRequestDto) => Promise<OperationAcceptedDto>;
    repair: (request: PalworldRepairRequestDto) => Promise<OperationAcceptedDto>;
    start: (request: PalworldStartRequestDto) => Promise<OperationAcceptedDto>;
    stop: (request: PalworldStopRequestDto) => Promise<OperationAcceptedDto>;
    restart: (request: PalworldRestartRequestDto) => Promise<OperationAcceptedDto>;
    getRuntimeStatus: () => Promise<PalworldRuntimeStatusDto>;
    getQueryPortStatus: () => Promise<PalworldQueryPortStatusDto>;
    stopQueryPortOwner: (request: PalworldStopQueryPortOwnerRequestDto) => Promise<OperationAcceptedDto>;
  };
  players: {
    getStatus: () => Promise<PalworldPlayersStatusDto>;
  };
  serverIdle: {
    getStatus: () => Promise<ServerIdleStatusDto>;
    updatePolicy: (request: ServerIdlePolicyUpdateRequestDto) => Promise<ServerIdleStatusDto>;
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
    getStatus: (request: FirewallDiagnosticRequestDto) => Promise<FirewallStatusDto>;
    onDiagnosticProgress: (listener: (progress: FirewallDiagnosticProgressDto) => void) => () => void;
    applyRules: (request: FirewallApplyRulesRequestDto) => Promise<OperationAcceptedDto>;
  };
  network: {
    getLocalAddresses: () => Promise<string[]>;
    getPublicAddress: (request?: PublicAddressRequestDto) => Promise<NetworkDiagnosticsDto>;
  };
  backup: {
    getSummary: () => Promise<BackupSummaryDto>;
    updatePolicy: (request: BackupUpdatePolicyRequestDto) => Promise<OperationAcceptedDto>;
    verify: (request: BackupVerifyRequestDto) => Promise<OperationAcceptedDto>;
    createConfiguration: (request: BackupCreateRequestDto) => Promise<OperationAcceptedDto>;
    createWorld: (request: BackupCreateRequestDto) => Promise<OperationAcceptedDto>;
    restore: (request: BackupRestoreRequestDto) => Promise<OperationAcceptedDto>;
    delete: (request: BackupDeleteRequestDto) => Promise<OperationAcceptedDto>;
  };
  logs: {
    getRecent: (request?: LogsRecentRequestDto) => Promise<LogsRecentDto>;
    listFiles: () => Promise<LogFilesDto>;
    readFile: (request: LogFileReadRequestDto) => Promise<LogFileContentDto>;
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
    getActions: () => ipcRenderer.invoke(ipcChannels.appGetActions) as Promise<AllowedActionsDto>,
    getProcessMetrics: () =>
      ipcRenderer.invoke(ipcChannels.appGetProcessMetrics) as Promise<AppProcessMetricsDto>
  },
  appSettings: {
    getStatus: () => ipcRenderer.invoke(ipcChannels.appSettingsGetStatus) as Promise<AppSettingsStatusDto>
  },
  remoteApi: {
    getStatus: () => ipcRenderer.invoke(ipcChannels.remoteApiGetStatus) as Promise<RemoteApiStatusDto>,
    update: (request) =>
      ipcRenderer.invoke(ipcChannels.remoteApiUpdate, request) as Promise<RemoteApiStatusDto>
  },
  update: {
    getStatus: () => ipcRenderer.invoke(ipcChannels.updateGetStatus) as Promise<AppUpdateStatusDto>,
    openRelease: () => ipcRenderer.invoke(ipcChannels.updateOpenRelease) as Promise<void>
  },
  operation: {
    get: (operationId) =>
      ipcRenderer.invoke(ipcChannels.operationGet, { operationId }) as Promise<OperationProgressDto>,
    cancel: (request) =>
      ipcRenderer.invoke(ipcChannels.operationCancel, request) as Promise<OperationProgressDto>
  },
  steamCmd: {
    getStatus: () => ipcRenderer.invoke(ipcChannels.steamCmdGetStatus) as Promise<SteamCmdStatusDto>,
    install: (request) =>
      ipcRenderer.invoke(ipcChannels.steamCmdInstall, request) as Promise<OperationAcceptedDto>,
    repair: (request) =>
      ipcRenderer.invoke(ipcChannels.steamCmdRepair, request) as Promise<OperationAcceptedDto>
  },
  server: {
    getInstallationStatus: () =>
      ipcRenderer.invoke(ipcChannels.serverGetInstallationStatus) as Promise<PalworldInstallationStatusDto>,
    install: (request) =>
      ipcRenderer.invoke(ipcChannels.serverInstall, request) as Promise<OperationAcceptedDto>,
    update: (request) =>
      ipcRenderer.invoke(ipcChannels.serverUpdate, request) as Promise<OperationAcceptedDto>,
    repair: (request) =>
      ipcRenderer.invoke(ipcChannels.serverRepair, request) as Promise<OperationAcceptedDto>,
    start: (request) =>
      ipcRenderer.invoke(ipcChannels.serverStart, request) as Promise<OperationAcceptedDto>,
    stop: (request) =>
      ipcRenderer.invoke(ipcChannels.serverStop, request) as Promise<OperationAcceptedDto>,
    restart: (request) =>
      ipcRenderer.invoke(ipcChannels.serverRestart, request) as Promise<OperationAcceptedDto>,
    getRuntimeStatus: () =>
      ipcRenderer.invoke(ipcChannels.serverGetRuntimeStatus) as Promise<PalworldRuntimeStatusDto>,
    getQueryPortStatus: () =>
      ipcRenderer.invoke(ipcChannels.serverGetQueryPortStatus) as Promise<PalworldQueryPortStatusDto>,
    stopQueryPortOwner: (request) =>
      ipcRenderer.invoke(ipcChannels.serverStopQueryPortOwner, request) as Promise<OperationAcceptedDto>
  },
  players: {
    getStatus: () => ipcRenderer.invoke(ipcChannels.playersGetStatus) as Promise<PalworldPlayersStatusDto>
  },
  serverIdle: {
    getStatus: () => ipcRenderer.invoke(ipcChannels.serverIdleGetStatus) as Promise<ServerIdleStatusDto>,
    updatePolicy: (request) =>
      ipcRenderer.invoke(ipcChannels.serverIdleUpdatePolicy, request) as Promise<ServerIdleStatusDto>
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
    getStatus: (request) =>
      ipcRenderer.invoke(ipcChannels.firewallGetStatus, request) as Promise<FirewallStatusDto>,
    onDiagnosticProgress: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: FirewallDiagnosticProgressDto): void => {
        listener(progress);
      };
      ipcRenderer.on(ipcChannels.firewallDiagnosticProgress, handler);
      return () => {
        ipcRenderer.removeListener(ipcChannels.firewallDiagnosticProgress, handler);
      };
    },
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
    updatePolicy: (request) =>
      ipcRenderer.invoke(ipcChannels.backupUpdatePolicy, request) as Promise<OperationAcceptedDto>,
    verify: (request) =>
      ipcRenderer.invoke(ipcChannels.backupVerify, request) as Promise<OperationAcceptedDto>,
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
    getRecent: (request) => ipcRenderer.invoke(ipcChannels.logsGetRecent, request) as Promise<LogsRecentDto>,
    listFiles: () => ipcRenderer.invoke(ipcChannels.logsListFiles) as Promise<LogFilesDto>,
    readFile: (request) =>
      ipcRenderer.invoke(ipcChannels.logsReadFile, request) as Promise<LogFileContentDto>
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
