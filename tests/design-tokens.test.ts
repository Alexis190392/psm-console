import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('renderer design tokens', () => {
  it('keeps base theme tokens in the design-system folder', () => {
    const tokens = readFileSync(join(process.cwd(), 'src', 'renderer', 'design-system', 'tokens.css'), 'utf8');
    const styles = readFileSync(join(process.cwd(), 'src', 'renderer', 'styles.css'), 'utf8');

    expect(tokens).toContain('--color-background: #070a0f');
    expect(tokens).toContain('--color-primary: #08d9e8');
    expect(tokens).toContain('--color-accent: #ff2b7f');
    expect(tokens).toContain('--sidebar-width: 276px');
    expect(styles.startsWith('@import "./design-system/tokens.css";')).toBe(true);
  });
});
