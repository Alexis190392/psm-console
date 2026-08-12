import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PalworldSettingsDefinitionsService } from '../src/backend/palworld-settings/palworld-settings-definitions.service';
import { resetExternalSettingDefinitions, getSettingDefinition } from '../src/renderer/config/setting-definition-resolver';

const temporaryRoots: string[] = [];

afterEach(async () => {
  resetExternalSettingDefinitions();
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('PalworldSettingsDefinitionsService', () => {
  it('creates a default editable definition file without requiring a server installation', async () => {
    const root = await createRoot();
    const service = new PalworldSettingsDefinitionsService(createPaths(root));

    const status = await service.ensureLoaded();
    const path = join(root, 'config', 'palworld-settings.definitions.json');
    const file = parseDefinitionsFile(await readFile(path, 'utf8'));

    expect(existsSync(path)).toBe(true);
    expect(status.definitions['Difficulty']).toMatchObject({ label: 'Dificultad predefinida', kind: 'select' });
    expect(file.parametros['PalEggDefaultHatchingTime']?.titulo).toBe('Tiempo de incubación de huevos');
    expect(file.parametros['PalEggDefaultHatchingTime']?.tipo).toBe('number');
    expect(file.parametros['PalEggDefaultHatchingTime']?.cero).toBeDefined();
  });

  it('uses valid external overrides and ignores malformed entries', async () => {
    const root = await createRoot();
    const configRoot = join(root, 'config');
    await writeFile(join(configRoot, 'palworld-settings.definitions.json'), JSON.stringify({
      version: 1,
      parametros: {
        FutureFlag: { categoria: 'Experimental', tipo: 'boolean', titulo: 'Bandera futura' },
        Broken: { tipo: 'invalid' }
      }
    }), 'utf8');

    const service = new PalworldSettingsDefinitionsService(createPaths(root));
    await service.ensureLoaded();

    expect(getSettingDefinition('FutureFlag', 'false')).toMatchObject({
      label: 'Bandera futura',
      group: 'Experimental',
      kind: 'boolean'
    });
    expect(getSettingDefinition('Broken', 'false')).toMatchObject({
      group: 'Otros',
      kind: 'boolean'
    });
  });

  it('applies a valid external change and preserves the latest valid definitions on an invalid save', async () => {
    const root = await createRoot();
    const path = join(root, 'config', 'palworld-settings.definitions.json');
    const service = new PalworldSettingsDefinitionsService(createPaths(root));
    const updates: string[] = [];
    service.onChanged((status) => {
      updates.push(status.definitions['FutureOption']?.label ?? '');
    });
    await service.ensureLoaded();

    await writeFile(path, JSON.stringify({
      version: 1,
      parametros: {
        FutureOption: { titulo: 'Opcion futura', categoria: 'Experimental', tipo: 'boolean' }
      }
    }), 'utf8');
    await service.reload();

    expect(getSettingDefinition('FutureOption', 'false')).toMatchObject({
      label: 'Opcion futura',
      group: 'Experimental',
      kind: 'boolean'
    });
    expect(updates).toEqual(['Opcion futura']);
    expect(service.getRevision()).toBe(1);

    await writeFile(path, '{', 'utf8');
    await service.reload();

    expect(getSettingDefinition('FutureOption', 'false')).toMatchObject({ label: 'Opcion futura' });
    expect(updates).toEqual(['Opcion futura']);
    expect(service.getRevision()).toBe(1);
    service.onApplicationShutdown();
  });
});

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'palcm-settings-definitions-'));
  temporaryRoots.push(root);
  await rm(join(root, 'config'), { recursive: true, force: true });
  await mkdir(join(root, 'config'), { recursive: true });
  return root;
}

function parseDefinitionsFile(content: string): {
  parametros: Record<string, { titulo?: string; tipo?: string; cero?: object }>;
} {
  const parsed = JSON.parse(content) as unknown;
  if (!parsed || typeof parsed !== 'object' || !('parametros' in parsed)) {
    throw new Error('Invalid definitions fixture.');
  }
  return parsed as { parametros: Record<string, { titulo?: string; tipo?: string; cero?: object }> };
}

function createPaths(root: string): ConstructorParameters<typeof PalworldSettingsDefinitionsService>[0] {
  return {
    getApplicationConfigRoot: () => join(root, 'config'),
    getPortableRoot: () => root
  } as ConstructorParameters<typeof PalworldSettingsDefinitionsService>[0];
}
