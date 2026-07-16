import { Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { OperationManagerService } from '../operations/operation-manager.service';
import { PortablePathService } from '../portable-path/portable-path.service';
import { SteamCmdService } from '../steamcmd/steamcmd.service';
import type { OperationAcceptedDto } from '../../shared/dto/operation-progress.dto';
import type {
  PalworldInstallationStatusDto,
  PalworldInstallRequestDto
} from '../../shared/dto/palworld-installation-status.dto';

export const PALWORLD_DEDICATED_SERVER_APP_ID = '2394010';

@Injectable()
export class PalworldInstallationService {
  constructor(
    private readonly portablePathService: PortablePathService,
    private readonly operationManagerService: OperationManagerService,
    private readonly steamCmdService: SteamCmdService
  ) {}

  getStatus(): PalworldInstallationStatusDto {
    const installDirectory = this.portablePathService.getPalworldServerRoot();
    const executablePath = join(installDirectory, 'PalServer.exe');
    const isInstalled = existsSync(executablePath);

    return {
      status: isInstalled ? 'READY' : 'MISSING',
      appId: PALWORLD_DEDICATED_SERVER_APP_ID,
      installDirectory,
      executablePath,
      message: isInstalled
        ? 'Palworld Dedicated Server esta instalado.'
        : 'Palworld Dedicated Server no esta instalado. Se requiere confirmacion para instalarlo con SteamCMD.'
    };
  }

  install(request: PalworldInstallRequestDto): OperationAcceptedDto {
    if (!request.confirmed) {
      throw new Error('PALWORLD_INSTALL_REQUIRES_CONFIRMATION');
    }

    const steamCmdStatus = this.steamCmdService.getStatus();

    if (steamCmdStatus.status !== 'READY') {
      throw new Error('STEAMCMD_NOT_READY');
    }

    const operation = this.operationManagerService.create(
      'Instalacion de Palworld Dedicated Server',
      'Preparando SteamCMD para instalar el servidor.'
    );

    void this.installAsync(operation.operationId);

    return {
      operationId: operation.operationId
    };
  }

  private async installAsync(operationId: string): Promise<void> {
    const steamCmdExecutable = this.steamCmdService.getStatus().executablePath;
    const installDirectory = this.portablePathService.getPalworldServerRoot();

    try {
      this.operationManagerService.update(operationId, {
        status: 'RUNNING',
        percent: 5,
        message: 'Ejecutando SteamCMD para descargar Palworld Dedicated Server.'
      });

      await this.runSteamCmd(operationId, steamCmdExecutable, installDirectory);

      if (!existsSync(join(installDirectory, 'PalServer.exe'))) {
        throw new Error('PALSERVER_EXE_NOT_FOUND_AFTER_INSTALL');
      }

      this.operationManagerService.update(operationId, {
        status: 'COMPLETED',
        percent: 100,
        message: 'Palworld Dedicated Server instalado correctamente.'
      });
    } catch (error) {
      this.operationManagerService.update(operationId, {
        status: 'FAILED',
        percent: 100,
        message: 'No se pudo instalar Palworld Dedicated Server.',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async runSteamCmd(operationId: string, executablePath: string, installDirectory: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        executablePath,
        [
          '+force_install_dir',
          installDirectory,
          '+login',
          'anonymous',
          '+app_update',
          PALWORLD_DEDICATED_SERVER_APP_ID,
          'validate',
          '+quit'
        ],
        {
          windowsHide: true,
          shell: false
        }
      );

      let progress = 10;
      let lastOutput = '';

      const handleOutput = (chunk: Buffer): void => {
        lastOutput = chunk.toString('utf8').trim();
        progress = Math.min(95, progress + 3);

        this.operationManagerService.update(operationId, {
          status: 'RUNNING',
          percent: progress,
          message: lastOutput.length > 0 ? lastOutput : 'SteamCMD sigue instalando el servidor.'
        });
      };

      child.stdout.on('data', handleOutput);
      child.stderr.on('data', handleOutput);
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(`SteamCMD termino con codigo ${String(code)}. ${lastOutput}`.trim()));
      });
    });
  }
}
