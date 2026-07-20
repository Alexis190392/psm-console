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
