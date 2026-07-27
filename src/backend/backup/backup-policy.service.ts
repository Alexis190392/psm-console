import { Injectable } from '@nestjs/common';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { DEFAULT_BACKUP_POLICY } from '../../shared/constants/app-settings-defaults';
import type { BackupPolicyDto, BackupUpdatePolicyRequestDto } from '../../shared/dto/backup-status.dto';

export { DEFAULT_BACKUP_POLICY };

@Injectable()
export class BackupPolicyService {
  constructor(private readonly appSettingsService: AppSettingsService) {}

  async read(): Promise<BackupPolicyDto> {
    return (await this.appSettingsService.read()).automation.backups;
  }

  async update(request: BackupUpdatePolicyRequestDto): Promise<BackupPolicyDto> {
    if (!request.confirmed) {
      throw new Error('BACKUP_POLICY_UPDATE_REQUIRES_CONFIRMATION');
    }

    return this.appSettingsService.updateBackupPolicy(validatePolicy(request));
  }
}

function validatePolicy(policy: BackupPolicyDto): BackupPolicyDto {
  if (typeof policy.automaticEnabled !== 'boolean' || typeof policy.compressWorldBackups !== 'boolean') {
    throw new Error('BACKUP_POLICY_BOOLEAN_INVALID');
  }
  if (!Number.isInteger(policy.automaticIntervalHours) || policy.automaticIntervalHours < 1 || policy.automaticIntervalHours > 168) {
    throw new Error('BACKUP_POLICY_INTERVAL_OUT_OF_RANGE');
  }
  if (
    !Number.isInteger(policy.automaticRetentionPerType) ||
    policy.automaticRetentionPerType < 1 ||
    policy.automaticRetentionPerType > 100
  ) {
    throw new Error('BACKUP_POLICY_RETENTION_OUT_OF_RANGE');
  }

  return {
    automaticEnabled: policy.automaticEnabled,
    automaticIntervalHours: policy.automaticIntervalHours,
    automaticRetentionPerType: policy.automaticRetentionPerType,
    compressWorldBackups: policy.compressWorldBackups
  };
}
