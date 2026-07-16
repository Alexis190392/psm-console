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

interface SteamCmdRunResult {
  exitCode: number | null;
  output: string;
}

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
      this.operationManagerService.appendLog(
        operationId,
        `"${steamCmdExecutable}" +force_install_dir "${installDirectory}" +login anonymous +app_update ${PALWORLD_DEDICATED_SERVER_APP_ID} validate +quit`
      );

      const result = await this.runSteamCmdWithRetry(operationId, steamCmdExecutable, installDirectory);

      if (result.exitCode !== 0) {
        throw new Error(`SteamCMD termino con codigo ${String(result.exitCode)}. ${result.output}`.trim());
      }

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

  private async runSteamCmdWithRetry(
    operationId: string,
    executablePath: string,
    installDirectory: string
  ): Promise<SteamCmdRunResult> {
    const firstResult = await this.runSteamCmd(operationId, executablePath, installDirectory, 1);

    if (firstResult.exitCode === 0 || !shouldRetryAfterSteamCmdBootstrap(firstResult.output)) {
      return firstResult;
    }

    this.operationManagerService.appendLog(
      operationId,
      'SteamCMD se actualizo o reinicio durante el primer intento. Reintentando instalacion del servidor.'
    );
    await wait(1500);

    return this.runSteamCmd(operationId, executablePath, installDirectory, 2);
  }

  private async runSteamCmd(
    operationId: string,
    executablePath: string,
    installDirectory: string,
    attempt: number
  ): Promise<SteamCmdRunResult> {
    return new Promise<SteamCmdRunResult>((resolve, reject) => {
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
      let allOutput = '';
      this.operationManagerService.appendLog(operationId, `Intento ${String(attempt)} de instalacion con SteamCMD.`);

      const handleOutput = (chunk: Buffer): void => {
        lastOutput = chunk.toString('utf8').trim();
        allOutput = `${allOutput}\n${lastOutput}`.trim();
        progress = Math.min(95, progress + 3);
        lastOutput
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .forEach((line) => {
            this.operationManagerService.appendLog(operationId, line);
          });

        this.operationManagerService.update(operationId, {
          status: 'RUNNING',
          percent: progress,
          message: lastOutput.length > 0 ? lastOutput : 'SteamCMD sigue instalando el servidor.',
          logMessage: false
        });
      };

      child.stdout.on('data', handleOutput);
      child.stderr.on('data', handleOutput);
      child.on('error', reject);
      child.on('close', (code) => {
        resolve({
          exitCode: code,
          output: allOutput || lastOutput
        });
      });
    });
  }
}

function shouldRetryAfterSteamCmdBootstrap(output: string): boolean {
  return /Missing configuration|Update complete, launching|Actualizaci[oÃ³]n completa/i.test(output);
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
