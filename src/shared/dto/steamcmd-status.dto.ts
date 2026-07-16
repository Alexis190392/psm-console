export type SteamCmdStatus = 'MISSING' | 'INSTALLING' | 'READY' | 'ERROR';

export interface SteamCmdStatusDto {
  status: SteamCmdStatus;
  installDirectory: string;
  executablePath: string;
  officialDownloadUrl: string;
  message: string;
}

export interface SteamCmdInstallRequestDto {
  confirmed: boolean;
}
