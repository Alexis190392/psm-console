import { describe, expect, it } from 'vitest';
import { createTacticalWindowShape } from '../src/main/electron/window-shape';

describe('tactical window shape', () => {
  it('creates tactical top and bottom notches without removing the central surface', () => {
    const shape = createTacticalWindowShape(1100, 700, 18);

    expect(shape).toHaveLength(73);
    expect(shape[0]).toEqual({ x: 18, y: 0, width: 290, height: 1 });
    expect(shape[1]).toEqual({ x: 946, y: 0, width: 136, height: 1 });
    expect(shape[36]).toEqual({ x: 0, y: 18, width: 1100, height: 664 });
    expect(shape.at(-1)).toEqual({ x: 946, y: 699, width: 136, height: 1 });
  });

  it('falls back to one rectangle when no corner cut is requested', () => {
    expect(createTacticalWindowShape(1100, 700, 0)).toEqual([
      { x: 0, y: 0, width: 1100, height: 700 }
    ]);
  });
});
