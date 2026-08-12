import { createServer } from 'node:http';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplicationStateService } from '../src/backend/application-state/application-state.service';
import { AppSettingsService } from '../src/backend/app-settings/app-settings.service';
import { BackupService } from '../src/backend/backup/backup.service';
import { FirewallService } from '../src/backend/firewall/firewall.service';
import { LoggingService } from '../src/backend/logging/logging.service';
import { NetworkService } from '../src/backend/network/network.service';
import { OperationManagerService } from '../src/backend/operations/operation-manager.service';
import { PalworldAdminService } from '../src/backend/palworld-admin/palworld-admin.service';
import { PalworldConfigurationService } from '../src/backend/palworld-configuration/palworld-configuration.service';
import { PalworldPlayersService } from '../src/backend/palworld-players/palworld-players.service';
import { PalworldProcessService } from '../src/backend/palworld-process/palworld-process.service';
import { PalworldInstallationService } from '../src/backend/palworld-installation/palworld-installation.service';
import { PortablePathService } from '../src/backend/portable-path/portable-path.service';
import { ReleaseUpdateService } from '../src/backend/release-update/release-update.service';
import {
  isExternalRemoteAddress,
  RemoteApiService,
  selectPreferredLanAddress
} from '../src/backend/remote-api/remote-api.service';
import { ApplicationStatus } from '../src/shared/enums/application-status';
import { ServerIdleShutdownService } from '../src/backend/server-idle-shutdown/server-idle-shutdown.service';
import { SteamCmdService } from '../src/backend/steamcmd/steamcmd.service';

