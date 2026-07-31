import { describe, expect, it } from 'vitest';
import { createSummaryCardState, renderSummaryCard } from '../src/renderer/components/summary-card';

describe('summary card renderer', () => {
  it('renders escaped text and copy metadata', () => {
    const html = renderSummaryCard({
      id: 'card-1',
      title: 'Juego <local>',
      value: '192.168.0.10:8211',
      detail: 'Click para copiar',
      target: 'network',
      copyValue: '192.168.0.10:8211',
      ...createSummaryCardState('ok')
    });

    expect(html).toContain('id="card-1"');
    expect(html).toContain('data-target="network"');
    expect(html).toContain('data-copy-value="192.168.0.10:8211"');
    expect(html).toContain('Juego &lt;local&gt;');
    expect(html).toContain('summary-card--ok');
  });

  it('renders an informational card without navigation when disabled', () => {
    const html = renderSummaryCard({
      title: 'Jugadores',
      value: 'Servidor detenido',
      detail: 'Inicia el servidor para consultar jugadores.',
      disabled: true,
      ...createSummaryCardState('optional')
    });

    expect(html).toContain('disabled aria-disabled="true"');
    expect(html).not.toContain('data-target=');
  });
});
