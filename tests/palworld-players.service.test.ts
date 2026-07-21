import { describe, expect, it } from 'vitest';
import { PalworldPlayersService } from '../src/backend/palworld-players/palworld-players.service';
import type { PalworldConfigurationService } from '../src/backend/palworld-configuration/palworld-configuration.service';
import type { PalworldProcessService } from '../src/backend/palworld-process/palworld-process.service';

describe('PalworldPlayersService', () => {
  it('reports server stopped before reading REST settings', async () => {
    const service = createService('STOPPED', 'OptionSettings=(RESTAPIEnabled=True,AdminPassword="secret")');

    await expect(service.getStatus()).resolves.toMatchObject({
      status: 'SERVER_STOPPED',
      currentPlayers: 0
    });
  });

  it('asks to enable REST API when the server is running without REST', async () => {
    const service = createService(
      'RUNNING',
      'OptionSettings=(RESTAPIEnabled=False,RESTAPIPort=8212,AdminPassword="secret",ServerPlayerMaxNum=8)'
    );

    await expect(service.getStatus()).resolves.toMatchObject({
      status: 'REST_DISABLED',
      restPort: 8212,
      maxPlayers: 8
    });
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
});

function createService(runtimeState: 'STOPPED' | 'RUNNING', content: string): PalworldPlayersService {
  return new PalworldPlayersService(
    {
      readActive: () => Promise.resolve({
        path: 'C:\\portable\\PalWorldSettings.ini',
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
    } as unknown as PalworldProcessService
  );
}
