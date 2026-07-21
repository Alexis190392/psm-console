import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PalworldPlayersService } from '../src/backend/palworld-players/palworld-players.service';
import type { PalworldConfigurationService } from '../src/backend/palworld-configuration/palworld-configuration.service';
import type { PalworldProcessService } from '../src/backend/palworld-process/palworld-process.service';
import type { PortablePathService } from '../src/backend/portable-path/portable-path.service';

let closeServer: (() => Promise<void>) | null = null;

describe('PalworldPlayersService', () => {
  const portableRoot = join(process.cwd(), '.tmp-tests', 'palworld-players');
  const activePath = join(portableRoot, 'server', 'palworld', 'Pal', 'Saved', 'Config', 'WindowsServer', 'PalWorldSettings.ini');

  afterEach(async () => {
    await closeServer?.();
    closeServer = null;
    await rm(portableRoot, { recursive: true, force: true });
  });

  it('reports server stopped before reading REST settings', async () => {
    const service = createService('STOPPED', 'OptionSettings=(RESTAPIEnabled=True,AdminPassword="secret")');

    await expect(service.getStatus()).resolves.toMatchObject({
      status: 'SERVER_STOPPED',
      currentPlayers: 0
    });
  });

  it('enables REST API in the INI when the server is running without REST', async () => {
    const content = 'OptionSettings=(RESTAPIEnabled=False,RESTAPIPort=8212,AdminPassword="secret",ServerPlayerMaxNum=8)';
    await writeConfiguration(activePath, content);
    const service = createService(
      'RUNNING',
      content,
      activePath,
      portableRoot
    );

    await expect(service.getStatus()).resolves.toMatchObject({
      status: 'REST_CONFIGURED_RESTART_REQUIRED',
      restPort: 8212,
      maxPlayers: 8
    });
    await expect(readFile(activePath, 'utf8')).resolves.toContain('RESTAPIEnabled=True');
  });

  it('sets the default admin password when AdminPassword is empty', async () => {
    const content = 'OptionSettings=(RESTAPIEnabled=True,RESTAPIPort=8212,AdminPassword="",ServerPlayerMaxNum=8)';
    await writeConfiguration(activePath, content);
    const service = createService(
      'RUNNING',
      content,
      activePath,
      portableRoot
    );

    await expect(service.getStatus()).resolves.toMatchObject({
      status: 'REST_CONFIGURED_RESTART_REQUIRED',
      players: [],
      currentPlayers: 0,
      restPort: 8212
    });
    await expect(readFile(activePath, 'utf8')).resolves.toContain('AdminPassword="admin"');
  });

  it('waits for REST API warmup before reporting connection errors', async () => {
    const service = createService(
      'RUNNING',
      'OptionSettings=(RESTAPIEnabled=True,RESTAPIPort=1,AdminPassword="secret",ServerPlayerMaxNum=8)'
    );

    await expect(service.getStatus()).resolves.toMatchObject({
      status: 'REST_STARTING',
      players: [],
      currentPlayers: 0,
      restPort: 1
    });
  });

  it('keeps previous players available for ban state changes', async () => {
    const responses = [
      {
        players: [
          { name: 'Alex', userId: 'steam_a', playerId: 'player_a', ping: 24.2 },
          { name: 'Bruno', userId: 'steam_b', playerId: 'player_b', ping: 30 }
        ]
      },
      {
        players: [{ name: 'Alex', userId: 'steam_a', playerId: 'player_a', ping: 25 }]
      }
    ];
    const port = await startMockPlayersServer(() => responses.shift() ?? { players: [] });
    const service = createService(
      'RUNNING',
      `OptionSettings=(RESTAPIEnabled=True,RESTAPIPort=${String(port)},AdminPassword="secret",ServerPlayerMaxNum=8)`
    );

    await expect(service.getStatus()).resolves.toMatchObject({
      status: 'READY',
      currentPlayers: 2,
      previousPlayers: []
    });

    service.markBanState('steam_b', 'BANNED');

    await expect(service.getStatus()).resolves.toMatchObject({
      status: 'READY',
      currentPlayers: 1,
      players: [expect.objectContaining({ userId: 'steam_a', online: true })],
      previousPlayers: [expect.objectContaining({ userId: 'steam_b', online: false, banState: 'BANNED' })]
    });
  });
});

function startMockPlayersServer(handler: (request: IncomingMessage) => unknown): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer((request: IncomingMessage, response: ServerResponse) => {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify(handler(request)));
    });

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address === 'object' && address !== null) {
        closeServer = () =>
          new Promise((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }

              closeResolve();
            });
          });
        resolve(address.port);
      }
    });
  });
}

async function writeConfiguration(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
}

function createService(
  runtimeState: 'STOPPED' | 'RUNNING',
  content: string,
  configurationPath = 'C:\\portable\\PalWorldSettings.ini',
  portableRoot = process.cwd()
): PalworldPlayersService {
  return new PalworldPlayersService(
    {
      readActive: () => Promise.resolve({
        path: configurationPath,
        content,
        updatedAt: new Date().toISOString()
      })
    } as PalworldConfigurationService,
    {
      getRuntimeStatus: () => ({
        state: runtimeState,
        executablePath: 'C:\\portable\\server\\palworld\\PalServer.exe',
        updatedAt: new Date().toISOString(),
        message: runtimeState,
        logs: []
      })
    } as unknown as PalworldProcessService,
    {
      getPortableRoot: () => portableRoot
    } as PortablePathService
  );
}
