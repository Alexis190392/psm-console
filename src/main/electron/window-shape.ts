import type { Rectangle } from 'electron';

const DEFAULT_CORNER_CUT = 18;
const TOP_LEFT_WING_RATIO = 0.28;
const TOP_RIGHT_WING_RATIO = 0.86;
const BOTTOM_LEFT_WING_RATIO = 0.22;
const BOTTOM_RIGHT_WING_RATIO = 0.86;

export function createTacticalWindowShape(
  width: number,
  height: number,
  cornerCut = DEFAULT_CORNER_CUT
): Rectangle[] {
  const safeWidth = Math.max(1, Math.floor(width));
  const safeHeight = Math.max(1, Math.floor(height));
  const cut = Math.max(
    0,
    Math.min(Math.floor(cornerCut), Math.floor(safeWidth / 2), Math.floor(safeHeight / 2))
  );

  if (cut === 0) {
    return [{ x: 0, y: 0, width: safeWidth, height: safeHeight }];
  }

  const rectangles: Rectangle[] = [];
  const topLeftWing = Math.round(safeWidth * TOP_LEFT_WING_RATIO);
  const topRightWing = Math.round(safeWidth * TOP_RIGHT_WING_RATIO);
  const bottomLeftWing = Math.round(safeWidth * BOTTOM_LEFT_WING_RATIO);
  const bottomRightWing = Math.round(safeWidth * BOTTOM_RIGHT_WING_RATIO);
  const denominator = Math.max(1, cut - 1);

  for (let row = 0; row < cut; row += 1) {
    const progress = row / denominator;
    const inset = cut - row;
    const leftEnd = Math.round(topLeftWing + (cut * progress));
    const rightStart = Math.round(topRightWing - (cut * progress));

    rectangles.push({
      x: inset,
      y: row,
      width: Math.max(1, leftEnd - inset),
      height: 1
    });
    rectangles.push({
      x: rightStart,
      y: row,
      width: Math.max(1, safeWidth - inset - rightStart),
      height: 1
    });
  }

  rectangles.push({
    x: 0,
    y: cut,
    width: safeWidth,
    height: safeHeight - (cut * 2)
  });

  for (let row = 0; row < cut; row += 1) {
    const progress = row / denominator;
    const inset = row + 1;
    const leftEnd = Math.round(bottomLeftWing + (cut * (1 - progress)));
    const rightStart = Math.round(bottomRightWing - (cut * (1 - progress)));

    rectangles.push({
      x: inset,
      y: safeHeight - cut + row,
      width: Math.max(1, leftEnd - inset),
      height: 1
    });
    rectangles.push({
      x: rightStart,
      y: safeHeight - cut + row,
      width: Math.max(1, safeWidth - inset - rightStart),
      height: 1
    });
  }

  return rectangles;
}
