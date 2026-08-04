import { describe, expect, it } from 'vitest';
import { calculateAnchoredMapScroll } from '../src/renderer/utils/map-zoom';

describe('map zoom', () => {
  it('keeps the map coordinate below the pointer while zooming in', () => {
    const scroll = calculateAnchoredMapScroll(180, 720, 1.25, 1.5);

    expect(scroll).toBe(360);
    expect((scroll + 720) / 1.5).toBe((180 + 720) / 1.25);
  });

  it('returns to the original scroll after reversing the zoom', () => {
    const zoomedScroll = calculateAnchoredMapScroll(0, 720, 1, 2.5);
    const restoredScroll = calculateAnchoredMapScroll(zoomedScroll, 720, 2.5, 1);

    expect(restoredScroll).toBe(0);
  });
});
