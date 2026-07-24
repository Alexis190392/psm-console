import { renderSummaryCard, type SummaryCardDetails } from '../components/summary-card';
import type { AppUpdateStatusDto } from '../../shared/dto/app-update-status.dto';
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
          ${model.update?.state === 'AVAILABLE' && model.update.latestVersion
            ? `<button class="view-meta-pill view-meta-pill--update" type="button" data-open-release="true">Nueva versión v${escapeHtml(model.update.latestVersion)}</button>`
            : ''}
          <span class="view-meta-pill">Red: ${escapeHtml(model.networkFreshness)}</span>
        </div>
      </div>
      <section class="general-primary-grid" aria-label="Estado operativo">
        ${model.primaryCards.map((card) => renderSummaryCard({ ...card, density: 'prominent' })).join('')}
      </section>
      <section class="general-support-strip" aria-label="Componentes y mantenimiento">
        ${model.supportCards.map((card) => renderSummaryCard({ ...card, density: 'compact' })).join('')}
      </section>
    </div>
  `;
}
