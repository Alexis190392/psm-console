import type { INestApplicationContext } from '@nestjs/common';
import { BrowserWindow, type IpcMain, type IpcMainInvokeEvent } from 'electron';
import { ApplicationStateService } from '../../backend/application-state/application-state.service';
import { ipcChannels } from '../../shared/contracts/ipc-channels';

export function registerIpcHandlers(
  ipcMain: Pick<IpcMain, 'handle'>,
  nestContext: INestApplicationContext
): void {
  const applicationStateService = nestContext.get(ApplicationStateService);

  ipcMain.handle(ipcChannels.appGetStatus, () =>
    applicationStateService.getStatus()
  );

  ipcMain.handle(ipcChannels.appGetActions, () =>
    applicationStateService.getAllowedActions()
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
