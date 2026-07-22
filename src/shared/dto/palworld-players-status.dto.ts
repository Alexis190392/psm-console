export type PalworldPlayersStatus =
  | 'READY'
  | 'SERVER_STOPPED'
  | 'CONFIGURATION_MISSING'
  | 'REST_CONFIGURED_RESTART_REQUIRED'
  | 'REST_STARTING'
  | 'REST_DISABLED'
  | 'ADMIN_PASSWORD_MISSING'
  | 'CONNECTION_ERROR';

export interface PalworldPlayerDto {
  name: string;
  playerId?: string;
  userId?: string;
  steamId?: string;
  ping?: number;
  locationX?: number;
  locationY?: number;
  locationZ?: number;
  level?: number;
  buildingCount?: number;
  online?: boolean;
  lastSeenAt?: string;
  banState?: 'BANNED' | 'NOT_BANNED' | 'UNKNOWN';
}

export interface PalworldPlayersStatusDto {
  status: PalworldPlayersStatus;
  players: PalworldPlayerDto[];
  previousPlayers?: PalworldPlayerDto[];
  currentPlayers: number;
  maxPlayers?: number;
  restPort?: number;
  endpoint?: string;
  updatedAt: string;
  message: string;
}
