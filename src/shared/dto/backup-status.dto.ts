export type BackupKind = 'configuration' | 'world';

export interface BackupEntryDto {
  id: string;
  kind: BackupKind;
  name: string;
  path: string;
  sizeBytes: number;
  createdAt: string;
}

export interface BackupSummaryDto {
  configurationBackups: BackupEntryDto[];
  worldBackups: BackupEntryDto[];
  configurationSourcePath: string;
  worldSourcePath: string;
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
