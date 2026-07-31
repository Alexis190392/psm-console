import { Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { OperationManagerService } from '../operations/operation-manager.service';
import { PortablePathService } from '../portable-path/portable-path.service';
import { PortableStateService } from '../portable-state/portable-state.service';
import { SteamCmdService } from '../steamcmd/steamcmd.service';
import {
  PalworldMaintenanceSnapshotService,
  type MaintenanceSnapshot
} from '../palworld-maintenance/palworld-maintenance-snapshot.service';
import type { OperationAcceptedDto } from '../../shared/dto/operation-progress.dto';
import type {
  PalworldInstallationStatusDto,
  PalworldInstallRequestDto,
  PalworldRepairRequestDto,
  PalworldUpdateRequestDto
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
    private readonly steamCmdService: SteamCmdService,
    private readonly portableStateService: PortableStateService,
    private readonly maintenanceSnapshotService: PalworldMaintenanceSnapshotService
  ) {}

  getStatus(): PalworldInstallationStatusDto {
    const expectedInstallDirectory = this.portablePathService.getPalworldServerRoot();
    const expectedExecutablePath = join(expectedInstallDirectory, 'PalServer.exe');
    const state = this.portableStateService.read();
    const persistedExecutablePath = state.server?.executablePath;
    const executablePath =
      persistedExecutablePath && existsSync(persistedExecutablePath) ? persistedExecutablePath : expectedExecutablePath;
    const installDirectory =
      persistedExecutablePath && existsSync(persistedExecutablePath)
        ? state.server?.installDirectory ?? expectedInstallDirectory
        : expectedInstallDirectory;
    const isInstalled = existsSync(executablePath);

    if (isInstalled) {
      this.portableStateService.rememberServer(installDirectory, executablePath);
    }

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

  update(request: PalworldUpdateRequestDto, getServerState?: () => string): OperationAcceptedDto {
    if (!request.confirmed) {
      throw new Error('PALWORLD_UPDATE_REQUIRES_CONFIRMATION');
    }

    const status = this.getStatus();

    if (status.status !== 'READY' || !existsSync(status.executablePath)) {
      throw new Error('PALWORLD_SERVER_NOT_READY');
    }

    const runtimeState = getServerState?.();

    if (runtimeState && ['STARTING', 'RUNNING', 'STOPPING'].includes(runtimeState)) {
      throw new Error('PALWORLD_UPDATE_REQUIRES_SERVER_STOPPED');
    }

    const steamCmdStatus = this.steamCmdService.getStatus();

    if (steamCmdStatus.status !== 'READY') {
      throw new Error('STEAMCMD_NOT_READY');
    }

    const operation = this.operationManagerService.create(
      'Actualizacion de Palworld Dedicated Server',
      'Preparando SteamCMD para actualizar y validar el servidor.'
    );

    void this.updateAsync(operation.operationId);

    return {
      operationId: operation.operationId
    };
  }

  repair(request: PalworldRepairRequestDto, getServerState?: () => string): OperationAcceptedDto {
    if (!request.confirmed) {
      throw new Error('PALWORLD_REPAIR_REQUIRES_CONFIRMATION');
    }

    this.assertServerReadyAndStopped(getServerState);

    const operation = this.operationManagerService.create(
      'Reparacion de Palworld Dedicated Server',
      'Preparando validacion completa de archivos con SteamCMD.'
    );

    void this.runServerAppUpdate(operation.operationId, 'repair');

    return {
      operationId: operation.operationId
    };
  }

  private async installAsync(operationId: string): Promise<void> {
    await this.runServerAppUpdate(operationId, 'install');
  }

  private async updateAsync(operationId: string): Promise<void> {
    await this.runServerAppUpdate(operationId, 'update');
  }

  private async runServerAppUpdate(
    operationId: string,
    mode: 'install' | 'update' | 'repair'
  ): Promise<void> {
    const steamCmdExecutable = this.steamCmdService.getStatus().executablePath;
    const installDirectory = this.portablePathService.getPalworldServerRoot();
    let snapshot: MaintenanceSnapshot | undefined;

    try {
      if (mode !== 'install') {
        this.operationManagerService.update(operationId, {
          status: 'RUNNING',
          percent: 2,
          message: 'Creando respaldo de mantenimiento antes de modificar el servidor.'
        });
        snapshot = await this.maintenanceSnapshotService.create();
        this.operationManagerService.appendLog(operationId, `Respaldo de mantenimiento: ${snapshot.root}`);
      }

      this.operationManagerService.update(operationId, {
        status: 'RUNNING',
        percent: 5,
        message:
          mode === 'install'
            ? 'Ejecutando SteamCMD para descargar Palworld Dedicated Server.'
            : mode === 'update'
              ? 'Ejecutando SteamCMD para actualizar Palworld Dedicated Server.'
              : 'Ejecutando SteamCMD para reparar y validar Palworld Dedicated Server.'
      });
      this.operationManagerService.appendLog(
        operationId,
        `"${steamCmdExecutable}" +force_install_dir "${installDirectory}" +login anonymous +app_update ${PALWORLD_DEDICATED_SERVER_APP_ID} validate +quit`
      );

      const result = await this.runSteamCmdWithRetry(operationId, steamCmdExecutable, installDirectory);

      if (this.operationManagerService.isCancelled(operationId)) {
        throw new Error('OPERATION_CANCELLED');
      }

      if (result.exitCode !== 0) {
        throw new Error(`SteamCMD termino con codigo ${String(result.exitCode)}. ${result.output}`.trim());
      }

      this.maintenanceSnapshotService.validate(snapshot);
      this.portableStateService.rememberServer(installDirectory, join(installDirectory, 'PalServer.exe'));
      if (snapshot) {
        this.operationManagerService.appendLog(
          operationId,
          await this.maintenanceSnapshotService.describeCatalogChanges(snapshot)
        );
      }

      this.operationManagerService.update(operationId, {
        status: 'COMPLETED',
        percent: 100,
        message:
          mode === 'install'
            ? 'Palworld Dedicated Server instalado correctamente.'
            : mode === 'update'
              ? 'Palworld Dedicated Server actualizado y validado correctamente.'
              : 'Palworld Dedicated Server reparado y validado correctamente.'
      });
    } catch (error) {
      if (snapshot) {
        this.operationManagerService.appendLog(
          operationId,
          'La operacion no finalizo correctamente. Restaurando configuracion y mundo protegidos.'
        );
        try {
          await this.maintenanceSnapshotService.restore(snapshot);
          this.operationManagerService.appendLog(operationId, 'Rollback de datos completado.');
        } catch (rollbackError) {
          this.operationManagerService.appendLog(
            operationId,
            `Fallo el rollback de datos: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`
          );
        }
      }

      if (this.operationManagerService.isCancelled(operationId)) {
        this.operationManagerService.completeCancellation(
          operationId,
          'Operacion cancelada. Configuracion y mundo quedaron restaurados.'
        );
        return;
      }

      this.operationManagerService.update(operationId, {
        status: 'FAILED',
        percent: 100,
        message:
          mode === 'install'
            ? 'No se pudo instalar Palworld Dedicated Server.'
            : mode === 'update'
              ? 'No se pudo actualizar Palworld Dedicated Server. Se restauraron los datos protegidos.'
              : 'No se pudo reparar Palworld Dedicated Server. Se restauraron los datos protegidos.',
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

    if (this.operationManagerService.isCancelled(operationId)) {
      return firstResult;
    }

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
          cwd: dirname(executablePath),
          windowsHide: true,
          shell: false
        }
      );

      let progress = 10;
      let lastOutput = '';
      let allOutput = '';
      this.operationManagerService.appendLog(operationId, `Intento ${String(attempt)} de instalacion con SteamCMD.`);
      this.operationManagerService.registerCancellation(operationId, () => {
        child.kill();
      });

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
        this.operationManagerService.clearCancellation(operationId);
        resolve({
          exitCode: code,
          output: allOutput || lastOutput
        });
      });
    });
  }

  private assertServerReadyAndStopped(getServerState?: () => string): void {
    const status = this.getStatus();
    if (status.status !== 'READY' || !existsSync(status.executablePath)) {
      throw new Error('PALWORLD_SERVER_NOT_READY');
    }

    const runtimeState = getServerState?.();
    if (runtimeState && ['STARTING', 'RUNNING', 'STOPPING'].includes(runtimeState)) {
      throw new Error('PALWORLD_MAINTENANCE_REQUIRES_SERVER_STOPPED');
    }

    if (this.steamCmdService.getStatus().status !== 'READY') {
      throw new Error('STEAMCMD_NOT_READY');
    }
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
