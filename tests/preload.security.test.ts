import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('sandboxed preload', () => {
  it('does not import runtime modules from shared code', () => {
    const source = readFileSync(join(process.cwd(), 'src/main/preload/preload.ts'), 'utf8');

    expect(source).not.toContain("from '../../shared/contracts");
  });
});
