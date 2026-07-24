import type { AdminTab } from '../views/admin-view';

export class AdminViewState {
  private activeTab: AdminTab = 'general';
  private menuOpen = false;
  private refreshInFlight = false;

  getTab(): AdminTab {
    return this.activeTab;
  }

  setTab(tab: AdminTab): void {
    this.activeTab = tab;
  }

  isTab(tab: AdminTab): boolean {
    return this.activeTab === tab;
  }

  setMenuOpen(open: boolean): void {
    this.menuOpen = open;
  }

  isMenuOpen(): boolean {
    return this.menuOpen;
  }

  beginRefresh(): boolean {
    if (this.refreshInFlight) {
      return false;
    }
    this.refreshInFlight = true;
    return true;
  }

  endRefresh(): void {
    this.refreshInFlight = false;
  }
}
