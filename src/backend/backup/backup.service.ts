import { Injectable, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { BackupArchiveService } from './backup-archive.service';
import { BackupIntegrityService, getManifestPath } from './backup-integrity.service';
import { BackupPolicyService } from './backup-policy.service';
import { OperationManagerService } from '../operations/operation-manager.service';
import { PalworldConfigurationService } from '../palworld-configuration/palworld-configuration.service';
import { PalworldProcessService } from '../palworld-process/palworld-process.service';
import { PortablePathService } from '../portable-path/portable-path.service';
import type {
  BackupCreateRequestDto,
  BackupDeleteRequestDto,
  BackupEntryDto,
  BackupFormat,
  BackupKind,
  BackupOrigin,
  BackupPolicyDto,
  BackupRestoreRequestDto,
  BackupSummaryDto,
  BackupUpdatePolicyRequestDto,
  BackupVerifyRequestDto
} from '../../shared/dto/backup-status.dto';
import type { OperationAcceptedDto } from '../../shared/dto/operation-progress.dto';

const AUTOMATIC_CHECK_INTERVAL_MS = 15 * 60 * 1000;

@Injectable()
export class BackupService implements OnModuleInit, OnModuleDestroy {
  private automaticTimer: NodeJS.Timeout | null = null;
  private automaticBackupInFlight = false;

  constructor(
    private readonly portablePathService: PortablePathService,
    private readonly palworldConfigurationService: PalworldConfigurationService,
    private readonly operationManagerService: OperationManagerService,
    private readonly backupPolicyService: BackupPolicyService,
    private readonly backupIntegrityService: BackupIntegrityService,
    private readonly backupArchiveService: BackupArchiveService,
    @Optional() private readonly palworldProcessService?: PalworldProcessService
  ) {}

  onModuleInit(): void {
    this.automaticTimer = setInterval(() => {
      void this.checkAutomaticBackups();
    }, AUTOMATIC_CHECK_INTERVAL_MS);
    this.automaticTimer.unref();
    void this.checkAutomaticBackups();
  }

  onModuleDestroy(): void {
    if (this.automaticTimer) {
      clearInterval(this.automaticTimer);
      this.automaticTimer = null;
    }
  }

  async getSummary(): Promise<BackupSummaryDto> {
    const policy = await this.backupPolicyService.read();
    const [configurationBackups, worldBackups] = await Promise.all([
      this.listBackupEntries('configuration'),
      this.listBackupEntries('world')
    ]);
    const allBackups = [...configurationBackups, ...worldBackups];
    void this.runAutomaticBackupIfDue(policy, allBackups).catch(() => undefined);

    return {
      configurationBackups,
      worldBackups,
      configurationSourcePath: this.palworldConfigurationService.getStatus().activePath,
      worldSourcePath: this.getWorldSourcePath(),
      policy,
      totalSizeBytes: allBackups.reduce((total, backup) => total + backup.sizeBytes, 0),
      verifiedBackups: allBackups.filter((backup) => backup.integrity === 'VERIFIED').length,
      corruptedBackups: allBackups.filter((backup) => backup.integrity === 'CORRUPTED').length,
      message:
        allBackups.length > 0
          ? 'Backups disponibles para revisar antes de cambios importantes.'
          : 'Todavia no hay backups creados desde la app.'
    };
  }

  createConfigurationBackup(request: BackupCreateRequestDto): OperationAcceptedDto {
    if (!request.confirmed) {
      throw new Error('BACKUP_CONFIGURATION_REQUIRES_CONFIRMATION');
    }
    return this.startOperation(
      'Backup de configuracion',
      'Preparando copia segura de PalWorldSettings.ini.',
      (operationId) => this.createConfigurationBackupAsync(operationId, 'manual')
    );
  }

  createWorldBackup(request: BackupCreateRequestDto): OperationAcceptedDto {
    if (!request.confirmed) {
      throw new Error('BACKUP_WORLD_REQUIRES_CONFIRMATION');
    }
    return this.startOperation(
      'Backup del mundo',
      'Preparando copia de SaveGames del servidor.',
      (operationId) => this.createWorldBackupAsync(operationId, 'manual')
    );
  }

  updatePolicy(request: BackupUpdatePolicyRequestDto): OperationAcceptedDto {
    if (!request.confirmed) {
      throw new Error('BACKUP_POLICY_UPDATE_REQUIRES_CONFIRMATION');
    }
    return this.startOperation(
      'Politica de backups',
      'Guardando politica de backups automaticos.',
      (operationId) => this.updatePolicyAsync(operationId, request)
    );
  }

  verifyBackup(request: BackupVerifyRequestDto): OperationAcceptedDto {
    return this.startOperation(
      'Verificacion de backup',
      'Calculando integridad SHA-256 del backup seleccionado.',
      (operationId) => this.verifyBackupAsync(operationId, request.backupId)
    );
  }

  deleteBackup(
    request: BackupDeleteRequestDto,
    moveToTrash: (path: string) => Promise<void>
  ): OperationAcceptedDto {
    if (!request.confirmed) {
      throw new Error('BACKUP_DELETE_REQUIRES_CONFIRMATION');
    }
    return this.startOperation(
      'Eliminar backup',
      'Preparando envio del backup a la papelera.',
      (operationId) => this.deleteBackupAsync(operationId, request.backupId, moveToTrash)
    );
  }

  restoreBackup(request: BackupRestoreRequestDto): OperationAcceptedDto {
    if (!request.confirmed) {
      throw new Error('BACKUP_RESTORE_REQUIRES_CONFIRMATION');
    }
    return this.startOperation(
      'Restaurar backup',
      'Preparando restauracion transaccional del backup seleccionado.',
      (operationId) => this.restoreBackupAsync(operationId, request.backupId)
    );
  }

  private startOperation(
    title: string,
    message: string,
    action: (operationId: string) => Promise<void>
  ): OperationAcceptedDto {
    const operation = this.operationManagerService.create(title, message);
    void action(operation.operationId);
    return { operationId: operation.operationId };
  }

  private async createConfigurationBackupAsync(operationId: string, origin: BackupOrigin): Promise<void> {
    try {
      this.operationManagerService.update(operationId, {
        status: 'RUNNING',
        percent: 25,
        message: 'Copiando configuracion y generando manifiesto.'
      });
      const backup = await this.createConfigurationBackupFile(origin);
      this.operationManagerService.appendLog(operationId, `backup "${backup.path}" sha256=${backup.checksum}`);
      this.operationManagerService.update(operationId, {
        status: 'COMPLETED',
        percent: 100,
        message: 'Backup de configuracion creado y verificado.'
      });
    } catch (error) {
      this.failOperation(operationId, 'No se pudo crear el backup de configuracion.', error);
    }
  }

  private async createWorldBackupAsync(operationId: string, origin: BackupOrigin): Promise<void> {
    try {
      const policy = await this.backupPolicyService.read();
      this.operationManagerService.update(operationId, {
        status: 'RUNNING',
        percent: 20,
        message: policy.compressWorldBackups
          ? 'Comprimiendo SaveGames en TAR.GZ.'
          : 'Copiando SaveGames.'
      });
      const backup = await this.createWorldBackupFile(origin, policy.compressWorldBackups);
      this.operationManagerService.appendLog(operationId, `backup "${backup.path}" sha256=${backup.checksum}`);
      this.operationManagerService.update(operationId, {
        status: 'COMPLETED',
        percent: 100,
        message: 'Backup del mundo creado y verificado.'
      });
    } catch (error) {
      this.failOperation(operationId, 'No se pudo crear el backup del mundo.', error);
    }
  }

  private async createConfigurationBackupFile(origin: BackupOrigin): Promise<{
    path: string;
    checksum: string;
  }> {
    const sourcePath = this.palworldConfigurationService.getStatus().activePath;
    if (!existsSync(sourcePath)) {
      throw new Error(`CONFIGURATION_SOURCE_NOT_FOUND: ${sourcePath}`);
    }

    const targetPath = join(
      this.getBackupDirectory('configuration'),
      `PalWorldSettings.${origin}.${createTimestamp()}.ini`
    );
    await mkdir(dirname(targetPath), { recursive: true });
    await copyFile(sourcePath, targetPath);
    const manifest = await this.backupIntegrityService.createManifest(
      targetPath,
      'configuration',
      origin,
      'file'
    );
    return { path: targetPath, checksum: manifest.sha256 };
  }

  private async createWorldBackupFile(origin: BackupOrigin, compress: boolean): Promise<{
    path: string;
    checksum: string;
  }> {
    const sourcePath = this.getWorldSourcePath();
    if (!existsSync(sourcePath)) {
      throw new Error(`WORLD_SAVEGAMES_SOURCE_NOT_FOUND: ${sourcePath}`);
    }

    const targetBasePath = join(
      this.getBackupDirectory('world'),
      `SaveGames.${origin}.${createTimestamp()}`
    );
    const archived = await this.backupArchiveService.createWorld(sourcePath, targetBasePath, compress);
    const manifest = await this.backupIntegrityService.createManifest(
      archived.path,
      'world',
      origin,
      archived.format
    );
    return { path: archived.path, checksum: manifest.sha256 };
  }

  private async updatePolicyAsync(operationId: string, request: BackupUpdatePolicyRequestDto): Promise<void> {
    try {
      this.operationManagerService.update(operationId, {
        status: 'RUNNING',
        percent: 20,
        message: 'Validando y guardando politica.'
      });
      const policy = await this.backupPolicyService.update(request);
      this.operationManagerService.update(operationId, {
        status: 'RUNNING',
        percent: 55,
        message: 'Aplicando retencion a backups automaticos.'
      });
      await this.applyAutomaticRetention(policy);
      if (policy.automaticEnabled) {
        this.operationManagerService.update(operationId, {
          status: 'RUNNING',
          percent: 70,
          message: 'Comprobando si corresponde crear un backup automatico.'
        });
        await this.runAutomaticBackupIfDue(policy);
      }
      this.operationManagerService.update(operationId, {
        status: 'COMPLETED',
        percent: 100,
        message: 'Politica de backups guardada.'
      });
    } catch (error) {
      this.failOperation(operationId, 'No se pudo guardar la politica de backups.', error);
    }
  }

  private async verifyBackupAsync(operationId: string, backupId: string): Promise<void> {
    try {
      const backup = await this.requireBackup(backupId);
      this.operationManagerService.update(operationId, {
        status: 'RUNNING',
        percent: 35,
        message: `Verificando ${backup.name}.`
      });
      const integrity = await this.backupIntegrityService.verify(backup.path);
      if (integrity.state === 'CORRUPTED') {
        throw new Error(`BACKUP_INTEGRITY_FAILED: ${integrity.message}`);
      }
      if (integrity.state === 'UNVERIFIED') {
        throw new Error('BACKUP_MANIFEST_NOT_FOUND');
      }
      this.operationManagerService.update(operationId, {
        status: 'COMPLETED',
        percent: 100,
        message: 'Integridad SHA-256 verificada correctamente.'
      });
    } catch (error) {
      this.failOperation(operationId, 'No se pudo verificar el backup.', error);
    }
  }

  private async restoreBackupAsync(operationId: string, backupId: string): Promise<void> {
    try {
      const backup = await this.requireBackup(backupId);
      this.operationManagerService.update(operationId, {
        status: 'RUNNING',
        percent: 10,
        message: `Verificando integridad de ${backup.name}.`
      });
      const integrity = await this.backupIntegrityService.verify(backup.path);
      if (integrity.state === 'CORRUPTED') {
        throw new Error(`BACKUP_INTEGRITY_FAILED: ${integrity.message}`);
      }

      if (backup.kind === 'configuration') {
        await this.restoreConfigurationTransaction(operationId, backup);
      } else {
        await this.restoreWorldTransaction(operationId, backup);
      }
    } catch (error) {
      this.failOperation(operationId, 'No se pudo restaurar el backup. El destino anterior fue preservado.', error);
    }
  }

  private async restoreConfigurationTransaction(operationId: string, backup: BackupEntryDto): Promise<void> {
    const targetPath = this.palworldConfigurationService.getStatus().activePath;
    const transactionId = randomUUID();
    const stagingPath = `${targetPath}.palcm-stage-${transactionId}`;
    const rollbackPath = `${targetPath}.palcm-rollback-${transactionId}`;
    let targetMoved = false;

    try {
      this.operationManagerService.update(operationId, {
        status: 'RUNNING',
        percent: 30,
        message: 'Preparando y validando archivo temporal.'
      });
      await mkdir(dirname(targetPath), { recursive: true });
      await copyFile(backup.path, stagingPath);
      assertConfigurationContent(await readFile(stagingPath, 'utf8'));

      this.operationManagerService.update(operationId, {
        status: 'RUNNING',
        percent: 50,
        message: 'Creando backup preventivo del INI actual.'
      });
      if (existsSync(targetPath)) {
        await this.createConfigurationBackupFile('safety');
        await rename(targetPath, rollbackPath);
        targetMoved = true;
      }

      this.operationManagerService.update(operationId, {
        status: 'RUNNING',
        percent: 75,
        message: 'Aplicando configuracion restaurada.'
      });
      await rename(stagingPath, targetPath);
      assertConfigurationContent(await readFile(targetPath, 'utf8'));
      await rm(rollbackPath, { force: true });
      this.operationManagerService.update(operationId, {
        status: 'COMPLETED',
        percent: 100,
        message: 'Configuracion restaurada de forma transaccional.'
      });
    } catch (error) {
      await rm(stagingPath, { force: true });
      if (targetMoved && existsSync(rollbackPath)) {
        await rm(targetPath, { force: true });
        await rename(rollbackPath, targetPath);
      }
      throw error;
    }
  }

  private async restoreWorldTransaction(operationId: string, backup: BackupEntryDto): Promise<void> {
    const runtime = this.palworldProcessService?.getRuntimeStatus();
    if (runtime && ['STARTING', 'RUNNING', 'STOPPING'].includes(runtime.state)) {
      throw new Error('WORLD_RESTORE_REQUIRES_SERVER_STOPPED');
    }

    const targetPath = this.getWorldSourcePath();
    const transactionId = randomUUID();
    const stagingRoot = join(dirname(targetPath), `.palcm-world-stage-${transactionId}`);
    const rollbackPath = `${targetPath}.palcm-rollback-${transactionId}`;
    let targetMoved = false;

    try {
      this.operationManagerService.update(operationId, {
        status: 'RUNNING',
        percent: 30,
        message: backup.format === 'tar-gzip'
          ? 'Extrayendo backup en una carpeta temporal.'
          : 'Copiando backup en una carpeta temporal.'
      });
      const stagedPath = await this.backupArchiveService.stageWorld(backup.path, backup.format, stagingRoot);
      await assertWorldDirectory(stagedPath);

      this.operationManagerService.update(operationId, {
        status: 'RUNNING',
        percent: 50,
        message: 'Creando backup preventivo del mundo actual.'
      });
      if (existsSync(targetPath)) {
        const policy = await this.backupPolicyService.read();
        await this.createWorldBackupFile('safety', policy.compressWorldBackups);
        await rename(targetPath, rollbackPath);
        targetMoved = true;
      }

      this.operationManagerService.update(operationId, {
        status: 'RUNNING',
        percent: 75,
        message: 'Intercambiando SaveGames de forma transaccional.'
      });
      await rename(stagedPath, targetPath);
      await assertWorldDirectory(targetPath);
      await rm(rollbackPath, { recursive: true, force: true });
      await rm(stagingRoot, { recursive: true, force: true });
      this.operationManagerService.update(operationId, {
        status: 'COMPLETED',
        percent: 100,
        message: 'Mundo restaurado de forma transaccional.'
      });
    } catch (error) {
      await rm(stagingRoot, { recursive: true, force: true });
      if (targetMoved && existsSync(rollbackPath)) {
        await rm(targetPath, { recursive: true, force: true });
        await rename(rollbackPath, targetPath);
      }
      throw error;
    }
  }

  private async deleteBackupAsync(
    operationId: string,
    backupId: string,
    moveToTrash: (path: string) => Promise<void>
  ): Promise<void> {
    try {
      const backup = await this.requireBackup(backupId);
      this.operationManagerService.update(operationId, {
        status: 'RUNNING',
        percent: 45,
        message: `Enviando ${backup.name} a la papelera.`
      });
      await moveToTrash(backup.path);
      const manifestPath = getManifestPath(backup.path);
      if (existsSync(manifestPath)) {
        await moveToTrash(manifestPath);
      }
      this.operationManagerService.update(operationId, {
        status: 'COMPLETED',
        percent: 100,
        message: 'Backup y manifiesto enviados a la papelera.'
      });
    } catch (error) {
      this.failOperation(operationId, 'No se pudo enviar el backup a la papelera.', error);
    }
  }

  private async listBackupEntries(kind: BackupKind): Promise<BackupEntryDto[]> {
    const directory = this.getBackupDirectory(kind);
    if (!existsSync(directory)) {
      return [];
    }

    const entries = (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => !entry.name.endsWith('.manifest.json'));
    const backups = await Promise.all(
      entries.map(async (entry): Promise<BackupEntryDto> => {
        const path = join(directory, entry.name);
        const [metadata, integrity] = await Promise.all([
          stat(path),
          this.backupIntegrityService.inspect(path)
        ]);
        const format = resolveBackupFormat(entry.name, entry.isDirectory(), integrity.manifest?.format);
        const origin = integrity.manifest?.origin ?? inferBackupOrigin(entry.name);
        const sizeBytes = entry.isDirectory()
          ? await getDirectorySize(path)
          : metadata.size;

        return {
          id: `${kind}:${entry.name}`,
          kind,
          name: entry.name,
          path,
          sizeBytes,
          createdAt: integrity.manifest?.createdAt ?? metadata.birthtime.toISOString(),
          origin,
          format,
          integrity: integrity.state,
          checksum: integrity.manifest?.sha256,
          integrityMessage: integrity.message
        };
      })
    );
    return backups.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  private async checkAutomaticBackups(): Promise<void> {
    try {
      const policy = await this.backupPolicyService.read();
      await this.runAutomaticBackupIfDue(policy);
    } catch {
      // The periodic task retries later; manual operations still expose their errors.
    }
  }

  private async runAutomaticBackupIfDue(
    policy: BackupPolicyDto,
    knownBackups?: BackupEntryDto[]
  ): Promise<void> {
    if (!policy.automaticEnabled || this.automaticBackupInFlight) {
      return;
    }

    const runtime = this.palworldProcessService?.getRuntimeStatus();
    if (runtime && ['STARTING', 'RUNNING', 'STOPPING'].includes(runtime.state)) {
      return;
    }

    const backups = knownBackups ?? [
      ...(await this.listBackupEntries('configuration')),
      ...(await this.listBackupEntries('world'))
    ];
    const latestAutomatic = backups
      .filter((backup) => backup.origin === 'automatic')
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
    const intervalMs = policy.automaticIntervalHours * 60 * 60 * 1000;
    if (latestAutomatic && Date.now() - new Date(latestAutomatic.createdAt).getTime() < intervalMs) {
      return;
    }

    this.automaticBackupInFlight = true;
    try {
      if (existsSync(this.palworldConfigurationService.getStatus().activePath)) {
        await this.createConfigurationBackupFile('automatic');
      }
      if (existsSync(this.getWorldSourcePath())) {
        await this.createWorldBackupFile('automatic', policy.compressWorldBackups);
      }
      await this.applyAutomaticRetention(policy);
    } finally {
      this.automaticBackupInFlight = false;
    }
  }

  private async applyAutomaticRetention(policy: BackupPolicyDto): Promise<void> {
    await Promise.all(
      (['configuration', 'world'] as const).map(async (kind) => {
        const automaticBackups = (await this.listBackupEntries(kind))
          .filter((backup) => backup.origin === 'automatic')
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
        const expired = automaticBackups.slice(policy.automaticRetentionPerType);
        await Promise.all(expired.map((backup) => this.removeBackupPermanently(backup.path)));
      })
    );
  }

  private async removeBackupPermanently(path: string): Promise<void> {
    await rm(path, { recursive: true, force: true });
    await rm(getManifestPath(path), { force: true });
  }

  private async requireBackup(backupId: string): Promise<BackupEntryDto> {
    const [configurationBackups, worldBackups] = await Promise.all([
      this.listBackupEntries('configuration'),
      this.listBackupEntries('world')
    ]);
    const backup = [...configurationBackups, ...worldBackups].find((entry) => entry.id === backupId);
    if (!backup) {
      throw new Error(`BACKUP_NOT_FOUND: ${backupId}`);
    }
    return backup;
  }

  private failOperation(operationId: string, message: string, error: unknown): void {
    this.operationManagerService.update(operationId, {
      status: 'FAILED',
      percent: 100,
      message,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  private getBackupDirectory(kind: BackupKind): string {
    return join(this.portablePathService.getPortableRoot(), 'backups', kind);
  }

  private getWorldSourcePath(): string {
    return join(this.portablePathService.getPalworldServerRoot(), 'Pal', 'Saved', 'SaveGames');
  }
}

function inferBackupOrigin(name: string): BackupOrigin {
  if (name.includes('.automatic.') || name.includes('.auto.')) {
    return 'automatic';
  }
  if (name.includes('.safety.') || name.includes('.before-')) {
    return 'safety';
  }
  return 'manual';
}

function resolveBackupFormat(
  name: string,
  isDirectory: boolean,
  manifestFormat?: BackupFormat
): BackupFormat {
  if (manifestFormat) {
    return manifestFormat;
  }
  if (name.endsWith('.tar.gz')) {
    return 'tar-gzip';
  }
  return isDirectory ? 'directory' : 'file';
}

function assertConfigurationContent(content: string): void {
  if (!content.includes('OptionSettings=(')) {
    throw new Error('BACKUP_CONFIGURATION_INVALID');
  }
}

async function assertWorldDirectory(path: string): Promise<void> {
  if (!existsSync(path) || (await getDirectorySize(path)) === 0) {
    throw new Error('BACKUP_WORLD_INVALID_OR_EMPTY');
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
      return entry.isFile() ? (await stat(entryPath)).size : 0;
    })
  );
  return sizes.reduce((total, size) => total + size, 0);
}

function createTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}
