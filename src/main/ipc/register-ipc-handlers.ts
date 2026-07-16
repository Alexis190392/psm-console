import type { INestApplicationContext } from '@nestjs/common';
import { BrowserWindow, type IpcMain, type IpcMainInvokeEvent } from 'electron';
import { ApplicationStateService } from '../../backend/application-state/application-state.service';
import { OperationManagerService } from '../../backend/operations/operation-manager.service';
import { PalworldInstallationService } from '../../backend/palworld-installation/palworld-installation.service';
import { SteamCmdService } from '../../backend/steamcmd/steamcmd.service';
import { ipcChannels } from '../../shared/contracts/ipc-channels';
import type { PalworldInstallRequestDto } from '../../shared/dto/palworld-installation-status.dto';
import type { SteamCmdInstallRequestDto } from '../../shared/dto/steamcmd-status.dto';

export function registerIpcHandlers(
  ipcMain: Pick<IpcMain, 'handle'>,
  nestContext: INestApplicationContext
): void {
  const applicationStateService = nestContext.get(ApplicationStateService);
  const steamCmdService = nestContext.get(SteamCmdService);
  const palworldInstallationService = nestContext.get(PalworldInstallationService);
  const operationManagerService = nestContext.get(OperationManagerService);

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

  ipcMain.handle(ipcChannels.operationGet, (_event, request: { operationId: string }) =>
    operationManagerService.get(request.operationId)
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
