import { Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';
import extract from 'extract-zip';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { get } from 'node:https';
import { join } from 'node:path';
import { OperationManagerService } from '../operations/operation-manager.service';
import { PortablePathService } from '../portable-path/portable-path.service';
import type { OperationAcceptedDto } from '../../shared/dto/operation-progress.dto';
import type { SteamCmdInstallRequestDto, SteamCmdStatusDto } from '../../shared/dto/steamcmd-status.dto';

export const STEAMCMD_OFFICIAL_DOWNLOAD_URL =
  'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip';

@Injectable()
export class SteamCmdService {
  constructor(
    private readonly portablePathService: PortablePathService,
    private readonly operationManagerService: OperationManagerService
  ) {}

  getStatus(): SteamCmdStatusDto {
    const installDirectory = this.portablePathService.getSteamCmdRoot();
    const executablePath = join(installDirectory, 'steamcmd.exe');
    const isInstalled = existsSync(executablePath);

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

    void this.installAsync(operation.operationId);

    return {
      operationId: operation.operationId
    };
  }

  private async installAsync(operationId: string): Promise<void> {
    const installDirectory = this.portablePathService.getSteamCmdRoot();
    const zipPath = join(installDirectory, 'steamcmd.zip');

    try {
      this.operationManagerService.update(operationId, {
        status: 'RUNNING',
        percent: 5,
        message: `Creando carpeta ${installDirectory}`
      });
      await mkdir(installDirectory, { recursive: true });
      this.operationManagerService.appendLog(operationId, `mkdir "${installDirectory}"`);

      await this.downloadSteamCmdZip(operationId, zipPath);

      this.operationManagerService.update(operationId, {
        status: 'RUNNING',
        percent: 85,
        message: 'Extrayendo SteamCMD.'
      });
      this.operationManagerService.appendLog(operationId, `extract steamcmd.zip -> "${installDirectory}"`);
      await extract(zipPath, { dir: installDirectory });

      this.operationManagerService.update(operationId, {
        status: 'RUNNING',
        percent: 92,
        message: 'Inicializando SteamCMD.'
      });
      await this.initializeSteamCmd(operationId, join(installDirectory, 'steamcmd.exe'));

      this.operationManagerService.update(operationId, {
        status: 'COMPLETED',
        percent: 100,
        message: 'SteamCMD descargado y extraido correctamente.'
      });
    } catch (error) {
      this.operationManagerService.update(operationId, {
        status: 'FAILED',
        percent: 100,
        message: 'No se pudo instalar SteamCMD.',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async downloadSteamCmdZip(operationId: string, zipPath: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.operationManagerService.appendLog(operationId, `GET ${STEAMCMD_OFFICIAL_DOWNLOAD_URL}`);
      const request = get(STEAMCMD_OFFICIAL_DOWNLOAD_URL, (response) => {
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          reject(new Error(`Redireccion no soportada al descargar SteamCMD: ${response.headers.location}`));
          return;
        }

        if (response.statusCode !== 200) {
          const statusCode = response.statusCode ? String(response.statusCode) : 'desconocido';
          reject(new Error(`SteamCMD respondio HTTP ${statusCode}`));
          return;
        }

        this.operationManagerService.appendLog(operationId, `HTTP ${String(response.statusCode)} -> "${zipPath}"`);
        const totalBytes = Number(response.headers['content-length'] ?? 0);
        let downloadedBytes = 0;
        const file = createWriteStream(zipPath);

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
          file.close(() => {
            this.operationManagerService.appendLog(operationId, `download complete "${zipPath}"`);
            resolve();
          });
        });
        file.on('error', reject);
      });

      request.on('error', reject);
    });
  }

  private async initializeSteamCmd(operationId: string, executablePath: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.operationManagerService.appendLog(operationId, `"${executablePath}" +quit`);
      const child = spawn(executablePath, ['+quit'], {
        windowsHide: true,
        shell: false
      });

      let lastOutput = '';

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
        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(`SteamCMD no pudo inicializarse. Codigo ${String(code)}. ${lastOutput}`.trim()));
      });
    });
  }
}
