export interface PalworldInstallationStatusDto {
  status: 'MISSING' | 'READY';
  appId: string;
  installDirectory: string;
  executablePath: string;
  message: string;
}

export type PalworldUpdateStatus = 'NOT_INSTALLED' | 'UP_TO_DATE' | 'UPDATE_AVAILABLE' | 'UNKNOWN';

export interface PalworldUpdateStatusDto {
  status: PalworldUpdateStatus;
  appId: string;
  localBuildId?: string;
  requiredBuildId?: string;
  checkedAt: string;
  message: string;
}

export interface PalworldUpdateStatusRequestDto {
  force?: boolean;
}

export interface PalworldInstallRequestDto {
  confirmed: boolean;
}

export interface PalworldUpdateRequestDto {
  confirmed: boolean;
}

export interface PalworldRepairRequestDto {
  confirmed: boolean;
}
