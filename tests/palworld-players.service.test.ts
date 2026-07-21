import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PalworldPlayersService } from '../src/backend/palworld-players/palworld-players.service';
import type { PalworldConfigurationService } from '../src/backend/palworld-configuration/palworld-configuration.service';
import type { PalworldProcessService } from '../src/backend/palworld-process/palworld-process.service';
import type { PortablePathService } from '../src/backend/portable-path/portable-path.service';

describe('PalworldPlayersService', () => {
  const portableRoot = join(process.cwd(), '.tmp-tests', 'palworld-players');
  const activePath = join(portableRoot, 'server', 'palworld', 'Pal', 'Saved', 'Config', 'WindowsServer', 'PalWorldSettings.ini');

  afterEach(async () => {
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

  it('does not expose or use REST API without AdminPassword', async () => {
    const service = createService(
      'RUNNING',
      'OptionSettings=(RESTAPIEnabled=True,RESTAPIPort=8212,AdminPassword="",ServerPlayerMaxNum=8)'
    );

    await expect(service.getStatus()).resolves.toMatchObject({
      status: 'ADMIN_PASSWORD_MISSING',
      players: [],
      currentPlayers: 0
    });
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
});

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
