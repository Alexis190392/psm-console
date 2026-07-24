import { Injectable } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PortablePathService } from '../portable-path/portable-path.service';
import type { BackupPolicyDto, BackupUpdatePolicyRequestDto } from '../../shared/dto/backup-status.dto';

export const DEFAULT_BACKUP_POLICY: BackupPolicyDto = {
  automaticEnabled: false,
  automaticIntervalHours: 24,
  automaticRetentionPerType: 10,
  compressWorldBackups: false
};

@Injectable()
export class BackupPolicyService {
  constructor(private readonly portablePathService: PortablePathService) {}

  async read(): Promise<BackupPolicyDto> {
    const path = this.getPolicyPath();
    if (!existsSync(path)) {
      return { ...DEFAULT_BACKUP_POLICY };
    }

    try {
      const stored = JSON.parse(await readFile(path, 'utf8')) as Partial<BackupPolicyDto>;
      return validatePolicy({ ...DEFAULT_BACKUP_POLICY, ...stored });
    } catch {
      return { ...DEFAULT_BACKUP_POLICY };
    }
  }

  async update(request: BackupUpdatePolicyRequestDto): Promise<BackupPolicyDto> {
    if (!request.confirmed) {
      throw new Error('BACKUP_POLICY_UPDATE_REQUIRES_CONFIRMATION');
    }

    const policy = validatePolicy(request);
    const path = this.getPolicyPath();
    const temporaryPath = `${path}.${randomUUID()}.tmp`;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(temporaryPath, JSON.stringify(policy, null, 2), 'utf8');
    await rename(temporaryPath, path);
    return policy;
  }

  private getPolicyPath(): string {
    return join(this.portablePathService.getConfigRoot(), 'backup-policy.json');
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
