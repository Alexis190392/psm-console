import { app, type BrowserWindowConstructorOptions } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { APP_INFO } from '../../shared/constants/app-info';

export interface MainWindowSize {
  width: number;
  height: number;
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
    title: APP_INFO.displayName,
    titleBarStyle: 'hidden',
    ...(icon ? { icon } : {}),
    backgroundColor: '#0b0f13',
    webPreferences: {
      preload: join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  };
}
