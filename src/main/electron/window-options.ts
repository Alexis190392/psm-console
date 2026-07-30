import { app, type BrowserWindowConstructorOptions } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { APP_INFO } from '../../shared/constants/app-info';

export interface MainWindowSize {
  width: number;
  height: number;
}

export function createSplashWindowOptions(): BrowserWindowConstructorOptions {
  return {
    width: 240,
    height: 240,
    center: true,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  };
}

function resolveWindowIcon(): string | undefined {
  const electronApp = app as { isPackaged?: boolean } | undefined;
  const resourcesPath = typeof process.resourcesPath === 'string' ? process.resourcesPath : process.cwd();
  const candidates = electronApp?.isPackaged
    ? [join(resourcesPath, 'palcm-logo.ico')]
    : [join(process.cwd(), 'build', 'palcm-logo.ico')];

  return candidates.find((candidate) => existsSync(candidate));
}

export function createMainWindowOptions(size: MainWindowSize = { width: 1440, height: 900 }): BrowserWindowConstructorOptions {
  const icon = resolveWindowIcon();

  return {
    width: size.width,
    height: size.height,
    minWidth: 1100,
    minHeight: 700,
    center: true,
    movable: true,
    frame: false,
    thickFrame: false,
    transparent: true,
    hasShadow: false,
    title: APP_INFO.displayName,
    titleBarStyle: 'hidden',
    ...(icon ? { icon } : {}),
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  };
}
