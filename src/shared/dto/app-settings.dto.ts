import type { BackupPolicyDto } from './backup-status.dto';
import type { RemoteApiSettingsDto } from './remote-api.dto';
import type { ServerIdlePolicyDto } from './server-idle-policy.dto';
import type { AppStartupStatusDto } from './app-startup.dto';

export interface AppSettingsDto {
  schemaVersion: 5;
  automation: {
    idleShutdown: ServerIdlePolicyDto;
    backups: BackupPolicyDto;
  };
  remoteApi: RemoteApiSettingsDto;
}

export interface AppSettingsStatusDto {
  settings: AppSettingsDto;
  portableRoot: string;
  settingsRelativePath: string;
  logsRelativePath: string;
  backupsRelativePath: string;
  serverBaseFolder?: string;
  startup?: AppStartupStatusDto;
}
