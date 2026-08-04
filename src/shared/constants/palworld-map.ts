export type PalworldMapId = 'world' | 'tree';

export interface PalworldMapLayerDefinition {
  id: PalworldMapId;
  imageWidth: number;
  imageHeight: number;
  imageToWorld: {
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;
  };
}

export interface PalworldMapBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export const PALWORLD_MAP_LAYERS: readonly PalworldMapLayerDefinition[] = [
  {
    id: 'world',
    imageWidth: 8_192,
    imageHeight: 8_192,
    imageToWorld: {
      a: 0.375711236,
      b: -0.0156508073,
      c: -1823.80271,
      d: -0.00463658188,
      e: -0.385279301,
      f: 1056.84169
    }
  },
  {
    id: 'tree',
    imageWidth: 8_192,
    imageHeight: 8_192,
    imageToWorld: {
      a: 0.0862548982233,
      b: 0.00221230612851,
      c: -2123.2121,
      d: -0.0005399869936045,
      e: -0.08862828935115,
      f: 1769.06075
    }
  }
] as const;

export const PALWORLD_MAP_LAYER_BOUNDS: Readonly<Record<PalworldMapId, PalworldMapBounds>> = {
  world: calculateMapBounds(PALWORLD_MAP_LAYERS.filter(({ id }) => id === 'world')),
  tree: calculateMapBounds(PALWORLD_MAP_LAYERS.filter(({ id }) => id === 'tree'))
};

const SAV_COORDINATE_TRANSFORM = {
  offsetForLocationY: -157664.55791065,
  offsetForLocationX: 123467.1611767,
  scale: 462.962962963,
  postCorrection: {
    xFromX: 1.00839296,
    xFromY: -0.000291515566,
    xOffset: -0.723745275,
    yFromX: -0.000516414825,
    yFromY: 1.00833931,
    yOffset: 0.172689105
  }
} as const;

export function getPalworldMapPosition(
  rawX: number,
  rawY: number,
  mapId: PalworldMapId = 'world'
): { left: string; top: string } {
  const worldPosition = normalizePalworldPosition(rawX, rawY);
  const bounds = PALWORLD_MAP_LAYER_BOUNDS[mapId];
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const left = ((worldPosition.x - bounds.minX) / width) * 100;
  const top = ((bounds.maxY - worldPosition.y) / height) * 100;

  return {
    left: clampPercentage(left).toFixed(2),
    top: clampPercentage(top).toFixed(2)
  };
}

export function isPalworldPositionInMap(rawX: number, rawY: number, mapId: PalworldMapId): boolean {
  const position = normalizePalworldPosition(rawX, rawY);
  const bounds = PALWORLD_MAP_LAYER_BOUNDS[mapId];
  return position.x >= bounds.minX && position.x <= bounds.maxX &&
    position.y >= bounds.minY && position.y <= bounds.maxY;
}

function normalizePalworldPosition(rawX: number, rawY: number): { x: number; y: number } {
  if (Math.abs(rawX) <= 2_000 && Math.abs(rawY) <= 2_000) {
    return { x: rawX, y: rawY };
  }

  const baseX = (rawY + SAV_COORDINATE_TRANSFORM.offsetForLocationY) /
    SAV_COORDINATE_TRANSFORM.scale;
  const baseY = (rawX + SAV_COORDINATE_TRANSFORM.offsetForLocationX) /
    SAV_COORDINATE_TRANSFORM.scale;
  const correction = SAV_COORDINATE_TRANSFORM.postCorrection;

  return {
    x: (baseX * correction.xFromX) + (baseY * correction.xFromY) + correction.xOffset,
    y: (baseX * correction.yFromX) + (baseY * correction.yFromY) + correction.yOffset
  };
}

function calculateMapBounds(layers: readonly PalworldMapLayerDefinition[]): PalworldMapBounds {
  const points = layers.flatMap((layer) => {
    const transform = layer.imageToWorld;
    const corners: ReadonlyArray<readonly [number, number]> = [
      [0, 0],
      [layer.imageWidth, 0],
      [0, layer.imageHeight],
      [layer.imageWidth, layer.imageHeight]
    ];

    return corners.map(([imageX, imageY]) => ({
      x: (transform.a * imageX) + (transform.b * imageY) + transform.c,
      y: (transform.d * imageX) + (transform.e * imageY) + transform.f
    }));
  });

  return {
    minX: Math.min(...points.map(({ x }) => x)),
    maxX: Math.max(...points.map(({ x }) => x)),
    minY: Math.min(...points.map(({ y }) => y)),
    maxY: Math.max(...points.map(({ y }) => y))
  };
}

function clampPercentage(value: number): number {
  return Math.min(100, Math.max(0, value));
}
