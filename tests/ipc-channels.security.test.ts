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
});
