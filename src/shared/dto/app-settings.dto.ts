import type { BackupPolicyDto } from './backup-status.dto';
import type { RemoteApiSettingsDto } from './remote-api.dto';
import type { ServerIdlePolicyDto } from './server-idle-policy.dto';

export interface AppSettingsDto {
  schemaVersion: 3;
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
}
