import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { OperationManagerService } from '../src/backend/operations/operation-manager.service';
import { PalworldConfigurationService } from '../src/backend/palworld-configuration/palworld-configuration.service';
import { PortablePathService } from '../src/backend/portable-path/portable-path.service';
import { PortableStateService } from '../src/backend/portable-state/portable-state.service';

describe('PalworldConfigurationService', () => {
  const portableRoot = join(process.cwd(), '.tmp-tests', 'palworld-configuration');
  const portablePathService = new PortablePathService({
    isPackaged: true,
    getPath: () => join(portableRoot, 'PalCM.exe')
  });
  const portableStateService = new PortableStateService(portablePathService);
  const serverRoot = portablePathService.getPalworldServerRoot();
  const activePath = join(serverRoot, 'Pal', 'Saved', 'Config', 'WindowsServer', 'PalWorldSettings.ini');
  const templatePath = join(serverRoot, 'DefaultPalWorldSettings.ini');

  afterEach(async () => {
    await rm(portableRoot, { recursive: true, force: true });
  });

  it('reports missing when the active configuration does not exist', () => {
    const service = new PalworldConfigurationService(
      portablePathService,
      new OperationManagerService(),
      portableStateService
    );

    expect(service.getStatus()).toMatchObject({
      status: 'MISSING',
      activePath
    });
  });

  it('requires confirmation before creating the active configuration', () => {
    const service = new PalworldConfigurationService(
      portablePathService,
      new OperationManagerService(),
      portableStateService
    );

    expect(() => service.createDefault({ confirmed: false })).toThrow(
      'CONFIGURATION_CREATE_DEFAULT_REQUIRES_CONFIRMATION'
    );
  });

  it('creates the active configuration from the installed template', async () => {
    await mkdir(serverRoot, { recursive: true });
    await writeFile(templatePath, '[/Script/Pal.PalGameWorldSettings]\nOptionSettings=()');
    const operationManager = new OperationManagerService();
    const service = new PalworldConfigurationService(portablePathService, operationManager, portableStateService);

    const accepted = service.createDefault({ confirmed: true });
    await waitForOperation(accepted.operationId, operationManager);

    expect(existsSync(activePath)).toBe(true);
    expect(service.getStatus().status).toBe('READY');
  });
});

async function waitForOperation(operationId: string, operationManager: OperationManagerService): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const operation = operationManager.get(operationId);

    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(operation.status)) {
      expect(operation.status).toBe('COMPLETED');
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 25);
    });
  }

  throw new Error('Timed out waiting for configuration operation.');
}
