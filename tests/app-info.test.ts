import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_INFO, APP_VERSION_LABEL } from '../src/shared/constants/app-info';

describe('app info', () => {
  it('keeps visible version aligned with package version', () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version: string };

    expect(APP_INFO.version).toBe(packageJson.version);
    expect(APP_VERSION_LABEL).toBe(`v${packageJson.version} Dev`);
  });
});
