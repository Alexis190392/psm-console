import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const rendererMain = readFileSync('src/renderer/main.ts', 'utf8');
const styles = readFileSync('src/renderer/styles.css', 'utf8');
const captureScript = readFileSync('scripts/capture-responsive-screenshots.js', 'utf8');

describe('responsive desktop layout', () => {
  it('uses the Windows medium breakpoint to force compact navigation', () => {
    expect(rendererMain).toContain('const SIDEBAR_COMPACT_BREAKPOINT = 1007');
    expect(rendererMain).toContain("classList.toggle('app--responsive-compact'");
    expect(styles).toContain('#app.app--responsive-compact');
    expect(styles).toContain('app--sidebar-overlay-open');
  });

  it('provides compact width and short window layouts', () => {
    expect(rendererMain).toContain('const SIDEBAR_SMALL_BREAKPOINT = 640');
    expect(rendererMain).toContain('const SHORT_WINDOW_BREAKPOINT = 850');
    expect(styles).toContain('#app.app--responsive-small');
    expect(styles).toContain('@media (max-height: 850px)');
  });

  it('captures portrait half-screen and compact acceptance sizes', () => {
    expect(captureScript).toContain("{ name: 'portrait-half', width: 1080, height: 900 }");
    expect(captureScript).toContain("{ name: 'medium', width: 900, height: 800 }");
    expect(captureScript).toContain("{ name: 'minimum', width: 500, height: 600 }");
  });
});
