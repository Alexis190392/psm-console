import type { INestApplicationContext } from '@nestjs/common';
import { BrowserWindow, shell, type IpcMain, type IpcMainInvokeEvent } from 'electron';
import { ApplicationStateService } from '../../backend/application-state/application-state.service';
import { BackupService } from '../../backend/backup/backup.service';
import { FirewallService } from '../../backend/firewall/firewall.service';
import { NetworkService } from '../../backend/network/network.service';
import { LoggingService } from '../../backend/logging/logging.service';
import { OperationManagerService } from '../../backend/operations/operation-manager.service';
import { PalworldConfigurationService } from '../../backend/palworld-configuration/palworld-configuration.service';
import { PalworldInstallationService } from '../../backend/palworld-installation/palworld-installation.service';
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
  PalworldUpdateRequestDto
} from '../../shared/dto/palworld-installation-status.dto';
import type {
  PalworldStartRequestDto,
  PalworldStopRequestDto
} from '../../shared/dto/palworld-runtime-status.dto';
import type { SteamCmdInstallRequestDto } from '../../shared/dto/steamcmd-status.dto';
import type { FirewallApplyRulesRequestDto } from '../../shared/dto/firewall-status.dto';
import type {
  BackupCreateRequestDto,
  BackupDeleteRequestDto,
  BackupRestoreRequestDto
} from '../../shared/dto/backup-status.dto';
import type { LogsRecentRequestDto } from '../../shared/dto/log-status.dto';

export function registerIpcHandlers(
  ipcMain: Pick<IpcMain, 'handle'>,
  nestContext: INestApplicationContext
): void {
  const applicationStateService = nestContext.get(ApplicationStateService);
  const steamCmdService = nestContext.get(SteamCmdService);
  const palworldInstallationService = nestContext.get(PalworldInstallationService);
  const palworldProcessService = nestContext.get(PalworldProcessService);
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

  ipcMain.handle(ipcChannels.steamCmdGetStatus, () => steamCmdService.getStatus());

  ipcMain.handle(ipcChannels.steamCmdInstall, (_event, request: SteamCmdInstallRequestDto) =>
    steamCmdService.install(request)
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

  ipcMain.handle(ipcChannels.serverStart, (_event, request: PalworldStartRequestDto) =>
    palworldProcessService.start(request)
  );

  ipcMain.handle(ipcChannels.serverStop, (_event, request: PalworldStopRequestDto) =>
    palworldProcessService.stop(request)
  );

  ipcMain.handle(ipcChannels.serverGetRuntimeStatus, () =>
    palworldProcessService.getRuntimeStatus()
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

  ipcMain.handle(ipcChannels.firewallGetStatus, () => firewallService.getStatus());

  ipcMain.handle(ipcChannels.firewallCreateRule, (_event, request: FirewallApplyRulesRequestDto) =>
    firewallService.applyRequiredRules(request)
  );

  ipcMain.handle(ipcChannels.networkGetLocalAddresses, () => networkService.getLocalAddresses());

  ipcMain.handle(ipcChannels.backupGetSummary, () => backupService.getSummary());

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
