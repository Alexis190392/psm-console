import type {
  RemoteApiBindMode,
  RemoteApiPermission
} from '../../shared/dto/remote-api.dto';

export interface StoredRemoteApiSettings {
  enabled: boolean;
  bindMode: RemoteApiBindMode;
  port: number;
  username: string;
  passwordSalt: string;
  passwordHash: string;
  client: StoredRemoteApiClientSettings;
}

export interface StoredRemoteApiClientSettings {
  enabled: boolean;
  bindMode: RemoteApiBindMode;
  port: number;
  username: string;
  passwordSalt: string;
  passwordHash: string;
  permissions: RemoteApiPermission[];
}
