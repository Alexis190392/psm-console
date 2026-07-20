import { describe, expect, it } from 'vitest';
import { renderInlineConfirm } from '../src/renderer/components/inline-confirm';

describe('inline confirm component', () => {
  it('renders escaped message and button tones', () => {
    const html = renderInlineConfirm({
      id: 'danger-confirm',
      message: 'Salir <sin guardar>',
      hidden: true,
      actions: [
        { id: 'stay', label: 'Seguir', tone: 'secondary' },
        { id: 'leave', label: 'Salir', tone: 'danger' }
      ]
    });

    expect(html).toContain('id="danger-confirm"');
    expect(html).toContain('inline-confirm hidden');
    expect(html).toContain('Salir &lt;sin guardar&gt;');
    expect(html).toContain('id="leave"');
    expect(html).toContain('primary-button--danger');
  });
});

