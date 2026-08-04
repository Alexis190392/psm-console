import {
  createSummaryCardState,
  renderSummaryCard,
  type SummaryCardDetails
} from '../components/summary-card';
import type { AppUpdateStatusDto } from '../../shared/dto/app-update-status.dto';
import type { PalworldUpdateStatusDto } from '../../shared/dto/palworld-installation-status.dto';
import type { RemoteApiStatusDto } from '../../shared/dto/remote-api.dto';
import { escapeHtml } from '../utils/text';

export interface GeneralViewModel {
  primaryCards: SummaryCardDetails[];
  supportCards: SummaryCardDetails[];
  networkFreshness: string;
  update?: AppUpdateStatusDto | null;
}

export function renderGeneralView(model: GeneralViewModel): string {
  return `
    <div class="view-stack view-stack--scroll general-view">
      <div class="view-header view-header--contained">
        <h3>General</h3>
        <div class="view-actions">
          <span id="general-update-action">${renderGeneralUpdateAction(model.update)}</span>
          <span class="view-meta-pill">Red: ${escapeHtml(model.networkFreshness)}</span>
        </div>
      </div>
      <section id="general-primary-grid" class="general-primary-grid" aria-label="Estado operativo">
        ${model.primaryCards.map((card) => renderSummaryCard({ ...card, density: 'prominent' })).join('')}
      </section>
      <section class="general-support-strip" aria-label="Componentes y mantenimiento">
        ${model.supportCards.map((card) => renderSummaryCard({ ...card, density: 'compact' })).join('')}
      </section>
    </div>
  `;
}

export function createGeneralRemoteApiCard(status: RemoteApiStatusDto | null): SummaryCardDetails {
  const baseCard = {
    id: 'general-remote-api-card',
    title: 'API web',
    target: 'settings',
    settingsTab: 'remote-api'
  };
  const isConfigured = Boolean(
    status?.settings.passwordConfigured || status?.settings.client.passwordConfigured
  );

  if (!status || !isConfigured) {
    return {
      ...baseCard,
      value: 'Configurar API web',
      detail: 'Configura el acceso administrativo o cliente.',
      ...createSummaryCardState('configuration')
    };
  }

  const isRunning = status.state === 'RUNNING' || status.client.state === 'RUNNING';
  if (!isRunning) {
    const hasError = status.state === 'ERROR' || status.client.state === 'ERROR';
    const isStarting = status.state === 'STARTING' || status.client.state === 'STARTING';
    return {
      ...baseCard,
      value: hasError ? 'Revisar API web' : isStarting ? 'Iniciando' : 'Deshabilitada',
      detail: hasError
        ? 'La API no pudo iniciar. Revisa su configuracion.'
        : isStarting
          ? 'Preparando el acceso web configurado.'
          : 'La configuracion esta guardada, pero el acceso web esta deshabilitado.',
      ...createSummaryCardState(hasError ? 'error' : isStarting ? 'loading' : 'optional')
    };
  }

  const connection = selectRemoteApiConnection(status);
  if (!connection?.endpoint) {
    return {
      ...baseCard,
      value: 'En ejecucion',
      detail: 'La API esta activa. Abre su configuracion para revisar las direcciones.',
      ...createSummaryCardState('warning')
    };
  }

  const state = connection.state === 'AVAILABLE'
    ? createSummaryCardState('ok')
    : connection.state === 'CHECKING'
      ? createSummaryCardState('loading')
      : createSummaryCardState(connection.state === 'UNAVAILABLE' ? 'error' : 'warning');

  return {
    ...baseCard,
    value: connection.endpoint.replace(/^https?:\/\//, ''),
    detail: connection.state === 'AVAILABLE'
      ? `${connection.label === 'Internet' ? 'Acceso publico' : `Acceso ${connection.label.toLocaleLowerCase()}`} confirmado. Click para copiar la direccion web.`
      : connection.message,
    copyValue: connection.endpoint,
    ...state
  };
}

export function renderGeneralRemoteApiCard(status: RemoteApiStatusDto | null): string {
  return renderSummaryCard({ ...createGeneralRemoteApiCard(status), density: 'prominent' });
}

export function createGeneralServerUpdateCard(status: PalworldUpdateStatusDto | null): SummaryCardDetails {
  const base = {
    id: 'general-server-update-card',
    title: 'Servidor',
    target: 'server'
  };

  if (!status) {
    return {
      ...base,
      value: 'Verificando',
      detail: 'Consultando la version instalada y la publicada por Steam.',
      ...createSummaryCardState('loading')
    };
  }

  if (status.status === 'UPDATE_AVAILABLE') {
    return {
      ...base,
      value: 'Actualizar',
      detail: status.requiredBuildId
        ? `Build ${status.localBuildId ?? 'actual'} -> ${status.requiredBuildId}.`
        : `Build ${status.localBuildId ?? 'actual'}. Hay una actualizacion disponible.`,
      action: 'server-update',
      ...createSummaryCardState('warning')
    };
  }

  if (status.status === 'UP_TO_DATE') {
    return {
      ...base,
      value: 'Actualizado',
      detail: status.localBuildId ? `Build ${status.localBuildId}.` : status.message,
      ...createSummaryCardState('ok')
    };
  }

  return {
    ...base,
    value: status.status === 'NOT_INSTALLED' ? 'No instalado' : 'Sin verificar',
    detail: status.message,
    ...createSummaryCardState(status.status === 'NOT_INSTALLED' ? 'configuration' : 'optional')
  };
}

export function shouldRefreshGeneralRemoteApi(status: RemoteApiStatusDto | null): boolean {
  const apiRunning = status?.state === 'RUNNING' || status?.client.state === 'RUNNING';
  const publicConnection = status?.connections.find((connection) => connection.kind === 'PUBLIC');
  return Boolean(apiRunning && publicConnection && publicConnection.state !== 'AVAILABLE' && publicConnection.state !== 'DISABLED');
}

function selectRemoteApiConnection(status: RemoteApiStatusDto) {
  const priority = ['PUBLIC', 'LAN', 'LOOPBACK'] as const;
  return priority
    .map((kind) => status.connections.find((connection) => connection.kind === kind))
    .find((connection) => connection?.endpoint && connection.state !== 'DISABLED');
}

export function renderGeneralUpdateAction(update?: AppUpdateStatusDto | null): string {
  return update?.state === 'AVAILABLE' && update.latestVersion
    ? `<button class="view-meta-pill view-meta-pill--update" type="button" data-open-release="true">Nueva versión v${escapeHtml(update.latestVersion)}</button>`
    : '';
}
