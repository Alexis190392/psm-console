import { describe, expect, it } from 'vitest';
import { renderAppSettingsView } from '../src/renderer/views/app-settings-view';

const appStatus = {
  settings: {
    schemaVersion: 2 as const,
    automation: {
      idleShutdown: { enabled: true, emptySeconds: 120 },
      backups: {
        automaticEnabled: true,
        automaticIntervalHours: 12,
        automaticRetentionPerType: 10,
        compressWorldBackups: false
      }
    },
    remoteApi: {
      enabled: false,
      bindMode: 'LOCAL_ONLY' as const,
      port: 8213,
      username: 'admin',
      passwordConfigured: false
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

const remoteApiStatus = {
  settings: appStatus.settings.remoteApi,
  state: 'DISABLED' as const,
  message: 'API web deshabilitada.',
  updatedAt: new Date().toISOString()
};

describe('app settings view', () => {
  it('summarizes application and automation details without duplicating forms', () => {
    const html = renderAppSettingsView(
      appStatus,
      null,
      backups,
      {
        policy: appStatus.settings.automation.idleShutdown,
        state: 'WAITING_FOR_PLAYERS',
        updatedAt: new Date().toISOString(),
        message: 'Esperando jugadores.'
      },
      remoteApiStatus,
      'summary'
    );

    expect(html).toContain('Resumen');
    expect(html).toContain('APAGADO AUTOMATICO');
    expect(html).toContain('BACKUPS AUTOMATICOS');
    expect(html).toContain('data-settings-target="application"');
    expect(html).toContain('data-settings-target="automation"');
    expect(html).toContain('data-settings-target="remote-api"');
    expect(html).not.toContain('data-idle-policy-form');
    expect(html).not.toContain('id="backup-policy-form"');
  });

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
      remoteApiStatus,
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
      remoteApiStatus,
      'automation'
    );

    expect(html).toContain('data-idle-policy-form');
    expect(html).toContain('id="backup-policy-form"');
    expect(html).toContain('60 s restantes');
    expect(html).toContain('class="input-with-unit"');
    expect(html).toContain('<small>s</small>');
    expect(html).toContain('<small>h</small>');
    expect(html).not.toContain('<small>segundos</small>');
    expect(html).not.toContain('<small>horas</small>');
  });

  it('renders API access settings without exposing a stored password', () => {
    const html = renderAppSettingsView(
      {
        ...appStatus,
        settings: {
          ...appStatus.settings,
          remoteApi: {
            ...appStatus.settings.remoteApi,
            enabled: true,
            passwordConfigured: true
          }
        }
      },
      null,
      backups,
      {
        policy: appStatus.settings.automation.idleShutdown,
        state: 'WAITING_FOR_PLAYERS',
        updatedAt: new Date().toISOString(),
        message: ''
      },
      {
        ...remoteApiStatus,
        settings: {
          ...remoteApiStatus.settings,
          enabled: true,
          passwordConfigured: true
        },
        state: 'RUNNING',
        endpoint: 'http://127.0.0.1:8213/api/v1'
      },
      'remote-api'
    );

    expect(html).toContain('API administrativa');
    expect(html).toContain('Contraseña configurada');
    expect(html).toContain('http://127.0.0.1:8213/api/v1');
    expect(html).toContain('<dt>Sesion</dt><dd>8 h</dd>');
    expect(html).not.toContain('passwordHash');
  });
});
