import { Injectable } from '@nestjs/common';
import { copyFile, cp, mkdir, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { OperationManagerService } from '../operations/operation-manager.service';
import { PalworldConfigurationService } from '../palworld-configuration/palworld-configuration.service';
import { PortablePathService } from '../portable-path/portable-path.service';
import type {
  BackupCreateRequestDto,
  BackupDeleteRequestDto,
  BackupEntryDto,
  BackupSummaryDto
} from '../../shared/dto/backup-status.dto';
import type { OperationAcceptedDto } from '../../shared/dto/operation-progress.dto';

@Injectable()
export class BackupService {
  constructor(
    private readonly portablePathService: PortablePathService,
    private readonly palworldConfigurationService: PalworldConfigurationService,
    private readonly operationManagerService: OperationManagerService
  ) {}

  async getSummary(): Promise<BackupSummaryDto> {
    const configurationSourcePath = this.palworldConfigurationService.getStatus().activePath;
    const worldSourcePath = this.getWorldSourcePath();
    const configurationBackups = await this.listBackupEntries('configuration');
    const worldBackups = await this.listBackupEntries('world');

    return {
      configurationBackups,
      worldBackups,
      configurationSourcePath,
      worldSourcePath,
      message:
        configurationBackups.length + worldBackups.length > 0
          ? 'Backups disponibles para revisar antes de cambios importantes.'
          : 'Todavia no hay backups creados desde la app.'
    };
  }

  createConfigurationBackup(request: BackupCreateRequestDto): OperationAcceptedDto {
    if (!request.confirmed) {
      throw new Error('BACKUP_CONFIGURATION_REQUIRES_CONFIRMATION');
    }

    const operation = this.operationManagerService.create(
      'Backup de configuracion',
      'Preparando copia segura de PalWorldSettings.ini.'
    );

    void this.createConfigurationBackupAsync(operation.operationId);

    return {
      operationId: operation.operationId
    };
  }

  createWorldBackup(request: BackupCreateRequestDto): OperationAcceptedDto {
    if (!request.confirmed) {
      throw new Error('BACKUP_WORLD_REQUIRES_CONFIRMATION');
    }

    const operation = this.operationManagerService.create(
      'Backup del mundo',
      'Preparando copia de SaveGames del servidor.'
    );

    void this.createWorldBackupAsync(operation.operationId);

    return {
      operationId: operation.operationId
    };
  }

  deleteBackup(
    request: BackupDeleteRequestDto,
    moveToTrash: (path: string) => Promise<void>
  ): OperationAcceptedDto {
    if (!request.confirmed) {
      throw new Error('BACKUP_DELETE_REQUIRES_CONFIRMATION');
    }

    const operation = this.operationManagerService.create(
      'Eliminar backup',
      'Preparando envio del backup a la papelera.'
    );

    void this.deleteBackupAsync(operation.operationId, request.backupId, moveToTrash);

    return {
      operationId: operation.operationId
    };
  }

  private async createConfigurationBackupAsync(operationId: string): Promise<void> {
    const sourcePath = this.palworldConfigurationService.getStatus().activePath;

    try {
      if (!existsSync(sourcePath)) {
        throw new Error(`CONFIGURATION_SOURCE_NOT_FOUND: ${sourcePath}`);
      }

      const targetPath = join(
        this.getBackupDirectory('configuration'),
        `PalWorldSettings.${createTimestamp()}.ini`
      );

      this.operationManagerService.update(operationId, {
        status: 'RUNNING',
        percent: 30,
        message: 'Creando carpeta de backups de configuracion.'
      });
      await mkdir(dirname(targetPath), { recursive: true });

      this.operationManagerService.update(operationId, {
        status: 'RUNNING',
        percent: 75,
        message: 'Copiando PalWorldSettings.ini.'
      });
      await copyFile(sourcePath, targetPath);
      this.operationManagerService.appendLog(operationId, `copy "${sourcePath}" "${targetPath}"`);

      this.operationManagerService.update(operationId, {
        status: 'COMPLETED',
        percent: 100,
        message: 'Backup de configuracion creado correctamente.'
      });
    } catch (error) {
      this.operationManagerService.update(operationId, {
        status: 'FAILED',
        percent: 100,
        message: 'No se pudo crear el backup de configuracion.',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async createWorldBackupAsync(operationId: string): Promise<void> {
    const sourcePath = this.getWorldSourcePath();

    try {
      if (!existsSync(sourcePath)) {
        throw new Error(`WORLD_SAVEGAMES_SOURCE_NOT_FOUND: ${sourcePath}`);
      }

      const targetPath = join(this.getBackupDirectory('world'), `SaveGames.${createTimestamp()}`);

      this.operationManagerService.update(operationId, {
        status: 'RUNNING',
        percent: 20,
        message: 'Creando carpeta de backups del mundo.'
      });
      await mkdir(dirname(targetPath), { recursive: true });

      this.operationManagerService.update(operationId, {
        status: 'RUNNING',
        percent: 60,
        message: 'Copiando SaveGames. Puede tardar si el mundo es grande.'
      });
      await cp(sourcePath, targetPath, { recursive: true, force: false, errorOnExist: true });
      this.operationManagerService.appendLog(operationId, `copy-dir "${sourcePath}" "${targetPath}"`);

      this.operationManagerService.update(operationId, {
        status: 'COMPLETED',
        percent: 100,
        message: 'Backup del mundo creado correctamente.'
      });
    } catch (error) {
      this.operationManagerService.update(operationId, {
        status: 'FAILED',
        percent: 100,
        message: 'No se pudo crear el backup del mundo.',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async listBackupEntries(kind: 'configuration' | 'world'): Promise<BackupEntryDto[]> {
    const directory = this.getBackupDirectory(kind);

    if (!existsSync(directory)) {
      return [];
    }

    const entries = await readdir(directory, { withFileTypes: true });
    const backups = await Promise.all(
      entries
        .filter((entry) => entry.isFile() || entry.isDirectory())
        .map(async (entry): Promise<BackupEntryDto> => {
          const path = join(directory, entry.name);
          const metadata = await stat(path);

          return {
            id: `${kind}:${entry.name}`,
            kind,
            name: entry.name,
            path,
            sizeBytes: entry.isDirectory() ? await getDirectorySize(path) : metadata.size,
            createdAt: metadata.birthtime.toISOString()
          };
        })
    );

    return backups.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  private async deleteBackupAsync(
    operationId: string,
    backupId: string,
    moveToTrash: (path: string) => Promise<void>
  ): Promise<void> {
    try {
      const backup = await this.findBackupById(backupId);

      if (!backup) {
        throw new Error(`BACKUP_NOT_FOUND: ${backupId}`);
      }

      this.operationManagerService.update(operationId, {
        status: 'RUNNING',
        percent: 50,
        message: `Enviando backup a la papelera: ${backup.name}.`
      });
      await moveToTrash(backup.path);
      this.operationManagerService.appendLog(operationId, `trash "${backup.path}"`);
      this.operationManagerService.update(operationId, {
        status: 'COMPLETED',
        percent: 100,
        message: 'Backup enviado a la papelera.'
      });
    } catch (error) {
      this.operationManagerService.update(operationId, {
        status: 'FAILED',
        percent: 100,
        message: 'No se pudo enviar el backup a la papelera.',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async findBackupById(backupId: string): Promise<BackupEntryDto | null> {
    const [configurationBackups, worldBackups] = await Promise.all([
      this.listBackupEntries('configuration'),
      this.listBackupEntries('world')
    ]);

    return [...configurationBackups, ...worldBackups].find((backup) => backup.id === backupId) ?? null;
  }

  private getBackupDirectory(kind: 'configuration' | 'world'): string {
    return join(this.portablePathService.getPortableRoot(), 'backups', kind);
  }

  private getWorldSourcePath(): string {
    return join(this.portablePathService.getPalworldServerRoot(), 'Pal', 'Saved', 'SaveGames');
  }
}

async function getDirectorySize(path: string): Promise<number> {
  const entries = await readdir(path, { withFileTypes: true });
  const sizes = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = join(path, entry.name);

      if (entry.isDirectory()) {
        return getDirectorySize(entryPath);
      }

      if (!entry.isFile()) {
        return 0;
      }

      return (await stat(entryPath)).size;
    })
  );

  return sizes.reduce((total, size) => total + size, 0);
}

function createTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}
