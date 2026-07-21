export interface PalworldInstallationStatusDto {
  status: 'MISSING' | 'READY';
  appId: string;
  installDirectory: string;
  executablePath: string;
  message: string;
}

export interface PalworldInstallRequestDto {
  confirmed: boolean;
}

export interface PalworldUpdateRequestDto {
  confirmed: boolean;
}
