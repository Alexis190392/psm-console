import { mkdir, rm, writeFile } from 'node:fs/promises';
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

  it('rotates oversized log files before appending', async () => {
    const logPath = service.getLogPath('manager');
    await mkdir(portablePathService.getLogsRoot(), { recursive: true });
    await writeFile(logPath, 'x'.repeat(5 * 1024 * 1024 + 1));

    await service.write('manager', 'INFO', 'Despues de rotar');

    const recent = await service.readRecent({ modules: ['manager'], maxLines: 20 });

    expect(recent.entries[0]?.lines.join('\n')).toContain('Despues de rotar');
  });
});
