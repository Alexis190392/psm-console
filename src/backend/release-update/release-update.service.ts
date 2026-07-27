import { Injectable } from '@nestjs/common';
import { get } from 'node:https';
import { APP_INFO } from '../../shared/constants/app-info';
import type { AppUpdateStatusDto } from '../../shared/dto/app-update-status.dto';

const RELEASES_API_URL = 'https://api.github.com/repos/Alexis190392/psm-console/releases?per_page=20';
const UPDATE_CACHE_MS = 15 * 60 * 1000;
const UPDATE_REQUEST_TIMEOUT_MS = 2_500;

interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface GitHubRelease {
  tag_name: string;
  name: string | null;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  assets: GitHubReleaseAsset[];
}

let updateCache: { expiresAt: number; status: AppUpdateStatusDto } | null = null;

@Injectable()
export class ReleaseUpdateService {
  async getStatus(): Promise<AppUpdateStatusDto> {
    if (updateCache && updateCache.expiresAt > Date.now()) {
      return updateCache.status;
    }

    try {
      const releases = await getGitHubReleases();
      const status = resolveUpdateStatus(releases, APP_INFO.version);
      updateCache = {
        status,
        expiresAt: Date.now() + UPDATE_CACHE_MS
      };
      return status;
    } catch {
      return {
        state: 'UNAVAILABLE',
        currentVersion: APP_INFO.version,
        message: 'No se pudo consultar actualizaciones. Se reintentará más tarde.',
        checkedAt: new Date().toISOString()
      };
    }
  }

  async getReleaseUrl(): Promise<string> {
    const status = await this.getStatus();

    if (status.state !== 'AVAILABLE' || !status.releaseUrl) {
      throw new Error('APP_UPDATE_NOT_AVAILABLE');
    }

    return status.releaseUrl;
  }
}

export function resolveUpdateStatus(releases: unknown, currentVersion: string): AppUpdateStatusDto {
  const checkedAt = new Date().toISOString();
  const current = parseVersion(currentVersion);

  if (!current) {
    return {
      state: 'UNAVAILABLE',
      currentVersion,
      message: 'La versión instalada no tiene un formato válido para comprobar actualizaciones.',
      checkedAt
    };
  }

  const latest = parseGitHubReleases(releases)
    .filter((release) => !release.draft)
    .map((release) => ({ release, version: parseVersion(release.tag_name) }))
    .filter((candidate): candidate is { release: GitHubRelease; version: number[] } => candidate.version !== null)
    .sort((left, right) => compareVersions(right.version, left.version))[0];

  if (!latest || compareVersions(latest.version, current) <= 0) {
    return {
      state: 'UP_TO_DATE',
      currentVersion,
      message: 'PSM Console está actualizado.',
      checkedAt
    };
  }

  const asset = latest.release.assets.find((candidate) => candidate.name.toLowerCase().endsWith('.exe'));

  return {
    state: 'AVAILABLE',
    currentVersion,
    latestVersion: latest.release.tag_name.replace(/^v/i, ''),
    releaseName: latest.release.name ?? `PSM Console ${latest.release.tag_name}`,
    releaseUrl: latest.release.html_url,
    ...(asset ? { assetName: asset.name, assetUrl: asset.browser_download_url } : {}),
    ...(latest.release.published_at ? { publishedAt: latest.release.published_at } : {}),
    message: `Hay una nueva versión disponible: ${latest.release.tag_name}.`,
    checkedAt
  };
}

async function getGitHubReleases(): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = get(RELEASES_API_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'PSM-Console'
      },
      timeout: UPDATE_REQUEST_TIMEOUT_MS
    }, (response) => {
      let body = '';

      if ((response.statusCode ?? 500) >= 400) {
        response.resume();
        reject(new Error(`GITHUB_RELEASES_HTTP_${String(response.statusCode)}`));
        return;
      }

      response.setEncoding('utf8');
      response.on('data', (chunk: string) => {
        body += chunk;
      });
      response.on('end', () => {
        try {
          resolve(JSON.parse(body) as unknown);
        } catch {
          reject(new Error('GITHUB_RELEASES_INVALID_RESPONSE'));
        }
      });
    });

    request.on('timeout', () => {
      request.destroy(new Error('GITHUB_RELEASES_TIMEOUT'));
    });
    request.on('error', reject);
  });
}

function parseGitHubReleases(value: unknown): GitHubRelease[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isGitHubRelease);
}

function isGitHubRelease(value: unknown): value is GitHubRelease {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<GitHubRelease>;
  return typeof candidate.tag_name === 'string' &&
    typeof candidate.html_url === 'string' &&
    typeof candidate.draft === 'boolean' &&
    typeof candidate.prerelease === 'boolean' &&
    Array.isArray(candidate.assets) &&
    candidate.assets.every(isGitHubReleaseAsset);
}

function isGitHubReleaseAsset(value: unknown): value is GitHubReleaseAsset {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<GitHubReleaseAsset>;
  return typeof candidate.name === 'string' && typeof candidate.browser_download_url === 'string';
}

function parseVersion(value: string): number[] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());

  return match ? match.slice(1).map(Number) : null;
}

function compareVersions(left: number[], right: number[]): number {
  for (let index = 0; index < 3; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}
