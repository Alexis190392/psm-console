export type ServerIdleShutdownState =
  | 'DISABLED'
  | 'SERVER_STOPPED'
  | 'WAITING_FOR_PLAYERS'
  | 'COUNTDOWN'
  | 'STOPPING'
  | 'MONITOR_UNAVAILABLE';

export interface ServerIdlePolicyDto {
  enabled: boolean;
  emptySeconds: number;
}

export interface ServerIdlePolicyUpdateRequestDto extends ServerIdlePolicyDto {
  confirmed: boolean;
}

export interface ServerIdleStatusDto {
  policy: ServerIdlePolicyDto;
  state: ServerIdleShutdownState;
  emptySince?: string;
  remainingSeconds?: number;
  updatedAt: string;
  message: string;
}
