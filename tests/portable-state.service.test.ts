import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PortablePathService } from '../src/backend/portable-path/portable-path.service';
import { PortableStateService } from '../src/backend/portable-state/portable-state.service';

describe('PortableStateService', () => {
  const portableRoot = join(process.cwd(), '.tmp-tests', 'portable-state');
  const portablePathService = new PortablePathService({
    isPackaged: true,
    getPath: () => join(portableRoot, 'PalCM.exe')
  });
  const service = new PortableStateService(portablePathService);

  afterEach(async () => {
    await rm(portableRoot, { recursive: true, force: true });
  });

  it('persists installed component paths in config state', () => {
    const executablePath = join(portableRoot, 'tools', 'steamcmd', 'steamcmd.exe');

    service.rememberSteamCmd(join(portableRoot, 'tools', 'steamcmd'), executablePath);

    expect(existsSync(service.getStatePath())).toBe(true);
    expect(service.read().steamCmd).toMatchObject({
      status: 'READY',
      executablePath
    });
  });
});
