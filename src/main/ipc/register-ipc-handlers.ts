import type { INestApplicationContext } from '@nestjs/common';
import { app, BrowserWindow, shell, type IpcMain, type IpcMainInvokeEvent, type ProcessMetric } from 'electron';
import { ApplicationStateService } from '../../backend/application-state/application-state.service';
import { BackupService } from '../../backend/backup/backup.service';
import { FirewallService } from '../../backend/firewall/firewall.service';
import { NetworkService } from '../../backend/network/network.service';
import { LoggingService } from '../../backend/logging/logging.service';
import { OperationManagerService } from '../../backend/operations/operation-manager.service';
import { PalworldAdminService } from '../../backend/palworld-admin/palworld-admin.service';
import { PalworldConfigurationService } from '../../backend/palworld-configuration/palworld-configuration.service';
import { PalworldInstallationService } from '../../backend/palworld-installation/palworld-installation.service';
import { PalworldPlayersService } from '../../backend/palworld-players/palworld-players.service';
import { PalworldProcessService } from '../../backend/palworld-process/palworld-process.service';
import { SteamCmdService } from '../../backend/steamcmd/steamcmd.service';
import { ipcChannels } from '../../shared/contracts/ipc-channels';
import type {
  PalworldRestoreDefaultConfigurationRequestDto,
  PalworldSaveConfigurationRequestDto
} from '../../shared/dto/palworld-configuration-file.dto';
import type { PalworldCreateDefaultConfigurationRequestDto } from '../../shared/dto/palworld-configuration-status.dto';
import type {
  PalworldInstallRequestDto,
  PalworldRepairRequestDto,
  PalworldUpdateRequestDto
} from '../../shared/dto/palworld-installation-status.dto';
import type {
  PalworldRestartRequestDto,
  PalworldStartRequestDto,
  PalworldStopQueryPortOwnerRequestDto,
  PalworldStopRequestDto
} from '../../shared/dto/palworld-runtime-status.dto';
import type { PalworldAdminActionRequestDto } from '../../shared/dto/palworld-admin.dto';
import type { SteamCmdInstallRequestDto, SteamCmdRepairRequestDto } from '../../shared/dto/steamcmd-status.dto';
import type { OperationCancelRequestDto } from '../../shared/dto/operation-progress.dto';
import type { FirewallApplyRulesRequestDto } from '../../shared/dto/firewall-status.dto';
import type {
  BackupCreateRequestDto,
  BackupDeleteRequestDto,
  BackupRestoreRequestDto,
  BackupUpdatePolicyRequestDto,
  BackupVerifyRequestDto
} from '../../shared/dto/backup-status.dto';
import type { LogsRecentRequestDto } from '../../shared/dto/log-status.dto';
import type { PublicAddressRequestDto } from '../../shared/dto/network-diagnostics.dto';
import type { AppProcessKind, AppProcessMetricDto, AppProcessMetricsDto } from '../../shared/dto/app-process-metrics.dto';

