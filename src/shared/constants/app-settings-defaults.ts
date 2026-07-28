import type { BackupPolicyDto } from '../dto/backup-status.dto';
import type { RemoteApiSettingsDto } from '../dto/remote-api.dto';
import type { ServerIdlePolicyDto } from '../dto/server-idle-policy.dto';

export const DEFAULT_BACKUP_POLICY: BackupPolicyDto = {
  automaticEnabled: false,
  automaticIntervalHours: 24,
  automaticRetentionPerType: 10,
  compressWorldBackups: false
};

export const DEFAULT_SERVER_IDLE_POLICY: ServerIdlePolicyDto = {
  enabled: false,
  emptySeconds: 300
};

export const DEFAULT_REMOTE_API_SETTINGS: RemoteApiSettingsDto = {
  enabled: false,
  bindMode: 'LOCAL_ONLY',
  port: 8213,
  username: 'admin',
  passwordConfigured: false,
  client: {
    enabled: false,
    bindMode: 'LOCAL_ONLY',
    port: 8213,
    username: 'cliente',
    passwordConfigured: false,
    permissions: [
      'GENERAL',
      'SERVER_START',
      'SERVER_RESTART',
      'SERVER_STOP',
      'PLAYERS_VIEW',
      'LOGS'
    ]
  }
};
