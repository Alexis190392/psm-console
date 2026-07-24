import { describe, expect, it } from 'vitest';
import { resolveUpdateStatus } from '../src/backend/release-update/release-update.service';

describe('release update status', () => {
  it('detects a newer published release with its executable asset', () => {
    const status = resolveUpdateStatus([
      {
        tag_name: 'v0.11.0',
        name: 'PSM Console v0.11.0',
        html_url: 'https://github.com/Alexis190392/psm-console/releases/tag/v0.11.0',
        draft: false,
        prerelease: true,
        published_at: '2026-07-24T18:00:00.000Z',
        assets: [
          {
            name: 'PSM-Console-v0.11.0.exe',
            browser_download_url: 'https://github.com/Alexis190392/psm-console/releases/download/v0.11.0/PSM-Console-v0.11.0.exe'
          }
        ]
      }
    ], '0.10.9');

    expect(status).toMatchObject({
      state: 'AVAILABLE',
      currentVersion: '0.10.9',
      latestVersion: '0.11.0',
      assetName: 'PSM-Console-v0.11.0.exe'
    });
  });

  it('does not notify when the newest release has the installed version', () => {
    const status = resolveUpdateStatus([
      {
        tag_name: 'v0.10.9',
        name: 'PSM Console v0.10.9',
        html_url: 'https://github.com/Alexis190392/psm-console/releases/tag/v0.10.9',
        draft: false,
        prerelease: true,
        published_at: '2026-07-24T18:00:00.000Z',
        assets: []
      }
    ], '0.10.9');

    expect(status.state).toBe('UP_TO_DATE');
  });

  it('ignores invalid release payloads without exposing an update', () => {
    const status = resolveUpdateStatus([{ tag_name: 'not-a-version' }], '0.10.9');

    expect(status.state).toBe('UP_TO_DATE');
  });
});