export function registerIpcHandlers(
  ipcMain: Pick<IpcMain, 'handle'>,
  nestContext: INestApplicationContext
): void {
  const applicationStateService = nestContext.get(ApplicationStateService);
  const steamCmdService = nestContext.get(SteamCmdService);
  const palworldInstallationService = nestContext.get(PalworldInstallationService);
  const palworldProcessService = nestContext.get(PalworldProcessService);
  const palworldPlayersService = nestContext.get(PalworldPlayersService);
  const palworldAdminService = nestContext.get(PalworldAdminService);
  const palworldConfigurationService = nestContext.get(PalworldConfigurationService);
  const operationManagerService = nestContext.get(OperationManagerService);
  const firewallService = nestContext.get(FirewallService);
  const networkService = nestContext.get(NetworkService);
  const backupService = nestContext.get(BackupService);
  const loggingService = nestContext.get(LoggingService);

  ipcMain.handle(ipcChannels.appGetStatus, () =>
    applicationStateService.getStatus()
  );

  ipcMain.handle(ipcChannels.appGetActions, () =>
    applicationStateService.getAllowedActions()
  );

  ipcMain.handle(ipcChannels.appGetProcessMetrics, () => getAppProcessMetrics());

  ipcMain.handle(ipcChannels.steamCmdGetStatus, () => steamCmdService.getStatus());

  ipcMain.handle(ipcChannels.steamCmdInstall, (_event, request: SteamCmdInstallRequestDto) =>
    steamCmdService.install(request)
  );

  ipcMain.handle(ipcChannels.steamCmdRepair, (_event, request: SteamCmdRepairRequestDto) =>
    steamCmdService.repair(request)
  );

  ipcMain.handle(ipcChannels.serverGetInstallationStatus, () =>
    palworldInstallationService.getStatus()
  );

  ipcMain.handle(ipcChannels.serverInstall, (_event, request: PalworldInstallRequestDto) =>
    palworldInstallationService.install(request)
  );

  ipcMain.handle(ipcChannels.serverUpdate, (_event, request: PalworldUpdateRequestDto) =>
    palworldInstallationService.update(request, () => palworldProcessService.getRuntimeStatus().state)
  );

  ipcMain.handle(ipcChannels.serverRepair, (_event, request: PalworldRepairRequestDto) =>
    palworldInstallationService.repair(request, () => palworldProcessService.getRuntimeStatus().state)
  );

  ipcMain.handle(ipcChannels.serverStart, (_event, request: PalworldStartRequestDto) =>
    palworldProcessService.start(request)
  );

  ipcMain.handle(ipcChannels.serverStop, (_event, request: PalworldStopRequestDto) =>
    palworldProcessService.stop(request)
  );

  ipcMain.handle(ipcChannels.serverRestart, (_event, request: PalworldRestartRequestDto) =>
    palworldProcessService.restart(request)
  );

  ipcMain.handle(ipcChannels.serverGetRuntimeStatus, () =>
    palworldProcessService.getRuntimeStatus()
  );

  ipcMain.handle(ipcChannels.serverGetQueryPortStatus, () =>
    palworldProcessService.getQueryPortStatus()
  );

  ipcMain.handle(ipcChannels.serverStopQueryPortOwner, (_event, request: PalworldStopQueryPortOwnerRequestDto) =>
    palworldProcessService.stopQueryPortOwner(request)
  );

  ipcMain.handle(ipcChannels.playersGetStatus, () =>
    palworldPlayersService.getStatus()
  );

  ipcMain.handle(ipcChannels.adminGetStatus, () =>
    palworldAdminService.getStatus()
  );

  ipcMain.handle(ipcChannels.adminExecuteAction, (_event, request: PalworldAdminActionRequestDto) =>
    palworldAdminService.execute(request)
  );

  ipcMain.handle(ipcChannels.configValidate, () => palworldConfigurationService.getStatus());

  ipcMain.handle(ipcChannels.configRead, () => palworldConfigurationService.readActive());

  ipcMain.handle(ipcChannels.configSave, (_event, request: PalworldSaveConfigurationRequestDto) =>
    palworldConfigurationService.saveActive(request)
  );

  ipcMain.handle(ipcChannels.configRestoreDefault, (_event, request: PalworldRestoreDefaultConfigurationRequestDto) =>
    palworldConfigurationService.restoreDefault(request)
  );

  ipcMain.handle(ipcChannels.configCreateDefault, (_event, request: PalworldCreateDefaultConfigurationRequestDto) =>
    palworldConfigurationService.createDefault(request)
  );

  ipcMain.handle(ipcChannels.operationGet, (_event, request: { operationId: string }) =>
    operationManagerService.get(request.operationId)
  );

  ipcMain.handle(ipcChannels.operationCancel, (_event, request: OperationCancelRequestDto) =>
    operationManagerService.cancel(request)
  );

  ipcMain.handle(ipcChannels.firewallGetStatus, () => firewallService.getStatus());

  ipcMain.handle(ipcChannels.firewallCreateRule, (_event, request: FirewallApplyRulesRequestDto) =>
    firewallService.applyRequiredRules(request)
  );

  ipcMain.handle(ipcChannels.networkGetLocalAddresses, () => networkService.getLocalAddresses());

  ipcMain.handle(ipcChannels.networkGetPublicAddress, (_event, request: PublicAddressRequestDto | undefined) =>
    networkService.getPublicAddress(request)
  );

  ipcMain.handle(ipcChannels.backupGetSummary, () => backupService.getSummary());

  ipcMain.handle(ipcChannels.backupUpdatePolicy, (_event, request: BackupUpdatePolicyRequestDto) =>
    backupService.updatePolicy(request)
  );

  ipcMain.handle(ipcChannels.backupVerify, (_event, request: BackupVerifyRequestDto) =>
    backupService.verifyBackup(request)
  );

  ipcMain.handle(ipcChannels.backupCreateConfiguration, (_event, request: BackupCreateRequestDto) =>
    backupService.createConfigurationBackup(request)
  );

  ipcMain.handle(ipcChannels.backupCreateWorld, (_event, request: BackupCreateRequestDto) =>
    backupService.createWorldBackup(request)
  );

  ipcMain.handle(ipcChannels.backupRestore, (_event, request: BackupRestoreRequestDto) =>
    backupService.restoreBackup(request)
  );

  ipcMain.handle(ipcChannels.backupDelete, (_event, request: BackupDeleteRequestDto) =>
    backupService.deleteBackup(request, (path) => shell.trashItem(path))
  );

  ipcMain.handle(ipcChannels.logsGetRecent, (_event, request: LogsRecentRequestDto | undefined) =>
    loggingService.readRecent(request)
  );

  ipcMain.handle(ipcChannels.windowMinimize, (event) => {
    getSenderWindow(event)?.minimize();
  });

  ipcMain.handle(ipcChannels.windowToggleMaximize, (event) => {
    const window = getSenderWindow(event);

    if (!window) {
      return;
    }

    if (window.isMaximized()) {
      window.unmaximize();
      return;
    }

    window.maximize();
  });

  ipcMain.handle(ipcChannels.windowClose, (event) => {
    getSenderWindow(event)?.close();
  });
}

