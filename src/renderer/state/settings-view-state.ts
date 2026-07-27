export type SettingsTab = 'application' | 'automation';

export class SettingsViewState {
  private activeTab: SettingsTab = 'application';
  private menuOpen = false;

  getTab(): SettingsTab {
    return this.activeTab;
  }

  setTab(tab: SettingsTab): void {
    this.activeTab = tab;
  }

  isTab(tab: SettingsTab): boolean {
    return this.activeTab === tab;
  }

  setMenuOpen(open: boolean): void {
    this.menuOpen = open;
  }

  isMenuOpen(): boolean {
    return this.menuOpen;
  }
}
