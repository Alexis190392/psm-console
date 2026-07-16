export interface PalworldConfigurationStatusDto {
  status: 'MISSING' | 'READY';
  templatePath: string;
  activePath: string;
  message: string;
}

export interface PalworldCreateDefaultConfigurationRequestDto {
  confirmed: boolean;
}
