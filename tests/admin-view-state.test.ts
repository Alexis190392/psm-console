import { describe, expect, it } from 'vitest';
import { AdminViewState } from '../src/renderer/state/admin-view-state';

describe('AdminViewState', () => {
  it('tracks the selected tab and expanded menu independently', () => {
    const state = new AdminViewState();

    expect(state.getTab()).toBe('general');
    expect(state.isMenuOpen()).toBe(false);
    state.setTab('players');
    state.setMenuOpen(true);

    expect(state.isTab('players')).toBe(true);
    expect(state.isMenuOpen()).toBe(true);
  });

  it('prevents concurrent refreshes until the current one ends', () => {
    const state = new AdminViewState();

    expect(state.beginRefresh()).toBe(true);
    expect(state.beginRefresh()).toBe(false);
    state.endRefresh();
    expect(state.beginRefresh()).toBe(true);
  });
});
