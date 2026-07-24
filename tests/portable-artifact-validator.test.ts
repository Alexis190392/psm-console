import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { validatePortableArtifact } from '../src/tools/portable-artifact-validator';

describe('portable artifact validator', () => {
  const projectRoot = join(process.cwd(), '.tmp-tests', 'portable-validator');
  const version = '0.10.2';
  const artifactPath = join(projectRoot, 'release', `PalCM-Portable-${version}.exe`);

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('validates the versioned Windows artifact and returns its hash', async () => {
    await prepareProjectFixture();
    const artifact = Buffer.alloc(1024 * 1024, 0);
    artifact.write('MZ', 0, 'ascii');
    await writeFile(artifactPath, artifact);

    const report = await validatePortableArtifact(projectRoot);

    expect(report.status).toBe('OK');
    expect(report.version).toBe(version);
    expect(report.artifactPath).toBe(artifactPath);
    expect(report.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects a file without a Windows PE header', async () => {
    await prepareProjectFixture();
    await writeFile(artifactPath, Buffer.alloc(1024 * 1024, 0));

    await expect(validatePortableArtifact(projectRoot)).rejects.toThrow('PORTABLE_ARTIFACT_INVALID_PE_HEADER');
  });

  async function prepareProjectFixture(): Promise<void> {
    await mkdir(join(projectRoot, 'build'), { recursive: true });
    await mkdir(join(projectRoot, 'dist', 'renderer'), { recursive: true });
    await mkdir(join(projectRoot, 'release'), { recursive: true });
    await writeFile(join(projectRoot, 'build', 'palcm-logo.ico'), 'icon');
    await writeFile(join(projectRoot, 'dist', 'renderer', 'index.html'), '<html></html>');
    await writeFile(
      join(projectRoot, 'package.json'),
      JSON.stringify({
        version,
        build: {
          productName: 'PSM Console by GR477',
          directories: { output: 'release' },
          win: {
            executableName: 'PSM Console by GR477',
            icon: 'build/palcm-logo.ico'
          },
          portable: {
            artifactName: 'PalCM-Portable-${version}.${ext}'
          }
        }
      })
    );
  }
});
