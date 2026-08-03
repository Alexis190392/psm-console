import { app, type BrowserWindowConstructorOptions } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { APP_INFO } from '../../shared/constants/app-info';
import { MAIN_WINDOW_MINIMUM_SIZE } from './window-state';

export interface MainWindowSize {
  width: number;
  height: number;
  x?: number;
  y?: number;
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
  const hasPosition = typeof size.x === 'number' && typeof size.y === 'number';

  return {
    width: size.width,
    height: size.height,
    ...(hasPosition ? { x: size.x, y: size.y } : {}),
    minWidth: MAIN_WINDOW_MINIMUM_SIZE.width,
    minHeight: MAIN_WINDOW_MINIMUM_SIZE.height,
    center: !hasPosition,
    resizable: true,
    maximizable: true,
    movable: true,
    thickFrame: true,
    roundedCorners: false,
    transparent: false,
    hasShadow: true,
    title: APP_INFO.displayName,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#061018',
      symbolColor: '#79e8f0',
      height: 48
    },
    ...(icon ? { icon } : {}),
    backgroundColor: '#050a10',
    webPreferences: {
      preload: join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  };
}
