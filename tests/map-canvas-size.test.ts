import { describe, expect, it } from 'vitest';
import {
  MAX_MAP_CANVAS_DIMENSION,
  calculateMapCanvasSize
} from '../src/renderer/utils/map-canvas-size';

describe('map canvas size', () => {
  it('uses a bounded pixel ratio for regular viewports', () => {
    expect(calculateMapCanvasSize(1_200, 800, 2)).toEqual({
      width: 1_800,
      height: 1_200
    });
  });

  it('caps zoomed canvases while preserving their aspect ratio', () => {
    const size = calculateMapCanvasSize(6_000, 3_000, 2);

    expect(size).toEqual({
      width: MAX_MAP_CANVAS_DIMENSION,
      height: MAX_MAP_CANVAS_DIMENSION / 2
    });
  });

  it('never returns an empty backing store', () => {
    expect(calculateMapCanvasSize(0, 0, 0)).toEqual({ width: 1, height: 1 });
  });
});
