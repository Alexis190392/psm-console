import { app, BrowserWindow, ipcMain, screen } from 'electron';
import { join } from 'node:path';
import { APP_INFO } from '../../shared/constants/app-info';
import { createNestContext } from '../bootstrap/nest-bootstrap';
import { registerIpcHandlers } from '../ipc/register-ipc-handlers';
import { createMainWindowOptions } from './window-options';

function configureAppIdentity(): void {
  app.setName(APP_INFO.displayName);
  process.title = APP_INFO.packageProductName;

  if (process.platform === 'win32') {
    app.setAppUserModelId(APP_INFO.appId);
  }

  app.setAboutPanelOptions({
    applicationName: APP_INFO.displayName,
    applicationVersion: APP_INFO.version,
    copyright: `Copyright 2026 ${APP_INFO.authorName} (${APP_INFO.authorAlias})`
  });
}

async function createMainWindow(): Promise<BrowserWindow> {
  const { workAreaSize } = screen.getPrimaryDisplay();
  const window = new BrowserWindow(
    createMainWindowOptions({
      width: Math.max(1100, Math.min(1440, workAreaSize.width)),
      height: Math.max(700, Math.min(900, workAreaSize.height))
    })
  );

  if (app.isPackaged) {
    await window.loadFile(join(__dirname, '..', '..', 'renderer', 'index.html'));
  } else {
    await window.loadFile(join(process.cwd(), 'dist', 'renderer', 'index.html'));
  }

  return window;
}

async function bootstrap(): Promise<void> {
  configureAppIdentity();

  process.env['PALCM_ELECTRON_IS_PACKAGED'] = app.isPackaged ? 'true' : 'false';
  process.env['PALCM_ELECTRON_EXE_PATH'] = app.getPath('exe');

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
