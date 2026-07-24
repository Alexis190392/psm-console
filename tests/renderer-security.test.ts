import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('renderer security policy', () => {
  const htmlSource = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8');
  const mainSource = readFileSync(join(process.cwd(), 'src/main/electron/main.ts'), 'utf8');

  it('serves a restrictive Content Security Policy without unsafe script evaluation', () => {
    expect(mainSource).toContain("'content-security-policy': RENDERER_CSP");
    expect(mainSource).toContain("\"default-src 'self'\"");
    expect(mainSource).toContain("\"script-src 'self'\"");
    expect(mainSource).toContain("\"object-src 'none'\"");
    expect(mainSource).toContain("\"frame-ancestors 'none'\"");
    expect(mainSource).not.toContain("'unsafe-eval'");
  });

  it('does not load remote scripts, styles or fonts', () => {
    expect(htmlSource).not.toMatch(/(?:src|href)=["']https?:\/\//i);
  });
});
