import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const MIN_PORTABLE_SIZE_BYTES = 1024 * 1024;

interface PackageBuildConfig {
  version: string;
  build?: {
    productName?: string;
    directories?: { output?: string };
    win?: { executableName?: string; icon?: string };
    portable?: { artifactName?: string };
  };
}

export interface PortableValidationReport {
  status: 'OK';
  version: string;
  artifactPath: string;
  sizeBytes: number;
  sha256: string;
  validatedAt: string;
  checks: string[];
}

export async function validatePortableArtifact(
  projectRoot: string,
  explicitArtifactPath?: string
): Promise<PortableValidationReport> {
  const packagePath = join(projectRoot, 'package.json');
  const packageConfig = JSON.parse(await readFile(packagePath, 'utf8')) as PackageBuildConfig;
  validateBuildConfiguration(projectRoot, packageConfig);

  const outputDirectory = packageConfig.build?.directories?.output ?? 'release';
  const expectedName = `PalCM-Portable-${packageConfig.version}.exe`;
  const artifactPath = resolve(explicitArtifactPath ?? join(projectRoot, outputDirectory, expectedName));
  if (!existsSync(artifactPath)) {
    throw new Error(`PORTABLE_ARTIFACT_NOT_FOUND: ${artifactPath}`);
  }

  const metadata = await stat(artifactPath);
  if (!metadata.isFile() || metadata.size < MIN_PORTABLE_SIZE_BYTES) {
    throw new Error(`PORTABLE_ARTIFACT_TOO_SMALL: ${String(metadata.size)}`);
  }
  const header = Buffer.alloc(2);
  const stream = createReadStream(artifactPath, { start: 0, end: 1 });
  let offset = 0;
  for await (const chunk of stream) {
    const bytes = chunk as Buffer;
    bytes.copy(header, offset);
    offset += bytes.length;
  }
  if (header.toString('ascii') !== 'MZ') {
    throw new Error('PORTABLE_ARTIFACT_INVALID_PE_HEADER');
  }

  const buildMarkerPath = join(projectRoot, 'dist', 'renderer', 'index.html');
  if (existsSync(buildMarkerPath) && metadata.mtimeMs < (await stat(buildMarkerPath)).mtimeMs) {
    throw new Error('PORTABLE_ARTIFACT_OLDER_THAN_BUILD');
  }

  return {
    status: 'OK',
    version: packageConfig.version,
    artifactPath,
    sizeBytes: metadata.size,
    sha256: await calculateFileHash(artifactPath),
    validatedAt: new Date().toISOString(),
    checks: [
      'electron-builder metadata',
      'versioned artifact name',
      'minimum file size',
      'Windows PE header',
      'artifact newer than renderer build',
      'SHA-256'
    ]
  };
}

function validateBuildConfiguration(projectRoot: string, packageConfig: PackageBuildConfig): void {
  const build = packageConfig.build;
  if (
    build?.productName !== 'PSM Console by GR477' ||
    build.win?.executableName !== 'PSM Console by GR477' ||
    build.portable?.artifactName !== 'PalCM-Portable-${version}.${ext}'
  ) {
    throw new Error('PORTABLE_BUILD_METADATA_INVALID');
  }
  const iconPath = build.win.icon;
  if (!iconPath || !existsSync(join(projectRoot, iconPath))) {
    throw new Error('PORTABLE_ICON_NOT_FOUND');
  }
}

async function calculateFileHash(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest('hex');
}

async function runCli(): Promise<void> {
  const projectRoot = process.cwd();
  const report = await validatePortableArtifact(projectRoot, process.argv[2]);
  const reportPath = join(projectRoot, 'release', `portable-validation-${report.version}.json`);
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
  process.stdout.write(`Portable validado: ${report.artifactPath}\nSHA-256: ${report.sha256}\n`);
}

if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  void runCli().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
