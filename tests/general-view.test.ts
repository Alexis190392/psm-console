import { describe, expect, it } from 'vitest';
import { createSummaryCardState } from '../src/renderer/components/summary-card';
import {
  createGeneralRemoteApiCard,
  createGeneralServerUpdateCard,
  renderGeneralUpdateAction,
  renderGeneralView,
  shouldRefreshGeneralRemoteApi
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
    expect(html).toContain('view-stack--scroll general-view');
    expect(html).toContain('summary-card--prominent');
    expect(html).toContain('summary-card--compact');
  });

  it('renders the requested General rows in their supplied order', () => {
    const titles = ['Servidor', 'Servidor', 'Juego local', 'Juego publico', 'API web', 'Jugadores'];
    const html = renderGeneralView({
      networkFreshness: 'pendiente',
      primaryCards: titles.map((title, index) => ({
        id: `card-${String(index)}`,
        title,
        value: title,
        detail: title,
        target: 'home',
        ...createSummaryCardState('ok')
      })),
      supportCards: []
    });

    const positions = titles.map((_title, index) => html.indexOf(`id="card-${String(index)}"`));
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
  });

  it('offers the existing safe update action when Steam reports a newer build', () => {
    expect(createGeneralServerUpdateCard({
      status: 'UPDATE_AVAILABLE',
      appId: '2394010',
      localBuildId: '24181105',
      requiredBuildId: '24190000',
      checkedAt: '2026-07-31T12:00:00.000Z',
      message: 'Disponible.'
    })).toEqual(expect.objectContaining({
      title: 'Servidor',
      value: 'Actualizar',
      detail: 'Build 24181105 -> 24190000.',
      action: 'server-update',
      tone: 'warning'
    }));
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

  it('shows a confirmed public web API as a copyable General card', () => {
    const status = {
      state: 'RUNNING',
      settings: {
        passwordConfigured: true,
        client: { passwordConfigured: false }
      },
      connections: [{
        kind: 'PUBLIC',
        label: 'Internet',
        endpoint: 'http://203.0.113.25:8213/api/v1',
        state: 'AVAILABLE',
        message: 'Acceso confirmado.'
      }],
      client: { state: 'DISABLED' }
    } as Parameters<typeof createGeneralRemoteApiCard>[0];

    expect(createGeneralRemoteApiCard(status)).toEqual(expect.objectContaining({
      title: 'API web',
      value: '203.0.113.25:8213/api/v1',
      copyValue: 'http://203.0.113.25:8213/api/v1',
      settingsTab: 'remote-api',
      tone: 'ok'
    }));
    expect(shouldRefreshGeneralRemoteApi(status)).toBe(false);
  });

  it('keeps checking an exposed API until Internet access is confirmed', () => {
    const status = {
      state: 'RUNNING',
      settings: {
        passwordConfigured: true,
        client: { passwordConfigured: false }
      },
      connections: [{
        kind: 'PUBLIC',
        label: 'Internet',
        endpoint: 'http://203.0.113.25:8213/api/v1',
        state: 'UNKNOWN',
        message: 'Verificando.'
      }],
      client: { state: 'DISABLED' }
    } as Parameters<typeof shouldRefreshGeneralRemoteApi>[0];

    expect(createGeneralRemoteApiCard(status)).toEqual(expect.objectContaining({
      value: '203.0.113.25:8213/api/v1',
      tone: 'warning',
      copyValue: 'http://203.0.113.25:8213/api/v1'
    }));
    expect(shouldRefreshGeneralRemoteApi(status)).toBe(true);
  });

  it('always offers API web configuration when no credentials were configured', () => {
    expect(createGeneralRemoteApiCard(null)).toEqual(expect.objectContaining({
      title: 'API web',
      value: 'Configurar API web',
      target: 'settings',
      settingsTab: 'remote-api',
      tone: 'configuration'
    }));
  });

  it('shows the best available local address when Internet is not exposed', () => {
    const status = {
      state: 'RUNNING',
      settings: {
        passwordConfigured: true,
        client: { passwordConfigured: false }
      },
      connections: [
        {
          kind: 'LOOPBACK',
          label: 'Este equipo',
          endpoint: 'http://127.0.0.1:8213/api/v1',
          state: 'AVAILABLE',
          message: 'Disponible.'
        },
        {
          kind: 'PUBLIC',
          label: 'Internet',
          state: 'DISABLED',
          message: 'No expuesta.'
        }
      ],
      client: { state: 'DISABLED' }
    } as Parameters<typeof createGeneralRemoteApiCard>[0];

    expect(createGeneralRemoteApiCard(status)).toEqual(expect.objectContaining({
      value: '127.0.0.1:8213/api/v1',
      copyValue: 'http://127.0.0.1:8213/api/v1',
      tone: 'ok'
    }));
  });
});
