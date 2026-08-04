import type { BrowserWindow, Rectangle } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export const MAIN_WINDOW_MINIMUM_SIZE = Object.freeze({ width: 500, height: 600 });
export const MAIN_WINDOW_PREFERRED_SIZE = Object.freeze({ width: 1440, height: 900 });

export interface PersistedMainWindowState {
  bounds: Rectangle;
  maximized: boolean;
}

function isFiniteRectangle(value: unknown): value is Rectangle {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const rectangle = value as Partial<Rectangle>;
  return [rectangle.x, rectangle.y, rectangle.width, rectangle.height]
    .every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate));
}

export function readPersistedMainWindowState(filePath: string): PersistedMainWindowState | null {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<PersistedMainWindowState>;
    if (!isFiniteRectangle(parsed.bounds) || typeof parsed.maximized !== 'boolean') {
      return null;
    }
    return { bounds: parsed.bounds, maximized: parsed.maximized };
  } catch {
    return null;
  }
}

function intersectionArea(first: Rectangle, second: Rectangle): number {
  const width = Math.max(
    0,
    Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x)
  );
  const height = Math.max(
    0,
    Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y)
  );
  return width * height;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function fitBoundsToWorkArea(bounds: Rectangle, workArea: Rectangle): Rectangle {
  const width = Math.min(
    Math.max(Math.round(bounds.width), MAIN_WINDOW_MINIMUM_SIZE.width),
    workArea.width
  );
  const height = Math.min(
    Math.max(Math.round(bounds.height), MAIN_WINDOW_MINIMUM_SIZE.height),
    workArea.height
  );

  return {
    x: clamp(Math.round(bounds.x), workArea.x, workArea.x + workArea.width - width),
    y: clamp(Math.round(bounds.y), workArea.y, workArea.y + workArea.height - height),
    width,
    height
  };
}

function createCenteredBounds(workArea: Rectangle): Rectangle {
  const width = Math.min(MAIN_WINDOW_PREFERRED_SIZE.width, workArea.width);
  const height = Math.min(MAIN_WINDOW_PREFERRED_SIZE.height, workArea.height);

  return {
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2),
    width,
    height
  };
}

function centerSavedSize(bounds: Rectangle, workArea: Rectangle): Rectangle {
  const fitted = fitBoundsToWorkArea({ ...bounds, x: workArea.x, y: workArea.y }, workArea);
  return {
    ...fitted,
    x: workArea.x + Math.round((workArea.width - fitted.width) / 2),
    y: workArea.y + Math.round((workArea.height - fitted.height) / 2)
  };
}

export function resolveInitialMainWindowState(
  persistedState: PersistedMainWindowState | null,
  workAreas: Rectangle[],
  preferredWorkArea: Rectangle
): PersistedMainWindowState {
  if (!persistedState || workAreas.length === 0) {
    return {
      bounds: createCenteredBounds(preferredWorkArea),
      maximized: false
    };
  }

  const matchingWorkArea = workAreas
    .map((workArea) => ({ workArea, overlap: intersectionArea(persistedState.bounds, workArea) }))
    .sort((first, second) => second.overlap - first.overlap)[0];

  const targetWorkArea = matchingWorkArea && matchingWorkArea.overlap > 0
    ? matchingWorkArea.workArea
    : preferredWorkArea;

  return {
    bounds: matchingWorkArea && matchingWorkArea.overlap > 0
      ? fitBoundsToWorkArea(persistedState.bounds, targetWorkArea)
      : centerSavedSize(persistedState.bounds, targetWorkArea),
    maximized: persistedState.maximized
  };
}

export function persistMainWindowState(filePath: string, window: BrowserWindow): void {
  if (window.isDestroyed() || window.isMinimized()) {
    return;
  }

  const state: PersistedMainWindowState = {
    bounds: window.getNormalBounds(),
    maximized: window.isMaximized()
  };

  try {
    writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  } catch {
    // Window persistence must never prevent the application from closing.
  }
}

export function trackMainWindowState(filePath: string, window: BrowserWindow): void {
  let persistenceTimer: NodeJS.Timeout | undefined;

  const schedulePersistence = (): void => {
    if (persistenceTimer) {
      clearTimeout(persistenceTimer);
    }
    persistenceTimer = setTimeout(() => {
      persistMainWindowState(filePath, window);
    }, 250);
  };

  window.on('move', schedulePersistence);
  window.on('resize', schedulePersistence);
  window.on('maximize', schedulePersistence);
  window.on('unmaximize', schedulePersistence);
  window.on('close', () => {
    if (persistenceTimer) {
      clearTimeout(persistenceTimer);
    }
    persistMainWindowState(filePath, window);
  });
}
