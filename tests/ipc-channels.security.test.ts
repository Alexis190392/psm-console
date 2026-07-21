import { describe, expect, it } from 'vitest';
import { ipcChannels } from '../src/shared/contracts/ipc-channels';

describe('IPC channel surface', () => {
  it('does not expose generic command or filesystem channels', () => {
    const channels = Object.values(ipcChannels);

    expect(channels).not.toContain('execute-command');
    expect(channels).not.toContain('filesystem:read');
    expect(channels).not.toContain('filesystem:write');
    expect(channels).not.toContain('powershell:run');
  });

  it('keeps firewall actions behind concrete domain channels', () => {
    expect(ipcChannels.firewallGetStatus).toBe('firewall:get-status');
    expect(ipcChannels.firewallCreateRule).toBe('firewall:create-rule');
  });

  it('keeps server maintenance actions behind concrete domain channels', () => {
    expect(ipcChannels.serverUpdate).toBe('server:update');
  });

  it('keeps backup actions behind concrete domain channels', () => {
    expect(ipcChannels.backupGetSummary).toBe('backup:get-summary');
    expect(ipcChannels.backupCreateConfiguration).toBe('backup:create-configuration');
    expect(ipcChannels.backupCreateWorld).toBe('backup:create-world');
    expect(ipcChannels.backupRestore).toBe('backup:restore');
    expect(ipcChannels.backupDelete).toBe('backup:delete');
  });

  it('keeps log reading behind a concrete readonly domain channel', () => {
    expect(ipcChannels.logsGetRecent).toBe('logs:get-recent');
  });
});
