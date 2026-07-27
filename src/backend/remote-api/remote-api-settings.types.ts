import type { RemoteApiBindMode } from '../../shared/dto/remote-api.dto';

export interface StoredRemoteApiSettings {
  enabled: boolean;
  bindMode: RemoteApiBindMode;
  port: number;
  username: string;
  passwordSalt: string;
  passwordHash: string;
}
