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
          createdAt: '2026-07-20T12:00:00.000Z',
          origin: 'manual',
          format: 'file',
          integrity: 'VERIFIED',
          integrityMessage: 'Integridad verificada.'
        }
      ],
      worldBackups: [],
      policy: {
        automaticEnabled: false,
        automaticIntervalHours: 24,
        automaticRetentionPerType: 10,
        compressWorldBackups: false
      },
      totalSizeBytes: 2048,
      verifiedBackups: 1,
      corruptedBackups: 0,
      message: 'Backups disponibles.'
    };

    const html = renderBackupsView(summary);

    expect(html).toContain('Backups');
    expect(html).toContain('D:\\Pal\\PalWorldSettings.ini');
    expect(html).toContain('config-1.ini');
    expect(html).toContain('2.0 KB');
    expect(html).toContain('id="backup-policy-form"');
    expect(html).toContain('name="automaticIntervalHours"');
    expect(html).toContain('name="automaticRetentionPerType"');
    expect(html).toContain('Verificado');
    expect(html).toContain('data-backup-select="configuration:config-1.ini"');
    expect(html).toContain('class="backup-select__box"');
    expect(html).not.toContain('id="delete-selected-backups"');
    expect(html).not.toContain('<span>Seleccionar</span>');
    expect(html).toContain('data-backup-filter="configuration"');
    expect(html).toContain('data-backup-kind="configuration"');
    expect(html).toContain('backup-item__kind">INI');
    expect(html).not.toContain('Todavia no hay backups de este tipo.');
  });
});