function getSenderWindow(event: IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender);
}

function getAppProcessMetrics(): AppProcessMetricsDto {
  return {
    updatedAt: new Date().toISOString(),
    processes: app.getAppMetrics().map(toAppProcessMetric)
  };
}

function toAppProcessMetric(metric: ProcessMetric): AppProcessMetricDto {
  const descriptor = describeProcessMetric(metric);

  return {
    pid: metric.pid,
    kind: descriptor.kind,
    label: descriptor.label,
    detail: descriptor.detail,
    electronType: metric.type,
    serviceName: metric.serviceName ?? metric.name,
    cpuPercent: metric.cpu.percentCPUUsage,
    memoryBytes: metric.memory.workingSetSize * 1024,
    sandboxed: metric.sandboxed
  };
}

function describeProcessMetric(metric: ProcessMetric): { kind: AppProcessKind; label: string; detail: string } {
  if (metric.type === 'Browser') {
    return {
      kind: 'main',
      label: 'Principal',
      detail: 'Coordina la app, NestJS, estado e IPC.'
    };
  }

  if (metric.type === 'Tab') {
    return {
      kind: 'renderer',
      label: 'Interfaz',
      detail: 'Ventana visual y controles de usuario.'
    };
  }

  if (metric.type === 'GPU') {
    return {
      kind: 'gpu',
      label: 'Graficos',
      detail: 'Renderizado de la ventana.'
    };
  }

  if (metric.type === 'Utility') {
    return {
      kind: 'utility',
      label: normalizeUtilityServiceLabel(metric.name ?? metric.serviceName),
      detail: 'Servicio interno de Electron.'
    };
  }

  return {
    kind: 'other',
    label: 'Soporte',
    detail: `Proceso interno ${metric.type}.`
  };
}

function normalizeUtilityServiceLabel(name: string | undefined): string {
  const normalizedName = name?.trim();

  if (!normalizedName) {
    return 'Servicio';
  }

  if (/network/i.test(normalizedName)) {
    return 'Red interna';
  }

  if (/storage/i.test(normalizedName)) {
    return 'Almacenamiento';
  }

  if (/audio/i.test(normalizedName)) {
    return 'Audio';
  }

  return normalizedName;
}
