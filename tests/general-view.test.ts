import { describe, expect, it } from 'vitest';
import { createSummaryCardState } from '../src/renderer/components/summary-card';
import { renderGeneralView } from '../src/renderer/views/general-view';

describe('general view', () => {
  it('renders summary cards and network freshness', () => {
    const html = renderGeneralView({
      networkFreshness: 'verificado hace 1 minuto',
      cards: [
        {
          title: 'Juego local',
          value: '192.168.0.10:8211',
          detail: 'Listo para copiar.',
          target: 'network',
          copyValue: '192.168.0.10:8211',
          ...createSummaryCardState('ok')
        }
      ]
    });

    expect(html).toContain('Juego local');
    expect(html).toContain('192.168.0.10:8211');
    expect(html).toContain('data-copy-value="192.168.0.10:8211"');
    expect(html).toContain('Red: verificado hace 1 minuto');
  });
});
