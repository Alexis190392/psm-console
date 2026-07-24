import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type {
  BackupFormat,
  BackupIntegrityState,
  BackupKind,
  BackupOrigin
} from '../../shared/dto/backup-status.dto';

export interface BackupManifest {
  version: 1;
  kind: BackupKind;
  origin: BackupOrigin;
  format: BackupFormat;
  createdAt: string;
  sizeBytes: number;
  sha256: string;
}

export interface BackupIntegrityResult {
  state: BackupIntegrityState;
  message: string;
  manifest?: BackupManifest;
}

@Injectable()
export class BackupIntegrityService {
  private readonly verifiedChecksums = new Map<string, string>();

  async createManifest(
    backupPath: string,
    kind: BackupKind,
    origin: BackupOrigin,
    format: BackupFormat
  ): Promise<BackupManifest> {
    const [sha256, sizeBytes] = await Promise.all([
      calculateBackupHash(backupPath),
      calculateBackupSize(backupPath)
    ]);
    const manifest: BackupManifest = {
      version: 1,
      kind,
      origin,
      format,
      createdAt: new Date().toISOString(),
      sizeBytes,
      sha256
    };
    await writeFile(getManifestPath(backupPath), JSON.stringify(manifest, null, 2), 'utf8');
    this.verifiedChecksums.set(backupPath, manifest.sha256);
    return manifest;
  }

  async inspect(backupPath: string): Promise<BackupIntegrityResult> {
    const manifestPath = getManifestPath(backupPath);
    if (!existsSync(manifestPath)) {
      return {
        state: 'UNVERIFIED',
        message: 'Backup anterior sin manifiesto de integridad.'
      };
    }

    try {
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as BackupManifest;
      if (!isManifest(manifest)) {
        throw new Error('INVALID_BACKUP_MANIFEST');
      }

      if (this.verifiedChecksums.get(backupPath) === manifest.sha256) {
        return {
          state: 'VERIFIED',
          message: 'Integridad SHA-256 verificada en esta sesion.',
          manifest
        };
      }

      return {
        state: 'UNVERIFIED',
        message: 'Manifiesto disponible. Verificacion completa pendiente.',
        manifest
      };
    } catch {
      return {
        state: 'CORRUPTED',
        message: 'El manifiesto de integridad no se puede leer.'
      };
    }
  }

  async verify(backupPath: string): Promise<BackupIntegrityResult> {
    const manifestPath = getManifestPath(backupPath);
    if (!existsSync(manifestPath)) {
      return {
        state: 'UNVERIFIED',
        message: 'Backup anterior sin manifiesto de integridad.'
      };
    }

    try {
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as BackupManifest;
      const [sha256, sizeBytes] = await Promise.all([
        calculateBackupHash(backupPath),
        calculateBackupSize(backupPath)
      ]);
      if (manifest.sha256 !== sha256 || manifest.sizeBytes !== sizeBytes) {
        return {
          state: 'CORRUPTED',
          message: 'El contenido no coincide con su manifiesto SHA-256.',
          manifest
        };
      }

      this.verifiedChecksums.set(backupPath, manifest.sha256);
      return {
        state: 'VERIFIED',
        message: 'Integridad SHA-256 verificada.',
        manifest
      };
    } catch {
      return {
        state: 'CORRUPTED',
        message: 'El manifiesto de integridad no se puede leer.'
      };
    }
  }
}

function isManifest(value: unknown): value is BackupManifest {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const manifest = value as Record<string, unknown>;
  return manifest['version'] === 1 &&
    ['configuration', 'world'].includes(String(manifest['kind'])) &&
    ['manual', 'automatic', 'safety'].includes(String(manifest['origin'])) &&
    ['file', 'directory', 'tar-gzip'].includes(String(manifest['format'])) &&
    typeof manifest['createdAt'] === 'string' &&
    typeof manifest['sha256'] === 'string' &&
    manifest['sha256'].length === 64 &&
    typeof manifest['sizeBytes'] === 'number' &&
    Number.isFinite(manifest['sizeBytes']);
}

export function getManifestPath(backupPath: string): string {
  return `${backupPath}.manifest.json`;
}

async function calculateBackupHash(path: string): Promise<string> {
  const metadata = await stat(path);
  const hash = createHash('sha256');

  if (metadata.isFile()) {
    await appendFileToHash(hash, path);
    return hash.digest('hex');
  }

  const files = await listFiles(path);
  for (const file of files) {
    hash.update(relative(path, file).replaceAll('\\', '/'));
    hash.update('\0');
    await appendFileToHash(hash, file);
    hash.update('\0');
  }
  return hash.digest('hex');
}

async function appendFileToHash(hash: ReturnType<typeof createHash>, path: string): Promise<void> {
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk as Buffer);
  }
}

async function calculateBackupSize(path: string): Promise<number> {
  const metadata = await stat(path);
  if (metadata.isFile()) {
    return metadata.size;
  }

  const files = await listFiles(path);
  const sizes = await Promise.all(files.map(async (file) => (await stat(file)).size));
  return sizes.reduce((total, size) => total + size, 0);
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      const path = join(root, entry.name);
      if (entry.isDirectory()) {
        return listFiles(path);
      }
      return entry.isFile() ? [path] : [];
    })
  );
  return nested.flat().sort((left, right) => left.localeCompare(right));
}
