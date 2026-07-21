import { describe, expect, it } from 'vitest';
import type { BackupSummaryDto } from '../src/shared/dto/backup-status.dto';
import { renderBackupsView } from '../src/renderer/views/backups-view';

describe('backups view', () => {
  it('renders backup sources and existing backup rows', () => {
    const summary: BackupSummaryDto = {
      configurationSourcePath: 'D:\\Pal\\PalWorldSettings.ini',
      worldSourcePath: 'D:\\Pal\\SaveGames',
      configurationBackups: [
        {
          id: 'configuration:config-1.ini',
          kind: 'configuration',
          name: 'config-1.ini',
          path: 'D:\\backups\\config-1.ini',
          sizeBytes: 2048,
          createdAt: '2026-07-20T12:00:00.000Z'
        }
      ],
      worldBackups: [],
      message: 'Backups disponibles.'
    };

    const html = renderBackupsView(summary);

    expect(html).toContain('Backups del servidor');
    expect(html).toContain('D:\\Pal\\PalWorldSettings.ini');
    expect(html).toContain('config-1.ini');
    expect(html).toContain('2.0 KB');
    expect(html).toContain('data-backup-delete="configuration:config-1.ini"');
    expect(html).toContain('Todavia no hay backups de este tipo.');
  });
});
