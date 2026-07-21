import { describe, expect, it } from 'vitest';
import { isRendererView, NavigationState } from '../src/renderer/state/navigation-state';

describe('navigation state', () => {
  it('keeps current view typed and falls back to home for unknown values', () => {
    const state = new NavigationState();

    expect(state.current).toBe('home');
    expect(state.set('server')).toBe('server');
    expect(state.is('server')).toBe(true);
    expect(state.set('players')).toBe('players');
    expect(state.set('unknown')).toBe('home');
  });

  it('validates renderer view ids', () => {
    expect(isRendererView('network')).toBe(true);
    expect(isRendererView('players')).toBe(true);
    expect(isRendererView('settings')).toBe(false);
  });
});
