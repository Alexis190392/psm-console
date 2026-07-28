import {
  createSummaryCardState,
  renderSummaryCard,
  type SummaryCardDetails
} from '../components/summary-card';
import type { AppUpdateStatusDto } from '../../shared/dto/app-update-status.dto';
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
    <div class="view-stack">
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

export function createGeneralRemoteApiCard(status: RemoteApiStatusDto | null): SummaryCardDetails | null {
  const publicConnection = status?.connections.find((connection) => connection.kind === 'PUBLIC');
  if (publicConnection?.state !== 'AVAILABLE' || !publicConnection.endpoint) {
    return null;
  }

  return {
    id: 'general-remote-api-card',
    title: 'API web',
    value: publicConnection.endpoint.replace(/^https?:\/\//, ''),
    detail: 'Acceso publico confirmado. Click para copiar la direccion web.',
    target: 'settings',
    copyValue: publicConnection.endpoint,
    ...createSummaryCardState('ok')
  };
}

export function renderGeneralRemoteApiCard(status: RemoteApiStatusDto | null): string {
  const card = createGeneralRemoteApiCard(status);
  return card ? renderSummaryCard({ ...card, density: 'prominent' }) : '';
}

export function shouldRefreshGeneralRemoteApi(status: RemoteApiStatusDto | null): boolean {
  const apiRunning = status?.state === 'RUNNING' || status?.client.state === 'RUNNING';
  const publicConnection = status?.connections.find((connection) => connection.kind === 'PUBLIC');
  return Boolean(apiRunning && publicConnection && publicConnection.state !== 'AVAILABLE' && publicConnection.state !== 'DISABLED');
}

export function renderGeneralUpdateAction(update?: AppUpdateStatusDto | null): string {
  return update?.state === 'AVAILABLE' && update.latestVersion
    ? `<button class="view-meta-pill view-meta-pill--update" type="button" data-open-release="true">Nueva versión v${escapeHtml(update.latestVersion)}</button>`
    : '';
}
