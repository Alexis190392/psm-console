import { Injectable } from '@nestjs/common';
import { cp, mkdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import * as tar from 'tar';
import type { BackupFormat } from '../../shared/dto/backup-status.dto';

@Injectable()
export class BackupArchiveService {
  async createWorld(sourcePath: string, targetBasePath: string, compress: boolean): Promise<{
    path: string;
    format: BackupFormat;
  }> {
    await mkdir(dirname(targetBasePath), { recursive: true });
    if (!compress) {
      await cp(sourcePath, targetBasePath, { recursive: true, force: false, errorOnExist: true });
      return { path: targetBasePath, format: 'directory' };
    }

    const archivePath = `${targetBasePath}.tar.gz`;
    await tar.create(
      {
        cwd: dirname(sourcePath),
        file: archivePath,
        gzip: true,
        portable: true
      },
      [basename(sourcePath)]
    );
    return { path: archivePath, format: 'tar-gzip' };
  }

  async stageWorld(backupPath: string, format: BackupFormat, stagingRoot: string): Promise<string> {
    await mkdir(stagingRoot, { recursive: true });
    const stagedPath = join(stagingRoot, 'SaveGames');
    if (format === 'tar-gzip') {
      await tar.extract({
        cwd: stagingRoot,
        file: backupPath,
        strict: true
      });
      return stagedPath;
    }

    await cp(backupPath, stagedPath, { recursive: true, force: false, errorOnExist: true });
    return stagedPath;
  }
}
