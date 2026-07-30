import { Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';
import extract from 'extract-zip';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { get } from 'node:https';
import { dirname, join } from 'node:path';
import { OperationManagerService } from '../operations/operation-manager.service';
import { PortablePathService } from '../portable-path/portable-path.service';
import { PortableStateService } from '../portable-state/portable-state.service';
import type { OperationAcceptedDto } from '../../shared/dto/operation-progress.dto';
import type {
  SteamCmdInstallRequestDto,
  SteamCmdRepairRequestDto,
  SteamCmdStatusDto
} from '../../shared/dto/steamcmd-status.dto';

export const STEAMCMD_OFFICIAL_DOWNLOAD_URL =
  'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip';

@Injectable()
export class SteamCmdService {
  constructor(
    private readonly portablePathService: PortablePathService,
    private readonly operationManagerService: OperationManagerService,
    private readonly portableStateService: PortableStateService
  ) {}

  getStatus(): SteamCmdStatusDto {
    const expectedInstallDirectory = this.portablePathService.getSteamCmdRoot();
    const expectedExecutablePath = join(expectedInstallDirectory, 'steamcmd.exe');
    const state = this.portableStateService.read();
    const persistedExecutablePath = state.steamCmd?.executablePath;
    const executablePath =
      persistedExecutablePath && existsSync(persistedExecutablePath) ? persistedExecutablePath : expectedExecutablePath;
    const installDirectory =
      persistedExecutablePath && existsSync(persistedExecutablePath)
        ? state.steamCmd?.installDirectory ?? expectedInstallDirectory
        : expectedInstallDirectory;
    const isInstalled = existsSync(executablePath);

    if (isInstalled) {
      this.portableStateService.rememberSteamCmd(installDirectory, executablePath);
    }

    return {
      status: isInstalled ? 'READY' : 'MISSING',
      installDirectory,
      executablePath,
      officialDownloadUrl: STEAMCMD_OFFICIAL_DOWNLOAD_URL,
      message: isInstalled
        ? 'SteamCMD esta instalado y listo.'
        : 'SteamCMD no esta instalado. Se requiere confirmacion para descargarlo desde el sitio oficial.'
    };
  }

  install(request: SteamCmdInstallRequestDto): OperationAcceptedDto {
    if (!request.confirmed) {
      throw new Error('STEAMCMD_INSTALL_REQUIRES_CONFIRMATION');
    }

    const operation = this.operationManagerService.create(
      'Instalacion de SteamCMD',
      'Preparando descarga oficial de SteamCMD.'
    );

    void this.installAsync(operation.operationId, 'install');

    return {
      operationId: operation.operationId
    };
  }

  repair(request: SteamCmdRepairRequestDto): OperationAcceptedDto {
    if (!request.confirmed) {
      throw new Error('STEAMCMD_REPAIR_REQUIRES_CONFIRMATION');
    }

    const operation = this.operationManagerService.create(
      'Reparacion de SteamCMD',
      'Preparando una copia limpia desde la fuente oficial.'
    );

    void this.installAsync(operation.operationId, 'repair');

    return {
      operationId: operation.operationId
    };
  }

  private async installAsync(operationId: string, mode: 'install' | 'repair'): Promise<void> {
    const installDirectory = this.portablePathService.getSteamCmdRoot();
    const zipPath = join(installDirectory, 'steamcmd.zip');

    try {
      this.operationManagerService.update(operationId, {
        status: 'RUNNING',
        percent: 5,
        message: `Preparando carpeta ${installDirectory}`
      });
      await mkdir(installDirectory, { recursive: true });
      this.operationManagerService.appendLog(operationId, `mkdir "${installDirectory}"`);

      await this.downloadSteamCmdZip(operationId, zipPath);

      this.operationManagerService.update(operationId, {
        status: 'RUNNING',
        percent: 85,
        message: mode === 'repair' ? 'Reemplazando archivos de SteamCMD.' : 'Extrayendo SteamCMD.',
        canCancel: false
      });
      this.operationManagerService.appendLog(operationId, `extract steamcmd.zip -> "${installDirectory}"`);
      await extract(zipPath, { dir: installDirectory });

      this.operationManagerService.update(operationId, {
        status: 'RUNNING',
        percent: 92,
        message: 'Inicializando SteamCMD.'
      });
      const executablePath = join(installDirectory, 'steamcmd.exe');
      try {
        await this.initializeSteamCmd(operationId, executablePath);
      } catch (error) {
        if (!isSteamCmdBootstrapExitError(error) || !isSteamCmdBootstrapReady(installDirectory)) {
          throw error;
        }

        this.operationManagerService.appendLog(
          operationId,
          'SteamCMD devolvio un codigo de bootstrap no exitoso, pero sus binarios quedaron instalados y disponibles.'
        );
      }
      this.portableStateService.rememberSteamCmd(installDirectory, executablePath);

      this.operationManagerService.update(operationId, {
        status: 'COMPLETED',
        percent: 100,
        message:
          mode === 'repair'
            ? 'SteamCMD reparado e inicializado correctamente.'
            : 'SteamCMD descargado y extraido correctamente.'
      });
    } catch (error) {
      await rm(zipPath, { force: true }).catch(() => undefined);
      if (this.operationManagerService.isCancelled(operationId)) {
        this.operationManagerService.completeCancellation(
          operationId,
          'Operacion cancelada. Se elimino la descarga incompleta.'
        );
        return;
      }

      this.operationManagerService.update(operationId, {
        status: 'FAILED',
        percent: 100,
        message: mode === 'repair' ? 'No se pudo reparar SteamCMD.' : 'No se pudo instalar SteamCMD.',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async downloadSteamCmdZip(operationId: string, zipPath: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.operationManagerService.appendLog(operationId, `GET ${STEAMCMD_OFFICIAL_DOWNLOAD_URL}`);
      let settled = false;
      let file: ReturnType<typeof createWriteStream> | null = null;
      const finish = (error?: Error): void => {
        if (settled) {
          return;
        }

        settled = true;
        this.operationManagerService.clearCancellation(operationId);
        if (error) {
          reject(error);
          return;
        }

        resolve();
      };
      const request = get(STEAMCMD_OFFICIAL_DOWNLOAD_URL, (response) => {
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          finish(new Error(`Redireccion no soportada al descargar SteamCMD: ${response.headers.location}`));
          return;
        }

        if (response.statusCode !== 200) {
          const statusCode = response.statusCode ? String(response.statusCode) : 'desconocido';
          finish(new Error(`SteamCMD respondio HTTP ${statusCode}`));
          return;
        }

        this.operationManagerService.appendLog(operationId, `HTTP ${String(response.statusCode)} -> "${zipPath}"`);
        const totalBytes = Number(response.headers['content-length'] ?? 0);
        let downloadedBytes = 0;
        file = createWriteStream(zipPath);

        response.on('data', (chunk: Buffer) => {
          downloadedBytes += chunk.length;
          const downloadPercent = totalBytes > 0 ? (downloadedBytes / totalBytes) * 75 : 25;

          this.operationManagerService.update(operationId, {
            status: 'RUNNING',
            percent: 10 + downloadPercent,
            message:
              totalBytes > 0
                ? `Descargando SteamCMD ${String(Math.round((downloadedBytes / totalBytes) * 100))}%.`
                : `Descargando SteamCMD ${String(Math.round(downloadedBytes / 1024))} KB.`
          });
        });

        response.pipe(file);
        file.on('finish', () => {
          file?.close(() => {
            this.operationManagerService.appendLog(operationId, `download complete "${zipPath}"`);
            finish();
          });
        });
        file.on('error', (error) => {
          finish(error);
        });
      });

      this.operationManagerService.registerCancellation(operationId, () => {
        file?.destroy();
        request.destroy(new Error('OPERATION_CANCELLED'));
      });
      request.on('error', (error) => {
        finish(error);
      });
    });
  }

  private async initializeSteamCmd(operationId: string, executablePath: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.operationManagerService.appendLog(operationId, `"${executablePath}" +quit`);
      const child = spawn(executablePath, ['+quit'], {
        cwd: dirname(executablePath),
        windowsHide: true,
        shell: false
      });

      let lastOutput = '';
      this.operationManagerService.registerCancellation(operationId, () => {
        child.kill();
      });

      const handleOutput = (chunk: Buffer): void => {
        lastOutput = chunk.toString('utf8').trim();
        lastOutput
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .forEach((line) => {
            this.operationManagerService.appendLog(operationId, line);
          });
      };

      child.stdout.on('data', handleOutput);
      child.stderr.on('data', handleOutput);
      child.on('error', reject);
      child.on('close', (code) => {
        this.operationManagerService.clearCancellation(operationId);
        if (this.operationManagerService.isCancelled(operationId)) {
          reject(new Error('OPERATION_CANCELLED'));
          return;
        }

        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(`SteamCMD no pudo inicializarse. Codigo ${String(code)}. ${lastOutput}`.trim()));
      });
    });
  }
}

export function isSteamCmdBootstrapReady(installDirectory: string): boolean {
  return (
    existsSync(join(installDirectory, 'steamcmd.exe')) &&
    existsSync(join(installDirectory, 'steamclient.dll'))
  );
}

function isSteamCmdBootstrapExitError(error: unknown): error is Error {
  return error instanceof Error && error.message.startsWith('SteamCMD no pudo inicializarse. Codigo ');
}
