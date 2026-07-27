export type RemoteApiBindMode = 'LOCAL_ONLY' | 'LOCAL_NETWORK';
export type RemoteApiRuntimeState = 'DISABLED' | 'STARTING' | 'RUNNING' | 'ERROR';

export interface RemoteApiSettingsDto {
  enabled: boolean;
  bindMode: RemoteApiBindMode;
  port: number;
  username: string;
  passwordConfigured: boolean;
}

export interface RemoteApiUpdateRequestDto {
  confirmed: boolean;
  enabled: boolean;
  bindMode: RemoteApiBindMode;
  port: number;
  username: string;
  password?: string;
}

export interface RemoteApiStatusDto {
  settings: RemoteApiSettingsDto;
  state: RemoteApiRuntimeState;
  endpoint?: string;
  message: string;
  updatedAt: string;
}

export interface RemoteApiLoginRequestDto {
  username: string;
  password: string;
}

export interface RemoteApiLoginResultDto {
  token: string;
  expiresAt: string;
}
