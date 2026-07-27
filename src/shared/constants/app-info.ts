export const APP_INFO = {
  displayName: 'PSM Console by >GR477<',
  packageProductName: 'PSM Console by GR477',
  shortName: 'PSM Console',
  productScope: 'Palworld Server Manager',
  appId: 'com.palcm.servermanager',
  authorAlias: '>GR477<',
  authorName: 'Alexis Joel Dávila',
  version: '0.11.2',
  channel: 'Dev'
} as const;

export const APP_VERSION_LABEL = `v${APP_INFO.version} ${APP_INFO.channel}`;
