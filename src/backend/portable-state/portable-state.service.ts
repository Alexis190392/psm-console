import { Injectable } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PortablePathService } from '../portable-path/portable-path.service';

export interface PalcmPortableState {
  version: 1;
  updatedAt: string;
  steamCmd?: {
    status: 'READY';
    installDirectory: string;
    executablePath: string;
  };
  server?: {
    status: 'READY';
    installDirectory: string;
    executablePath: string;
  };
  configuration?: {
    status: 'READY';
    templatePath: string;
    activePath: string;
  };
}

@Injectable()
export class PortableStateService {
  constructor(private readonly portablePathService: PortablePathService) {}

  getStatePath(): string {
    return join(this.portablePathService.getConfigRoot(), 'palcm-state.json');
  }

  read(): PalcmPortableState {
    const statePath = this.getStatePath();

    if (!existsSync(statePath)) {
      return createEmptyState();
    }

    try {
      const parsed = JSON.parse(readFileSync(statePath, 'utf8')) as Partial<PalcmPortableState>;
      return {
        version: 1,
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
        steamCmd: parsed.steamCmd,
        server: parsed.server,
        configuration: parsed.configuration
      };
    } catch {
      return createEmptyState();
    }
  }

  save(patch: Partial<Omit<PalcmPortableState, 'version' | 'updatedAt'>>): PalcmPortableState {
    const next: PalcmPortableState = {
      ...this.read(),
      ...patch,
      version: 1,
      updatedAt: new Date().toISOString()
    };

    const statePath = this.getStatePath();
    mkdirSync(dirname(statePath), { recursive: true });
    writeFileSync(statePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    return next;
  }

  rememberSteamCmd(installDirectory: string, executablePath: string): void {
    this.save({
      steamCmd: {
        status: 'READY',
        installDirectory,
        executablePath
      }
    });
  }

  rememberServer(installDirectory: string, executablePath: string): void {
    this.save({
      server: {
        status: 'READY',
        installDirectory,
        executablePath
      }
    });
  }

  rememberConfiguration(templatePath: string, activePath: string): void {
    this.save({
      configuration: {
        status: 'READY',
        templatePath,
        activePath
      }
    });
  }
}

function createEmptyState(): PalcmPortableState {
  return {
    version: 1,
    updatedAt: new Date().toISOString()
  };
}
