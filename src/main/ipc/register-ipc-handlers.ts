import type { INestApplicationContext } from '@nestjs/common';
import type { IpcMain } from 'electron';
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
}
