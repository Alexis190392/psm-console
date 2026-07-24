import { Injectable } from '@nestjs/common';
import { cp, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PortablePathService } from '../portable-path/portable-path.service';

export interface MaintenanceSnapshot {
  root: string;
  configurationExisted: boolean;
  worldExisted: boolean;
  defaultSettingsExisted: boolean;
}

interface MaintenanceManifest {
  createdAt: string;
  configurationPath: string;
  worldPath: string;
  defaultSettingsPath: string;
  configurationExisted: boolean;
  worldExisted: boolean;
  defaultSettingsExisted: boolean;
}

@Injectable()
export class PalworldMaintenanceSnapshotService {
  constructor(private readonly portablePathService: PortablePathService) {}

  async create(): Promise<MaintenanceSnapshot> {
    const paths = this.getProtectedPaths();
    const root = join(
      this.portablePathService.getPortableRoot(),
      'backups',
      'maintenance',
      `update.${createTimestamp()}`
    );
    const snapshot: MaintenanceSnapshot = {
      root,
      configurationExisted: existsSync(paths.configuration),
      worldExisted: existsSync(paths.world),
      defaultSettingsExisted: existsSync(paths.defaultSettings)
    };

    await mkdir(root, { recursive: true });
    if (snapshot.configurationExisted) {
      await copyFile(paths.configuration, join(root, 'PalWorldSettings.ini'));
    }
    if (snapshot.worldExisted) {
      await cp(paths.world, join(root, 'SaveGames'), { recursive: true });
    }
    if (snapshot.defaultSettingsExisted) {
      await copyFile(paths.defaultSettings, join(root, 'DefaultPalWorldSettings.ini'));
    }

    const manifest: MaintenanceManifest = {
      createdAt: new Date().toISOString(),
      configurationPath: paths.configuration,
      worldPath: paths.world,
      defaultSettingsPath: paths.defaultSettings,
      configurationExisted: snapshot.configurationExisted,
      worldExisted: snapshot.worldExisted,
      defaultSettingsExisted: snapshot.defaultSettingsExisted
    };
    await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    return snapshot;
  }

  async restore(snapshot: MaintenanceSnapshot): Promise<void> {
    const paths = this.getProtectedPaths();

    if (snapshot.configurationExisted) {
      await mkdir(join(paths.serverRoot, 'Pal', 'Saved', 'Config', 'WindowsServer'), { recursive: true });
      await copyFile(join(snapshot.root, 'PalWorldSettings.ini'), paths.configuration);
    }
    if (snapshot.worldExisted) {
      await rm(paths.world, { recursive: true, force: true });
      await mkdir(join(paths.serverRoot, 'Pal', 'Saved'), { recursive: true });
      await cp(join(snapshot.root, 'SaveGames'), paths.world, { recursive: true });
    }
  }

  validate(snapshot?: MaintenanceSnapshot): void {
    const paths = this.getProtectedPaths();
    const required = [join(paths.serverRoot, 'PalServer.exe'), paths.defaultSettings];

    if (snapshot?.configurationExisted) {
      required.push(paths.configuration);
    }
    if (snapshot?.worldExisted) {
      required.push(paths.world);
    }

    const missing = required.filter((path) => !existsSync(path));
    if (missing.length > 0) {
      throw new Error(`PALWORLD_UPDATE_VALIDATION_FAILED: ${missing.join(', ')}`);
    }
  }

  async describeCatalogChanges(snapshot: MaintenanceSnapshot): Promise<string> {
    if (!snapshot.defaultSettingsExisted) {
      return 'No habia un catalogo INI anterior para comparar.';
    }

    const paths = this.getProtectedPaths();
    const [before, after] = await Promise.all([
      readFile(join(snapshot.root, 'DefaultPalWorldSettings.ini'), 'utf8'),
      readFile(paths.defaultSettings, 'utf8')
    ]);
    const beforeKeys = extractSettingKeys(before);
    const afterKeys = extractSettingKeys(after);
    const added = [...afterKeys].filter((key) => !beforeKeys.has(key));
    const removed = [...beforeKeys].filter((key) => !afterKeys.has(key));

    if (added.length === 0 && removed.length === 0) {
      return 'El catalogo oficial de parametros INI no cambio.';
    }

    return `Cambios del catalogo INI: ${String(added.length)} agregados, ${String(removed.length)} retirados.${
      added.length > 0 ? ` Nuevos: ${added.join(', ')}.` : ''
    }${removed.length > 0 ? ` Retirados: ${removed.join(', ')}.` : ''}`;
  }

  private getProtectedPaths(): {
    serverRoot: string;
    configuration: string;
    world: string;
    defaultSettings: string;
  } {
    const serverRoot = this.portablePathService.getPalworldServerRoot();
    return {
      serverRoot,
      configuration: join(serverRoot, 'Pal', 'Saved', 'Config', 'WindowsServer', 'PalWorldSettings.ini'),
      world: join(serverRoot, 'Pal', 'Saved', 'SaveGames'),
      defaultSettings: join(serverRoot, 'DefaultPalWorldSettings.ini')
    };
  }
}

function extractSettingKeys(content: string): Set<string> {
  const keys = new Set<string>();
  const optionSettings = content.match(/OptionSettings=\(([\s\S]*?)\)\s*$/m)?.[1] ?? '';

  for (const match of optionSettings.matchAll(/(?:^|,)([A-Za-z][A-Za-z0-9_]*)=/g)) {
    if (match[1]) {
      keys.add(match[1]);
    }
  }

  return keys;
}

function createTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}
