import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LoggingService } from '../src/backend/logging/logging.service';
import { PortablePathService } from '../src/backend/portable-path/portable-path.service';

describe('LoggingService', () => {
  const portableRoot = join(process.cwd(), '.tmp-tests', 'logging-service');
  const portablePathService = new PortablePathService({
    isPackaged: true,
    getPath: () => join(portableRoot, 'PalCM.exe')
  });
  const service = new LoggingService(portablePathService);

  afterEach(async () => {
    await rm(portableRoot, { recursive: true, force: true });
  });

  it('writes and reads recent portable logs', async () => {
    await service.write('manager', 'INFO', 'Inicio correcto');
    await service.write('backup', 'WARN', 'Backup grande');

    const recent = await service.readRecent({ modules: ['manager', 'backup'], maxLines: 20 });

    expect(recent.entries).toHaveLength(2);
    expect(recent.entries[0]?.lines.join('\n')).toContain('[INFO] [manager] Inicio correcto');
    expect(recent.entries[1]?.lines.join('\n')).toContain('[WARN] [backup] Backup grande');
  });

  it('redacts sensitive tokens in log messages', async () => {
    await service.write('manager', 'ERROR', 'token=abc123 password:secret');

    const recent = await service.readRecent({ modules: ['manager'], maxLines: 20 });

    expect(recent.entries[0]?.lines.join('\n')).toContain('token=<redacted>');
    expect(recent.entries[0]?.lines.join('\n')).toContain('password=<redacted>');
  });

  it('only returns logs from the current app session', async () => {
    const logPath = service.getLogPath('manager');
    await mkdir(portablePathService.getLogsRoot(), { recursive: true });
    await writeFile(logPath, '[2000-01-01 00:00:00] [INFO] [manager] Entrada vieja\n', 'utf8');

    await service.write('manager', 'INFO', 'Entrada de esta sesion');

    const recent = await service.readRecent({ modules: ['manager'], maxLines: 20 });
    const lines = recent.entries[0]?.lines.join('\n') ?? '';

    expect(lines).not.toContain('Entrada vieja');
    expect(lines).toContain('Entrada de esta sesion');
  });

  it('rotates oversized log files before appending', async () => {
    const logPath = service.getLogPath('manager');
    await mkdir(portablePathService.getLogsRoot(), { recursive: true });
    await writeFile(logPath, 'x'.repeat(5 * 1024 * 1024 + 1));

    await service.write('manager', 'INFO', 'Despues de rotar');

    const recent = await service.readRecent({ modules: ['manager'], maxLines: 20 });

    expect(recent.entries[0]?.lines.join('\n')).toContain('Despues de rotar');
  });

  it('keeps at most ten log files per module after rotation', async () => {
    const logPath = service.getLogPath('manager');
    await mkdir(portablePathService.getLogsRoot(), { recursive: true });
    await writeFile(logPath, 'x'.repeat(5 * 1024 * 1024 + 1));

    await Promise.all(
      Array.from({ length: 9 }, (_, index) => {
        const rotationIndex = String(index + 1);

        return writeFile(`${logPath}.${rotationIndex}`, `rotated ${rotationIndex}`);
      })
    );

    await service.write('manager', 'INFO', 'Nueva linea');

    const logFiles = (await readdir(portablePathService.getLogsRoot())).filter((fileName) => fileName.startsWith('manager.log'));

    expect(logFiles).toHaveLength(10);
    expect(logFiles).not.toContain('manager.log.10');
  });
});
