import { Inject, Injectable, Optional } from '@nestjs/common';
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
    if (this.appPathProvider?.isPackaged === true) {
      return dirname(this.appPathProvider.getPath('exe'));
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
}
