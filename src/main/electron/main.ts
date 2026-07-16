import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { createNestContext } from '../bootstrap/nest-bootstrap';
import { registerIpcHandlers } from '../ipc/register-ipc-handlers';
import { createMainWindowOptions } from './window-options';

async function createMainWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow(createMainWindowOptions());

  if (app.isPackaged) {
    await window.loadFile(join(__dirname, '..', '..', 'renderer', 'index.html'));
  } else {
    await window.loadFile(join(process.cwd(), 'dist', 'renderer', 'index.html'));
  }

  return window;
}

async function bootstrap(): Promise<void> {
  const nestContext = await createNestContext();
  registerIpcHandlers(ipcMain, nestContext);

  await app.whenReady();
  await createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

void bootstrap();
