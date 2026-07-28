import { describe, expect, it } from 'vitest';
import { renderAppSettingsView } from '../src/renderer/views/app-settings-view';
import type { RemoteApiPermission } from '../src/shared/dto/remote-api.dto';

const appStatus = {
  settings: {
    schemaVersion: 5 as const,
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
      passwordConfigured: false,
      client: {
        enabled: false,
        bindMode: 'LOCAL_ONLY' as const,
        port: 8213,
        username: 'cliente',
        passwordConfigured: false,
        permissions: [
          'GENERAL',
          'SERVER_START',
          'SERVER_RESTART',
          'SERVER_STOP',
          'PLAYERS_VIEW',
          'LOGS'
        ] as RemoteApiPermission[]
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

const remoteApiStatus = {
  settings: appStatus.settings.remoteApi,
  state: 'DISABLED' as const,
  message: 'API web deshabilitada.',
  updatedAt: new Date().toISOString(),
  client: {
    settings: appStatus.settings.remoteApi.client,
    state: 'DISABLED' as const,
    message: 'API cliente deshabilitada.',
    updatedAt: new Date().toISOString()
  },
  connections: []
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
        endpoint: 'http://127.0.0.1:8213/api/v1',
        connections: [
          {
            kind: 'LOOPBACK' as const,
            label: 'Este equipo',
            endpoint: 'http://127.0.0.1:8213/api/v1',
            state: 'AVAILABLE' as const,
            message: 'Disponible mientras PSM Console permanezca abierta.'
          },
          {
            kind: 'PUBLIC' as const,
            label: 'Internet',
            endpoint: 'http://203.0.113.25:8213/api/v1',
            state: 'UNKNOWN' as const,
            message: 'IP publica detectada, pero no se pudo confirmar el acceso al puerto.'
          }
        ]
      },
      'remote-api'
    );

    expect(html).toContain('API administrativa');
    expect(html).toContain('API cliente');
    expect(html).toContain('Contenido visible para el cliente');
    expect(html).toContain('Contrasena configurada');
    expect(html).toContain('minlength="5"');
    expect(html).toContain('http://127.0.0.1:8213/api/v1');
    expect(html).toContain('http://203.0.113.25:8213/api/v1');
    expect(html).toContain('<dt>Sesion</dt><dd>Mientras la app este abierta</dd>');
    expect(html).toContain('data-copy-value="http://127.0.0.1:8213/api/v1"');
    expect(html).toContain('settings-api-address--unknown');
    expect(html.match(/name="port" type="number"/g)).toHaveLength(1);
    expect(html).toContain('settings-api-connection');
    expect(html).toContain('settings-api-profiles');
    expect(html).toContain('value="SERVER_START"');
    expect(html).toContain('value="SERVER_RESTART"');
    expect(html).toContain('value="SERVER_STOP"');
    expect(html).toContain('value="PLAYERS_KICK"');
    expect(html).toContain('value="PLAYERS_BAN"');
    expect(html).not.toContain('passwordHash');
  });
});
