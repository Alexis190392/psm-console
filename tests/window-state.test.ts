import { describe, expect, it } from 'vitest';
import {
  MAIN_WINDOW_MINIMUM_SIZE,
  resolveInitialMainWindowState
} from '../src/main/electron/window-state';

describe('main window state', () => {
  const portraitWorkArea = { x: 0, y: 0, width: 1080, height: 1880 };

  it('centers the preferred window without exceeding a portrait display', () => {
    expect(resolveInitialMainWindowState(null, [portraitWorkArea], portraitWorkArea)).toEqual({
      bounds: { x: 0, y: 490, width: 1080, height: 900 },
      maximized: false
    });
  });

  it('restores and clamps a saved half-height window to the available work area', () => {
    const state = resolveInitialMainWindowState(
      {
        bounds: { x: -40, y: 940, width: 1100, height: 940 },
        maximized: false
      },
      [portraitWorkArea],
      portraitWorkArea
    );

    expect(state.bounds).toEqual({ x: 0, y: 940, width: 1080, height: 940 });
  });

  it('recovers an off-screen window on the preferred display', () => {
    const state = resolveInitialMainWindowState(
      {
        bounds: { x: 5000, y: 5000, width: 900, height: 700 },
        maximized: true
      },
      [portraitWorkArea],
      portraitWorkArea
    );

    expect(state.bounds).toEqual({ x: 90, y: 590, width: 900, height: 700 });
    expect(state.maximized).toBe(true);
  });

  it('keeps the documented compact minimum available', () => {
    expect(MAIN_WINDOW_MINIMUM_SIZE).toEqual({ width: 500, height: 600 });
  });
});