describe('RemoteApiService', () => {
  const portableRoot = join(process.cwd(), '.tmp-tests', 'remote-api');
  const paths = new PortablePathService({
    isPackaged: true,
    getPath: () => join(portableRoot, 'PSM Console.exe')
  });
  let remoteApi: RemoteApiService | null = null;

  afterEach(async () => {
    await remoteApi?.onApplicationShutdown();
    remoteApi = null;
    await rm(portableRoot, { recursive: true, force: true });
  });

  it('authenticates with a temporary bearer token and delegates server actions', async () => {
    const port = await getFreePort();
    const appSettings = new AppSettingsService(paths);
    const fixture = createRemoteApiFixture(appSettings, portableRoot);
    remoteApi = fixture.service;

    const status = await remoteApi.update({
      confirmed: true,
      enabled: true,
      bindMode: 'LOCAL_ONLY',
      port,
      username: 'operator',
      password: 'secure-password'
    });
    const baseUrl = `http://127.0.0.1:${String(port)}/api/v1`;

    expect(status.state).toBe('RUNNING');
    const webResponse = await fetch(baseUrl);
    expect(webResponse.status).toBe(200);
    expect(webResponse.headers.get('content-type')).toContain('text/html');
    expect(await webResponse.text()).toContain('id="login-form"');
    const cssResponse = await fetch(`${baseUrl}/ui.css`);
    const css = await cssResponse.text();
    expect(cssResponse.headers.get('content-type')).toContain('text/css');
    expect(css).toContain('@media (max-width: 560px)');
    expect(css).toContain('100dvh');
    expect(css).toContain('bottom: 0');
    expect(css).toContain('env(safe-area-inset-bottom)');
    expect(css).toContain('display: block');
    expect(css).toContain('password-visibility-icon');
    expect(css).toContain('border: 0');
    expect(css).toContain('background: transparent');
    const scriptResponse = await fetch(`${baseUrl}/ui.js`);
    const script = await scriptResponse.text();
    expect(scriptResponse.headers.get('content-type')).toContain('text/javascript');
    expect(script).toContain("throw new Error('No permitido')");
    expect(script).toContain("apiRequest('/session')");
    expect(script).toContain("apiRequest('/map')");
    expect((await fetch(`${baseUrl}/logo.png`)).headers.get('content-type')).toContain('image/png');
    expect((await fetch(`${baseUrl}/map/world.webp`)).headers.get('content-type')).toContain('image/webp');
    expect((await fetch(`${baseUrl}/map/tree.webp`)).headers.get('content-type')).toContain('image/webp');
    expect((await fetch(`${baseUrl}/health`)).status).toBe(200);
    expect((await fetch(`${baseUrl}/status`)).status).toBe(401);

    const loginResponse = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'operator', password: 'secure-password' })
    });
    const login = await loginResponse.json() as { token: string; expiresAt: string | null };
    const authorization = { authorization: `Bearer ${login.token}` };

    expect(loginResponse.status).toBe(200);
    expect(login.expiresAt).toBeNull();
    expect((await fetch(`${baseUrl}/status`, { headers: authorization })).status).toBe(200);
    const now = vi.spyOn(Date, 'now').mockReturnValue(Number.MAX_SAFE_INTEGER);
    expect((await fetch(`${baseUrl}/status`, { headers: authorization })).status).toBe(200);
    now.mockRestore();

    await remoteApi.update({
      confirmed: true,
      enabled: true,
      bindMode: 'LOCAL_ONLY',
      port,
      username: 'renamed-operator',
      password: 'updated-password'
    });
    expect((await fetch(`${baseUrl}/status`, { headers: authorization })).status).toBe(200);

    const startResponse = await fetch(`${baseUrl}/server/start`, {
      method: 'POST',
      headers: authorization
    });
    expect(startResponse.status).toBe(202);
    expect(fixture.start).toHaveBeenCalledWith({ confirmed: true });

    await remoteApi.onApplicationShutdown();
    const restartedFixture = createRemoteApiFixture(appSettings, portableRoot);
    remoteApi = restartedFixture.service;
    await remoteApi.onApplicationBootstrap();

    expect((await remoteApi.getStatus()).state).toBe('RUNNING');
    expect((await fetch(`${baseUrl}/health`)).status).toBe(200);
  });

  it('serves admin and client profiles on the same port with different permissions', async () => {
    const port = await getFreePort();
    const appSettings = new AppSettingsService(paths);
    const fixture = createRemoteApiFixture(appSettings, portableRoot);
    remoteApi = fixture.service;

    await remoteApi.update({
      confirmed: true,
      profile: 'ADMIN',
      enabled: true,
      bindMode: 'LOCAL_ONLY',
      port,
      username: 'operator',
      password: 'secure-password'
    });
    const status = await remoteApi.update({
      confirmed: true,
      profile: 'CLIENT',
      enabled: true,
      bindMode: 'LOCAL_ONLY',
      port: port + 1,
      username: 'friend',
      password: 'abcde',
      permissions: ['PLAYERS_VIEW', 'PLAYERS_KICK']
    });
    const baseUrl = `http://127.0.0.1:${String(port)}/api/v1`;
    expect(status.client.state).toBe('RUNNING');
    expect(status.state).toBe('RUNNING');
    expect(status.endpoint).toBe(status.client.endpoint);
    expect(status.settings.client.port).toBe(port);

    const clientLoginResponse = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'friend', password: 'abcde' })
    });
    const clientLogin = await clientLoginResponse.json() as {
      token: string;
      profile: string;
      permissions: string[];
    };
    const clientHeaders = { authorization: `Bearer ${clientLogin.token}` };

    expect(clientLogin.profile).toBe('CLIENT');
    expect(clientLogin.permissions).toEqual(['PLAYERS_VIEW', 'PLAYERS_KICK']);
    expect((await fetch(`${baseUrl}/session`, { headers: clientHeaders })).status).toBe(200);
    expect((await fetch(`${baseUrl}/players`, { headers: clientHeaders })).status).toBe(200);
    const mapResponse = await fetch(`${baseUrl}/map`, { headers: clientHeaders });
    const map = await mapResponse.json() as {
      layers: Array<{ id: string; imageUrl: string }>;
      players: Array<{ name: string; mapId: string; left: string; top: string }>;
    };
    expect(mapResponse.status).toBe(200);
    expect(map.layers).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'world', imageUrl: '/api/v1/map/world.webp' }),
      expect.objectContaining({ id: 'tree', imageUrl: '/api/v1/map/tree.webp' })
    ]));
    expect(map.players).toEqual([
      expect.objectContaining({
        name: 'Jugador de prueba',
        mapId: 'world'
      })
    ]);
    expect(typeof map.players[0]?.left).toBe('string');
    expect(typeof map.players[0]?.top).toBe('string');
    expect((await fetch(`${baseUrl}/status`, { headers: clientHeaders })).status).toBe(403);
    expect((await fetch(`${baseUrl}/logs`, { headers: clientHeaders })).status).toBe(403);
    expect((await fetch(`${baseUrl}/server/start`, {
      method: 'POST',
      headers: clientHeaders
    })).status).toBe(403);
    expect(fixture.start).not.toHaveBeenCalled();
    expect((await fetch(`${baseUrl}/admin/actions`, {
      method: 'POST',
      headers: {
        ...clientHeaders,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ action: 'kick', userId: 'steam_123' })
    })).status).toBe(200);
    expect(fixture.execute).toHaveBeenCalledWith({
      confirmed: true,
      action: 'kick',
      userId: 'steam_123'
    });
    expect((await fetch(`${baseUrl}/admin/actions`, {
      method: 'POST',
      headers: {
        ...clientHeaders,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ action: 'ban', userId: 'steam_123' })
    })).status).toBe(403);

    const adminLoginResponse = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'operator', password: 'secure-password' })
    });
    const adminLogin = await adminLoginResponse.json() as { token: string; profile: string };
    const adminHeaders = { authorization: `Bearer ${adminLogin.token}` };
    expect(adminLogin.profile).toBe('ADMIN');
    expect((await fetch(`${baseUrl}/status`, { headers: adminHeaders })).status).toBe(200);
    expect((await fetch(`${baseUrl}/installation`, { headers: adminHeaders })).status).toBe(200);
    expect((await fetch(`${baseUrl}/steamcmd`, { headers: adminHeaders })).status).toBe(200);
    expect((await fetch(`${baseUrl}/firewall`, { headers: adminHeaders })).status).toBe(200);
    expect((await fetch(`${baseUrl}/app/settings`, { headers: adminHeaders })).status).toBe(200);
    expect((await fetch(`${baseUrl}/automation/idle`, { headers: adminHeaders })).status).toBe(200);
    const schemaResponse = await fetch(`${baseUrl}/configuration/schema`, { headers: adminHeaders });
    expect(schemaResponse.status).toBe(200);
    const configurationSchema = await schemaResponse.json() as unknown as { settings: unknown[] };
    expect(configurationSchema.settings).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'ServerName' })
    ]));

    const updatedStatus = await remoteApi.update({
      confirmed: true,
      profile: 'CLIENT',
      enabled: true,
      bindMode: 'LOCAL_ONLY',
      port,
      username: 'friend',
      permissions: ['LOGS']
    });
    expect(updatedStatus.client.state).toBe('RUNNING');
    expect((await fetch(`${baseUrl}/players`, { headers: clientHeaders })).status).toBe(403);
    expect((await fetch(`${baseUrl}/map`, { headers: clientHeaders })).status).toBe(403);
    expect((await fetch(`${baseUrl}/logs`, { headers: clientHeaders })).status).toBe(200);
    const refreshedSession = await fetch(`${baseUrl}/session`, { headers: clientHeaders });
    expect(await refreshedSession.json()).toEqual({
      profile: 'CLIENT',
      permissions: ['LOGS']
    });
  });

  it('enforces start, restart and stop permissions independently', async () => {
    const port = await getFreePort();
    const appSettings = new AppSettingsService(paths);
    const fixture = createRemoteApiFixture(appSettings, portableRoot);
    remoteApi = fixture.service;

    await remoteApi.update({
      confirmed: true,
      enabled: false,
      bindMode: 'LOCAL_ONLY',
      port,
      username: 'admin'
    });
    await remoteApi.update({
      confirmed: true,
      profile: 'CLIENT',
      enabled: true,
      bindMode: 'LOCAL_ONLY',
      port,
      username: 'starter',
      password: 'abcde',
      permissions: ['SERVER_START']
    });
    const baseUrl = `http://127.0.0.1:${String(port)}/api/v1`;
    const loginResponse = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'starter', password: 'abcde' })
    });
    const login = await loginResponse.json() as { token: string };
    const headers = { authorization: `Bearer ${login.token}` };

    expect((await fetch(`${baseUrl}/server/start`, { method: 'POST', headers })).status).toBe(202);
    expect((await fetch(`${baseUrl}/server/restart`, { method: 'POST', headers })).status).toBe(403);
    expect((await fetch(`${baseUrl}/server/stop`, { method: 'POST', headers })).status).toBe(403);
    expect(fixture.start).toHaveBeenCalledOnce();
    expect(fixture.restart).not.toHaveBeenCalled();
    expect(fixture.stop).not.toHaveBeenCalled();
  });

  it('verifies loopback, LAN and Internet sequentially', async () => {
    const port = await getFreePort();
    const appSettings = new AppSettingsService(paths);
    const fixture = createRemoteApiFixture(appSettings, portableRoot);
    remoteApi = fixture.service;

    const startingStatus = await remoteApi.update({
      confirmed: true,
      enabled: true,
      bindMode: 'LOCAL_NETWORK',
      port,
      username: 'operator',
      password: 'secure-password'
    });

    expect(startingStatus.connections.map(({ kind, state }) => ({ kind, state }))).toEqual([
      { kind: 'LOOPBACK', state: 'CHECKING' },
      { kind: 'LAN', state: 'UNKNOWN' },
      { kind: 'PUBLIC', state: 'UNKNOWN' }
    ]);

    await vi.waitFor(async () => {
      const status = await remoteApi?.getStatus();
      expect(status?.connections.find((connection) => connection.kind === 'PUBLIC')?.state).toBe('AVAILABLE');
    });
    const status = await remoteApi.getStatus();

    expect(status.connections).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'LOOPBACK',
        endpoint: `http://127.0.0.1:${String(port)}/api/v1`,
        state: 'AVAILABLE'
      }),
      expect.objectContaining({
        kind: 'LAN',
        endpoint: `http://127.0.0.1:${String(port)}/api/v1`,
        state: 'AVAILABLE'
      }),
      expect.objectContaining({
        kind: 'PUBLIC',
        endpoint: `http://203.0.113.25:${String(port)}/api/v1`,
        state: 'AVAILABLE'
      })
    ]));
  });

  it('chooses one private LAN address over VPN and duplicated adapters', () => {
    expect(selectPreferredLanAddress([
      '100.212.134.158',
      '192.168.0.100',
      '192.168.0.100'
    ])).toBe('192.168.0.100');
  });

  it('distinguishes authenticated Internet addresses from local network addresses', () => {
    const localAddresses = ['192.168.0.100', '100.212.134.158'];

    expect(isExternalRemoteAddress('200.123.115.176', localAddresses)).toBe(true);
    expect(isExternalRemoteAddress('::ffff:200.123.115.176', localAddresses)).toBe(true);
    expect(isExternalRemoteAddress('192.168.0.35', localAddresses)).toBe(false);
    expect(isExternalRemoteAddress('100.72.10.4', localAddresses)).toBe(false);
    expect(isExternalRemoteAddress('127.0.0.1', localAddresses)).toBe(false);
    expect(isExternalRemoteAddress('::1', localAddresses)).toBe(false);
  });
});

