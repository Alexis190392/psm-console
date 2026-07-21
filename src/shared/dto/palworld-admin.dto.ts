export type PalworldAdminStatus =
  | 'READY'
  | 'SERVER_STOPPED'
  | 'CONFIGURATION_MISSING'
  | 'REST_DISABLED'
  | 'ADMIN_PASSWORD_MISSING';

export type PalworldAdminAction = 'announce' | 'save' | 'kick' | 'ban' | 'unban' | 'shutdown';

export interface PalworldAdminStatusDto {
  status: PalworldAdminStatus;
  restPort?: number;
  endpoint?: string;
  updatedAt: string;
  message: string;
}

export interface PalworldAdminActionRequestDto {
  confirmed: boolean;
  action: PalworldAdminAction;
  message?: string;
  userId?: string;
  seconds?: number;
}

export interface PalworldAdminActionResultDto {
  action: PalworldAdminAction;
  status: 'OK';
  message: string;
  updatedAt: string;
}
