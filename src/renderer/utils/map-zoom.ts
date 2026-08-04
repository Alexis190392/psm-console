export function calculateAnchoredMapScroll(
  currentScroll: number,
  pointerPosition: number,
  currentZoom: number,
  nextZoom: number
): number {
  const safeCurrentZoom = Math.max(1, currentZoom);
  const mapPosition = (currentScroll + pointerPosition) / safeCurrentZoom;

  return mapPosition * nextZoom - pointerPosition;
}
