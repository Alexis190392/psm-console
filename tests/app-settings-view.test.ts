import { describe, expect, it } from 'vitest';
import { renderAppSettingsView } from '../src/renderer/views/app-settings-view';

const appStatus = {
  settings: {
    schemaVersion: 1 as const,
    automation: {
      idleShutdown: { enabled: true, emptySeconds: 120 },
      backups: {
        automaticEnabled: true,
        automaticIntervalHours: 12,
        automaticRetentionPerType: 10,
        compressWorldBackups: false
      }
    }
  },
  portableRoot: 'D:\\PSM',
  settingsRelativePath: 'config/app-settings.json',
  logsRelativePath: 'logs/',
  backupsRelativePath: 'backups/'
};

const backups = {
  configurationBackups: [],
  worldBackups: [],
  configurationSourcePath: '',
  worldSourcePath: '',
  policy: appStatus.settings.automation.backups,
  totalSizeBytes: 0,
  verifiedBackups: 0,
  corruptedBackups: 0,
  message: ''
};

describe('app settings view', () => {
  it('separates application paths from server settings', () => {
    const html = renderAppSettingsView(
      appStatus,
      null,
      backups,
      {
        policy: appStatus.settings.automation.idleShutdown,
        state: 'WAITING_FOR_PLAYERS',
        updatedAt: new Date().toISOString(),
        message: 'Un jugador conectado.'
      },
      'application'
    );

    expect(html).toContain('config/app-settings.json');
    expect(html).toContain('D:\\PSM');
    expect(html).not.toContain('PalWorldSettings.ini');
  });

  it('renders existing automation controls in one place', () => {
    const html = renderAppSettingsView(
      appStatus,
      null,
      backups,
      {
        policy: appStatus.settings.automation.idleShutdown,
        state: 'COUNTDOWN',
        remainingSeconds: 60,
        updatedAt: new Date().toISOString(),
        message: ''
      },
      'automation'
    );

    expect(html).toContain('data-idle-policy-form');
    expect(html).toContain('id="backup-policy-form"');
    expect(html).toContain('60 s restantes');
  });
});
