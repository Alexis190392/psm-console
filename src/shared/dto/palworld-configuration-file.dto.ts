export interface PalworldConfigurationFileDto {
  path: string;
  content: string;
  updatedAt: string;
}

export interface PalworldSaveConfigurationRequestDto {
  confirmed: boolean;
  content: string;
}
