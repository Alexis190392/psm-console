import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
    expect(ipcChannels.firewallDiagnosticProgress).toBe('firewall:diagnostic-progress');
    expect(ipcChannels.firewallCreateRule).toBe('firewall:create-rule');
  });

  it('keeps server maintenance actions behind concrete domain channels', () => {
    expect(ipcChannels.serverUpdate).toBe('server:update');
    expect(ipcChannels.serverRepair).toBe('server:repair');
    expect(ipcChannels.serverRestart).toBe('server:restart');
    expect(ipcChannels.serverRuntimeChanged).toBe('server:runtime-changed');
    expect(ipcChannels.serverGetQueryPortStatus).toBe('server:get-query-port-status');
    expect(ipcChannels.serverStopQueryPortOwner).toBe('server:stop-query-port-owner');
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
    expect(ipcChannels.logsListFiles).toBe('logs:list-files');
    expect(ipcChannels.logsReadFile).toBe('logs:read-file');
  });

  it('keeps idle shutdown policy behind explicit domain channels', () => {
    expect(ipcChannels.serverIdleGetStatus).toBe('server-idle:get-status');
    expect(ipcChannels.serverIdleUpdatePolicy).toBe('server-idle:update-policy');
  });

  it('keeps app process metrics behind a concrete readonly domain channel', () => {
    expect(ipcChannels.appGetProcessMetrics).toBe('app:get-process-metrics');
  });

  it('keeps network diagnostics behind concrete readonly domain channels', () => {
    expect(ipcChannels.networkGetLocalAddresses).toBe('network:get-local-addresses');
    expect(ipcChannels.networkGetPublicAddress).toBe('network:get-public-address');
  });

  it('keeps player monitoring behind a concrete readonly domain channel', () => {
    expect(ipcChannels.playersGetStatus).toBe('players:get-status');
  });

  it('keeps admin actions behind concrete domain channels', () => {
    expect(ipcChannels.adminGetStatus).toBe('admin:get-status');
    expect(ipcChannels.adminExecuteAction).toBe('admin:execute-action');
  });

  it('keeps the shared contract aligned with preload and registered handlers', () => {
    const preloadSource = readFileSync(join(process.cwd(), 'src/main/preload/preload.ts'), 'utf8');
    const handlersSource = readFileSync(join(process.cwd(), 'src/main/ipc/register-ipc-handlers.ts'), 'utf8');

    for (const [key, channel] of Object.entries(ipcChannels)) {
      expect(preloadSource, `${key} falta en preload`).toContain(`${key}: '${channel}'`);
      expect(handlersSource, `${key} no tiene handler`).toContain(`ipcChannels.${key}`);
    }
  });

  it('exposes cancellable maintenance through explicit channels', () => {
    expect(ipcChannels.operationCancel).toBe('operation:cancel');
    expect(ipcChannels.steamCmdRepair).toBe('steamcmd:repair');
  });
});
