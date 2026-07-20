import { describe, expect, it } from 'vitest';
import { ApplicationStatus } from '../src/shared/enums/application-status';
import { renderPreflightSummaryView, renderSimpleView } from '../src/renderer/views/status-views';

describe('status views', () => {
  it('renders preflight status from allowed actions', () => {
    const html = renderPreflightSummaryView(ApplicationStatus.SERVER_MISSING, {
      canInstallSteamCmd: false,
      canInstallServer: true,
      canEditConfiguration: false,
      canManageFirewall: false,
      canStartServer: false,
      canStopServer: false,
      canCreateBackup: false,
      canRestoreBackup: false
    });

    expect(html).toContain('SERVER_MISSING');
    expect(html).toContain('Bloqueada');
    expect(html).toContain('Pendiente');
  });

  it('escapes simple view text', () => {
    const html = renderSimpleView('<Logs>', '<script>');

    expect(html).toContain('&lt;LOGS&gt;');
    expect(html).toContain('&lt;script&gt;');
  });
});

