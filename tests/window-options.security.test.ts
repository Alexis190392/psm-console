import { describe, expect, it } from 'vitest';
import {
  createMainWindowOptions,
  createSplashWindowOptions
} from '../src/main/electron/window-options';

describe('Electron window security options', () => {
  it('keeps the renderer isolated from Node.js', () => {
    const options = createMainWindowOptions();

    expect(options.webPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    });
  });

  it('uses a concrete preload script', () => {
    const options = createMainWindowOptions();

    expect(options.webPreferences?.preload).toContain('preload.js');
  });

  it('keeps the approved minimum size and accepts display-aware initial size', () => {
    const options = createMainWindowOptions({ width: 1200, height: 800 });

    expect(options.frame).not.toBe(false);
    expect(options).toMatchObject({
      width: 1200,
      height: 800,
      minWidth: 500,
      minHeight: 600,
      resizable: true,
      maximizable: true,
      movable: true,
      thickFrame: true,
      roundedCorners: false,
      transparent: false,
      hasShadow: true,
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#061018',
        symbolColor: '#79e8f0',
        height: 48
      },
      backgroundColor: '#050a10'
    });
  });

  it('keeps the splash transparent, isolated and outside the taskbar', () => {
    const options = createSplashWindowOptions();

    expect(options).toMatchObject({
      frame: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });
  });
});