function createRemoteApiFixture(
  appSettings: AppSettingsService,
  portableRoot: string
): {
  service: RemoteApiService;
  start: ReturnType<typeof vi.fn>;
  restart: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
  getPublicAddress: ReturnType<typeof vi.fn>;
} {
  const start = vi.fn(() => ({ operationId: 'start-operation' }));
  const restart = vi.fn(() => ({ operationId: 'restart-operation' }));
  const stop = vi.fn(() => ({ operationId: 'stop-operation' }));
  const execute = vi.fn(() => ({
    action: 'kick',
    status: 'OK',
    message: 'Accion aplicada.',
    updatedAt: new Date().toISOString()
  }));
  const getPublicAddress = vi.fn(({ port }: { port?: number } = {}) => ({
    publicIp: '203.0.113.25',
    localIpv4: ['192.0.2.10'],
    cgnatStatus: 'NEEDS_ROUTER_CHECK' as const,
    ...(port
      ? {
          publicPortProbe: {
            port,
            tcp: 'OPEN' as const,
            udp: 'UNKNOWN' as const,
            provider: 'test',
            checkedAt: new Date().toISOString(),
            message: 'TCP abierto.'
          }
        }
      : {}),
    message: 'IP publica detectada.',
    recommendation: 'Prueba.',
    updatedAt: new Date().toISOString()
  }));
  const service = new RemoteApiService(
    appSettings,
    {
      getStatus: () => ({
        status: ApplicationStatus.READY,
        portableRoot,
        isPortableRootWritable: true,
        updatedAt: new Date().toISOString()
      }),
      getAllowedActions: () => ({
        canInstallSteamCmd: false,
        canInstallServer: false,
        canEditConfiguration: true,
        canManageFirewall: true,
        canStartServer: true,
        canStopServer: false,
        canCreateBackup: true,
        canRestoreBackup: true
      })
    } as unknown as ApplicationStateService,
    {
      getRuntimeStatus: () => ({
        state: 'STOPPED',
        executablePath: 'PalServer.exe',
        updatedAt: new Date().toISOString(),
        message: 'Servidor detenido.',
        logs: []
      }),
      start,
      stop,
      restart
    } as unknown as PalworldProcessService,
    {
      getStatus: vi.fn(() => ({
        status: 'READY',
        players: [{
          name: 'Jugador de prueba',
          steamId: 'steam_00000000000000001',
          userId: 'steam_00000000000000001',
          playerId: '00000001',
          ping: 24.3,
          locationX: 305821,
          locationY: 230422
        }],
        currentPlayers: 1,
        maxPlayers: 32,
        updatedAt: new Date().toISOString(),
        message: 'Un jugador conectado.'
      }))
    } as unknown as PalworldPlayersService,
    { getStatus: vi.fn(), execute } as unknown as PalworldAdminService,
    {
      readActive: vi.fn(() => ({
        path: 'PalWorldSettings.ini',
        content: '[/Script/Pal.PalGameWorldSettings]\nOptionSettings=(ServerName="Servidor de prueba",ServerPlayerMaxNum=12,bIsPvP=False)',
        updatedAt: new Date().toISOString()
      })),
      saveActive: vi.fn(),
      restoreDefault: vi.fn()
    } as unknown as PalworldConfigurationService,
    { getSummary: vi.fn(), createConfigurationBackup: vi.fn(), createWorldBackup: vi.fn() } as unknown as BackupService,
    { getStatus: vi.fn(), applyRequiredRules: vi.fn() } as unknown as FirewallService,
    {
      write: vi.fn(),
      readRecent: vi.fn(() => ({
        entries: [],
        updatedAt: new Date().toISOString()
      }))
    } as unknown as LoggingService,
    { getLocalAddresses: () => ['127.0.0.1'], getPublicAddress } as unknown as NetworkService,
    { get: vi.fn() } as unknown as OperationManagerService,
    { getStatus: vi.fn() } as unknown as SteamCmdService,
    { getStatus: vi.fn(), getUpdateStatus: vi.fn(), update: vi.fn(), repair: vi.fn() } as unknown as PalworldInstallationService,
    { getStatus: vi.fn() } as unknown as ReleaseUpdateService,
    { getStatus: vi.fn(), updatePolicy: vi.fn() } as unknown as ServerIdleShutdownService,
    {
      getServerInstances: vi.fn(() => ({ mode: 'PORTABLE', instances: [] })),
      getServerInstanceExecutablePath: vi.fn(),
      selectServerInstance: vi.fn(),
      addServerFolder: vi.fn(),
      createServerFolder: vi.fn()
    } as unknown as PortablePathService
  );
  return { service, start, restart, stop, execute, getPublicAddress };
}

async function getFreePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise<void>((resolve) => server.close(() => {
    resolve();
  }));
  return port;
}
