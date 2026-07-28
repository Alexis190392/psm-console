export type RemoteApiBindMode = 'LOCAL_ONLY' | 'LOCAL_NETWORK';
export type RemoteApiRuntimeState = 'DISABLED' | 'STARTING' | 'RUNNING' | 'ERROR';
export type RemoteApiProfile = 'ADMIN' | 'CLIENT';
export type RemoteApiConnectionKind = 'LOOPBACK' | 'LAN' | 'PUBLIC';
export type RemoteApiConnectionState =
  | 'AVAILABLE'
  | 'CHECKING'
  | 'UNAVAILABLE'
  | 'UNKNOWN'
  | 'DISABLED';
export type RemoteApiPermission =
  | 'GENERAL'
  | 'SERVER_START'
  | 'SERVER_RESTART'
  | 'SERVER_STOP'
  | 'PLAYERS_VIEW'
  | 'PLAYERS_KICK'
  | 'PLAYERS_BAN'
  | 'LOGS';

export interface RemoteApiProfileSettingsDto {
  enabled: boolean;
  bindMode: RemoteApiBindMode;
  port: number;
  username: string;
  passwordConfigured: boolean;
}

export interface RemoteApiClientSettingsDto extends RemoteApiProfileSettingsDto {
  permissions: RemoteApiPermission[];
}

export interface RemoteApiSettingsDto extends RemoteApiProfileSettingsDto {
  client: RemoteApiClientSettingsDto;
}

export interface RemoteApiUpdateRequestDto {
  confirmed: boolean;
  profile?: RemoteApiProfile;
  enabled: boolean;
  bindMode: RemoteApiBindMode;
  port: number;
  username: string;
  password?: string;
  permissions?: RemoteApiPermission[];
  configureFirewall?: boolean;
}

export interface RemoteApiProfileStatusDto {
  settings: RemoteApiProfileSettingsDto | RemoteApiClientSettingsDto;
  state: RemoteApiRuntimeState;
  endpoint?: string;
  message: string;
  updatedAt: string;
}

export interface RemoteApiStatusDto extends RemoteApiProfileStatusDto {
  settings: RemoteApiSettingsDto;
  client: RemoteApiProfileStatusDto;
  connections: RemoteApiConnectionDto[];
}

export interface RemoteApiConnectionDto {
  kind: RemoteApiConnectionKind;
  label: string;
  endpoint?: string;
  state: RemoteApiConnectionState;
  message: string;
}

export interface RemoteApiLoginRequestDto {
  username: string;
  password: string;
}

export interface RemoteApiLoginResultDto {
  token: string;
  expiresAt: null;
  profile: RemoteApiProfile;
  permissions: RemoteApiPermission[];
}

export interface RemoteApiFirewallStatusDto {
  profile: RemoteApiProfile;
  port: number;
  configured: boolean;
  message: string;
}

export interface RemoteApiFirewallCheckRequestDto {
  profile: RemoteApiProfile;
  port: number;
}

export interface RemoteApiFirewallRuleRequestDto extends RemoteApiFirewallCheckRequestDto {
  confirmed: boolean;
}
