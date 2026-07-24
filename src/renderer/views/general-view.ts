import { renderSummaryCard, type SummaryCardDetails } from '../components/summary-card';
import { escapeHtml } from '../utils/text';

export interface GeneralViewModel {
  primaryCards: SummaryCardDetails[];
  supportCards: SummaryCardDetails[];
  networkFreshness: string;
}

export function renderGeneralView(model: GeneralViewModel): string {
  return `
    <div class="view-stack">
      <div class="view-header view-header--contained">
        <h3>General</h3>
        <span class="view-meta-pill">Red: ${escapeHtml(model.networkFreshness)}</span>
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
