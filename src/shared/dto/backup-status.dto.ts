export type BackupKind = 'configuration' | 'world';
export type BackupOrigin = 'manual' | 'automatic' | 'safety';
export type BackupFormat = 'file' | 'directory' | 'tar-gzip';
export type BackupIntegrityState = 'VERIFIED' | 'UNVERIFIED' | 'CORRUPTED';

export interface BackupEntryDto {
  id: string;
  kind: BackupKind;
  name: string;
  path: string;
  sizeBytes: number;
  createdAt: string;
  origin: BackupOrigin;
  format: BackupFormat;
  integrity: BackupIntegrityState;
  checksum?: string;
  integrityMessage: string;
}

export interface BackupPolicyDto {
  automaticEnabled: boolean;
  automaticIntervalHours: number;
  automaticRetentionPerType: number;
  compressWorldBackups: boolean;
}

export interface BackupSummaryDto {
  configurationBackups: BackupEntryDto[];
  worldBackups: BackupEntryDto[];
  configurationSourcePath: string;
  worldSourcePath: string;
  policy: BackupPolicyDto;
  totalSizeBytes: number;
  verifiedBackups: number;
  corruptedBackups: number;
  message: string;
}

export interface BackupCreateRequestDto {
  confirmed: boolean;
}

export interface BackupDeleteRequestDto {
  confirmed: boolean;
  backupId: string;
}

export interface BackupRestoreRequestDto {
  confirmed: boolean;
  backupId: string;
}

export interface BackupVerifyRequestDto {
  backupId: string;
}

export interface BackupUpdatePolicyRequestDto extends BackupPolicyDto {
  confirmed: boolean;
}
