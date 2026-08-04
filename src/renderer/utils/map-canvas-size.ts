export const MAX_MAP_CANVAS_DIMENSION = 4_096;
export const MAX_MAP_CANVAS_PIXEL_RATIO = 1.5;

export interface MapCanvasSize {
  width: number;
  height: number;
}

export function calculateMapCanvasSize(
  stageWidth: number,
  stageHeight: number,
  devicePixelRatio: number
): MapCanvasSize {
  const pixelRatio = Math.min(Math.max(devicePixelRatio, 1), MAX_MAP_CANVAS_PIXEL_RATIO);
  const requestedWidth = Math.max(1, stageWidth * pixelRatio);
  const requestedHeight = Math.max(1, stageHeight * pixelRatio);
  const reduction = Math.min(
    1,
    MAX_MAP_CANVAS_DIMENSION / requestedWidth,
    MAX_MAP_CANVAS_DIMENSION / requestedHeight
  );

  return {
    width: Math.max(1, Math.round(requestedWidth * reduction)),
    height: Math.max(1, Math.round(requestedHeight * reduction))
  };
}
