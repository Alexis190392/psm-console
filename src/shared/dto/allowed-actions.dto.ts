export interface AllowedActionsDto {
  canInstallSteamCmd: boolean;
  canInstallServer: boolean;
  canEditConfiguration: boolean;
  canManageFirewall: boolean;
  canStartServer: boolean;
  canStopServer: boolean;
  canCreateBackup: boolean;
  canRestoreBackup: boolean;
}
