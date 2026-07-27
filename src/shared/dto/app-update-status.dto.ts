export type AppUpdateState = 'AVAILABLE' | 'UP_TO_DATE' | 'UNAVAILABLE';

export interface AppUpdateStatusDto {
  state: AppUpdateState;
  currentVersion: string;
  latestVersion?: string;
  releaseName?: string;
  releaseUrl?: string;
  assetName?: string;
  assetUrl?: string;
  publishedAt?: string;
  message: string;
  checkedAt: string;
}
