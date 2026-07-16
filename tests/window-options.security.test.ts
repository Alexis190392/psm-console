import { describe, expect, it } from 'vitest';
import { createMainWindowOptions } from '../src/main/electron/window-options';

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
});
