import type { BrowserWindowConstructorOptions } from 'electron';
import { join } from 'node:path';

export function createMainWindowOptions(): BrowserWindowConstructorOptions {
  return {
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'Palworld Server Manager',
    titleBarStyle: 'hidden',
    backgroundColor: '#0b0f13',
    webPreferences: {
      preload: join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  };
}
