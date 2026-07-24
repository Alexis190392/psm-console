export type PalworldRuntimeState = 'STOPPED' | 'STARTING' | 'RUNNING' | 'STOPPING' | 'ERROR';

export interface PalworldRuntimeStatusDto {
  state: PalworldRuntimeState;
  executablePath: string;
  pid?: number;
  startedAt?: string;
  stoppedAt?: string;
  updatedAt: string;
  message: string;
  logs: string[];
}

export interface PalworldStartRequestDto {
  confirmed: boolean;
}

export interface PalworldStopRequestDto {
  confirmed: boolean;
}

export type PalworldQueryPortState = 'AVAILABLE' | 'IN_USE' | 'UNSUPPORTED' | 'UNKNOWN';

export interface PalworldQueryPortStatusDto {
  port: number;
  protocol: 'UDP';
  state: PalworldQueryPortState;
  pid?: number;
  processName?: string;
  executablePath?: string;
  message: string;
  updatedAt: string;
}

export interface PalworldStopQueryPortOwnerRequestDto {
  confirmed: boolean;
}
