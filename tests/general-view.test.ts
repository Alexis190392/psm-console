import { describe, expect, it } from 'vitest';
import { createSummaryCardState } from '../src/renderer/components/summary-card';
import {
  renderGeneralUpdateAction,
  renderGeneralView
} from '../src/renderer/views/general-view';

describe('general view', () => {
  it('renders summary cards and network freshness', () => {
    const html = renderGeneralView({
      networkFreshness: 'verificado hace 1 minuto',
      primaryCards: [
        {
          title: 'Juego local',
          value: '192.168.0.10:8211',
          detail: 'Listo para copiar.',
          target: 'network',
          copyValue: '192.168.0.10:8211',
          ...createSummaryCardState('ok')
        }
      ],
      supportCards: [
        {
          title: 'SteamCMD',
          value: 'Instalado',
          detail: 'Listo.',
          target: 'logs',
          ...createSummaryCardState('ok')
        }
      ]
    });

    expect(html).toContain('Juego local');
    expect(html).toContain('192.168.0.10:8211');
    expect(html).toContain('data-copy-value="192.168.0.10:8211"');
    expect(html).toContain('Red: verificado hace 1 minuto');
    expect(html).toContain('summary-card--prominent');
    expect(html).toContain('summary-card--compact');
  });

  it('updates only the release action without rebuilding the complete view', () => {
    const html = renderGeneralUpdateAction({
      state: 'AVAILABLE',
      currentVersion: '0.11.0',
      latestVersion: '0.11.1',
      releaseUrl: 'https://github.com/example/releases/tag/v0.11.1',
      message: 'Nueva version disponible.',
      checkedAt: '2026-07-24T22:00:00.000Z'
    });

    expect(html).toContain('data-open-release="true"');
    expect(html).toContain('Nueva versión v0.11.1');
    expect(renderGeneralUpdateAction(null)).toBe('');
  });
});
