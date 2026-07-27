import type { BackupPolicyDto } from './backup-status.dto';
import type { ServerIdlePolicyDto } from './server-idle-policy.dto';

export interface AppSettingsDto {
  schemaVersion: 1;
  automation: {
    idleShutdown: ServerIdlePolicyDto;
    backups: BackupPolicyDto;
  };
}

export interface AppSettingsStatusDto {
  settings: AppSettingsDto;
  portableRoot: string;
  settingsRelativePath: string;
  logsRelativePath: string;
  backupsRelativePath: string;
}
