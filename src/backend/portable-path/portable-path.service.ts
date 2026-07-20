import { Inject, Injectable, Optional } from '@nestjs/common';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface ElectronAppPathProvider {
  getPath(name: 'exe'): string;
  isPackaged?: boolean;
}

export const ELECTRON_APP_PATH_PROVIDER = 'ELECTRON_APP_PATH_PROVIDER';

@Injectable()
export class PortablePathService {
  private readonly developmentRoot = process.cwd();

  constructor(
    @Optional()
    @Inject(ELECTRON_APP_PATH_PROVIDER)
    private readonly appPathProvider?: ElectronAppPathProvider
  ) {}

  getPortableRoot(): string {
    const portableExecutableDirectory = process.env['PORTABLE_EXECUTABLE_DIR'];
    if (portableExecutableDirectory) {
      return portableExecutableDirectory;
    }

    const electronExecutablePath = process.env['PALCM_ELECTRON_EXE_PATH'];
    if (process.env['PALCM_ELECTRON_IS_PACKAGED'] === 'true' && electronExecutablePath) {
      return dirname(electronExecutablePath);
    }

    if (this.appPathProvider?.isPackaged === true) {
      return dirname(this.appPathProvider.getPath('exe'));
    }

    if (process.env['PALCM_RUNTIME_ENV'] === 'development') {
      return join(this.developmentRoot, 'ejecucionPruebas');
    }

    return this.developmentRoot;
  }

  getToolsRoot(): string {
    return join(this.getPortableRoot(), 'tools');
  }

  getSteamCmdRoot(): string {
    return join(this.getToolsRoot(), 'steamcmd');
  }

  getPalworldServerRoot(): string {
    return join(this.getPortableRoot(), 'server', 'palworld');
  }

  getConfigRoot(): string {
    return join(this.getPortableRoot(), 'config');
  }

  getLogsRoot(): string {
    return join(this.getPortableRoot(), 'logs');
  }

  ensurePortableLayout(): void {
    [
      this.getPortableRoot(),
      this.getToolsRoot(),
      this.getSteamCmdRoot(),
      this.getPalworldServerRoot(),
      this.getConfigRoot(),
      join(this.getPortableRoot(), 'backups', 'configuration'),
      join(this.getPortableRoot(), 'backups', 'world'),
      this.getLogsRoot()
    ].forEach((directory) => {
      mkdirSync(directory, { recursive: true });
    });
  }
}
