import { createServer } from 'node:http';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplicationStateService } from '../src/backend/application-state/application-state.service';
import { AppSettingsService } from '../src/backend/app-settings/app-settings.service';
import { BackupService } from '../src/backend/backup/backup.service';
import { LoggingService } from '../src/backend/logging/logging.service';
import { NetworkService } from '../src/backend/network/network.service';
import { OperationManagerService } from '../src/backend/operations/operation-manager.service';
import { PalworldAdminService } from '../src/backend/palworld-admin/palworld-admin.service';
import { PalworldConfigurationService } from '../src/backend/palworld-configuration/palworld-configuration.service';
import { PalworldPlayersService } from '../src/backend/palworld-players/palworld-players.service';
import { PalworldProcessService } from '../src/backend/palworld-process/palworld-process.service';
import { PortablePathService } from '../src/backend/portable-path/portable-path.service';
import { RemoteApiService } from '../src/backend/remote-api/remote-api.service';
import { ApplicationStatus } from '../src/shared/enums/application-status';

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
    expect((await fetch(`${baseUrl}/ui.css`)).headers.get('content-type')).toContain('text/css');
    expect((await fetch(`${baseUrl}/ui.js`)).headers.get('content-type')).toContain('text/javascript');
    expect((await fetch(`${baseUrl}/logo.png`)).headers.get('content-type')).toContain('image/png');
    expect((await fetch(`${baseUrl}/health`)).status).toBe(200);
    expect((await fetch(`${baseUrl}/status`)).status).toBe(401);

    const loginResponse = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'operator', password: 'secure-password' })
    });
    const login = await loginResponse.json() as { token: string };
    const authorization = { authorization: `Bearer ${login.token}` };

    expect(loginResponse.status).toBe(200);
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

  it('serves the client profile on its own port and enforces configured permissions', async () => {
    const port = await getFreePort();
    const appSettings = new AppSettingsService(paths);
    const fixture = createRemoteApiFixture(appSettings, portableRoot);
    remoteApi = fixture.service;

    const status = await remoteApi.update({
      confirmed: true,
      profile: 'CLIENT',
      enabled: true,
      bindMode: 'LOCAL_ONLY',
      port,
      username: 'friend',
      password: 'abcde',
      permissions: ['PLAYERS']
    });
    const baseUrl = `http://127.0.0.1:${String(port)}/api/v1`;
    expect(status.client.state).toBe('RUNNING');

    const loginResponse = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'friend', password: 'abcde' })
    });
    const login = await loginResponse.json() as {
      token: string;
      profile: string;
      permissions: string[];
    };
    const headers = { authorization: `Bearer ${login.token}` };

    expect(login.profile).toBe('CLIENT');
    expect(login.permissions).toEqual(['PLAYERS']);
    expect((await fetch(`${baseUrl}/session`, { headers })).status).toBe(200);
    expect((await fetch(`${baseUrl}/players`, { headers })).status).toBe(200);
    expect((await fetch(`${baseUrl}/status`, { headers })).status).toBe(403);
    expect((await fetch(`${baseUrl}/logs`, { headers })).status).toBe(403);
    expect((await fetch(`${baseUrl}/server/start`, { method: 'POST', headers })).status).toBe(403);
    expect(fixture.start).not.toHaveBeenCalled();
  });
});

function createRemoteApiFixture(
  appSettings: AppSettingsService,
  portableRoot: string
): { service: RemoteApiService; start: ReturnType<typeof vi.fn> } {
  const start = vi.fn(() => ({ operationId: 'start-operation' }));
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
      stop: vi.fn(),
      restart: vi.fn()
    } as unknown as PalworldProcessService,
    {
      getStatus: vi.fn(() => ({
        status: 'READY',
        players: [],
        currentPlayers: 0,
        maxPlayers: 32,
        updatedAt: new Date().toISOString(),
        message: 'No hay jugadores conectados.'
      }))
    } as unknown as PalworldPlayersService,
    { getStatus: vi.fn(), execute: vi.fn() } as unknown as PalworldAdminService,
    { readActive: vi.fn(), saveActive: vi.fn(), restoreDefault: vi.fn() } as unknown as PalworldConfigurationService,
    { getSummary: vi.fn(), createConfigurationBackup: vi.fn(), createWorldBackup: vi.fn() } as unknown as BackupService,
    {
      write: vi.fn(),
      readRecent: vi.fn(() => ({
        entries: [],
        updatedAt: new Date().toISOString()
      }))
    } as unknown as LoggingService,
    { getLocalAddresses: () => ['192.0.2.10'], getPublicAddress: vi.fn() } as unknown as NetworkService,
    { get: vi.fn() } as unknown as OperationManagerService
  );
  return { service, start };
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
