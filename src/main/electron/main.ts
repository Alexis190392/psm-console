import { app, BrowserWindow, ipcMain, protocol, screen } from 'electron';
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { APP_INFO } from '../../shared/constants/app-info';
import { createNestContext } from '../bootstrap/nest-bootstrap';
import { registerIpcHandlers } from '../ipc/register-ipc-handlers';
import { createMainWindowOptions, createSplashWindowOptions } from './window-options';

const RENDERER_PROTOCOL = 'palcm';
const RENDERER_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'"
].join('; ');

protocol.registerSchemesAsPrivileged([
  {
    scheme: RENDERER_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true
    }
  }
]);

function configureElectronRuntime(): void {
  const userDataPath = app.isPackaged
    ? join(dirname(app.getPath('exe')), 'app-data')
    : join(process.cwd(), 'ejecucionPruebas', 'app-data');

  mkdirSync(userDataPath, { recursive: true });
  app.setPath('userData', userDataPath);
  app.disableHardwareAcceleration();
}

function configureAppIdentity(): void {
  app.setName(APP_INFO.displayName);

  if (process.platform === 'win32') {
    app.setAppUserModelId(APP_INFO.appId);
  }
}

function resolveRendererRoot(): string {
  return app.isPackaged ? join(__dirname, '..', '..', 'renderer') : join(process.cwd(), 'dist', 'renderer');
}

function resolveContentType(filePath: string): string {
  if (filePath.endsWith('.html')) {
    return 'text/html; charset=utf-8';
  }

  if (filePath.endsWith('.js')) {
    return 'text/javascript; charset=utf-8';
  }

  if (filePath.endsWith('.css')) {
    return 'text/css; charset=utf-8';
  }

  if (filePath.endsWith('.png')) {
    return 'image/png';
  }

  return 'application/octet-stream';
}

function registerRendererProtocol(): void {
  const rendererRoot = resolveRendererRoot();

  protocol.handle(RENDERER_PROTOCOL, async (request) => {
    const requestUrl = new URL(request.url);
    const relativePath = decodeURIComponent(requestUrl.pathname.replace(/^\/+/, '')) || 'index.html';
    const filePath = resolve(rendererRoot, relativePath);
    const relativeToRoot = relative(rendererRoot, filePath);

    if (relativeToRoot.startsWith('..')) {
      return new Response('Ruta no permitida', { status: 403 });
    }

    const fileBuffer = await readFile(filePath);
    const fileBody = new ArrayBuffer(fileBuffer.byteLength);
    new Uint8Array(fileBody).set(fileBuffer);

    return new Response(fileBody, {
      headers: {
        'content-type': resolveContentType(filePath),
        'content-security-policy': RENDERER_CSP
      }
    });
  });
}

async function createSplashWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow(createSplashWindowOptions());
  window.setIgnoreMouseEvents(true);
  await window.loadURL(`${RENDERER_PROTOCOL}://app/splash.html`);
  window.show();
  return window;
}

async function createMainWindow(splashWindow?: BrowserWindow): Promise<BrowserWindow> {
  const { workAreaSize } = screen.getPrimaryDisplay();
  const window = new BrowserWindow(
    {
      ...createMainWindowOptions({
        width: Math.max(1100, Math.min(1440, workAreaSize.width)),
        height: Math.max(700, Math.min(900, workAreaSize.height))
      }),
      show: false
    }
  );

  const readyToShow = new Promise<void>((resolveReady) => {
    window.once('ready-to-show', resolveReady);
  });
  await window.loadURL(`${RENDERER_PROTOCOL}://app/index.html`);
  await readyToShow;

  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.destroy();
  }
  window.show();

  return window;
}

async function bootstrap(): Promise<void> {
  configureElectronRuntime();
  configureAppIdentity();

  process.env['PALCM_ELECTRON_IS_PACKAGED'] = app.isPackaged ? 'true' : 'false';
  process.env['PALCM_ELECTRON_EXE_PATH'] = app.getPath('exe');

  await app.whenReady();
  registerRendererProtocol();
  const splashWindow = await createSplashWindow();

  const nestContext = await createNestContext();
  registerIpcHandlers(ipcMain, nestContext);
  app.once('before-quit', () => {
    void nestContext.close();
  });

  await createMainWindow(splashWindow);

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
