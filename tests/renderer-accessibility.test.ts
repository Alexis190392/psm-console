import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('renderer accessibility baseline', () => {
  const mainSource = readFileSync(join(process.cwd(), 'src', 'renderer', 'main.ts'), 'utf8');
  const styles = readFileSync(join(process.cwd(), 'src', 'renderer', 'styles.css'), 'utf8');

  it('provides keyboard navigation and announces view changes', () => {
    expect(mainSource).toContain('class="skip-link"');
    expect(mainSource).toContain('id="content-view" class="content-view hidden" role="main" tabindex="-1"');
    expect(mainSource).toContain('id="view-announcer"');
    expect(mainSource).toContain("link.setAttribute('aria-current', 'page')");
    expect(mainSource).toContain("event.key !== 'Escape'");
  });

  it('keeps focus visible and follows Windows motion and contrast preferences', () => {
    expect(styles).toContain(':focus-visible');
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(styles).toContain('@media (forced-colors: active)');
  });

  it('moves focus into confirmations and restores it when they close', () => {
    expect(mainSource).toContain("appFooter.setAttribute('role', 'alertdialog')");
    expect(mainSource).toContain('confirmationReturnFocus?.focus');
    expect(mainSource).toContain('closeActiveFooterConfirmation()');
    expect(mainSource).toContain("role=\"alertdialog\"");
    expect(mainSource).toContain('inlineConfirmationReturnFocus?.focus');
  });
});
