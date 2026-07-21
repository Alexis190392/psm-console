export type PalworldPlayersStatus =
  | 'READY'
  | 'SERVER_STOPPED'
  | 'CONFIGURATION_MISSING'
  | 'REST_DISABLED'
  | 'ADMIN_PASSWORD_MISSING'
  | 'CONNECTION_ERROR';

export interface PalworldPlayerDto {
  name: string;
  playerId?: string;
  userId?: string;
  steamId?: string;
  ping?: number;
}

export interface PalworldPlayersStatusDto {
  status: PalworldPlayersStatus;
  players: PalworldPlayerDto[];
  currentPlayers: number;
  maxPlayers?: number;
  restPort?: number;
  endpoint?: string;
  updatedAt: string;
  message: string;
}
