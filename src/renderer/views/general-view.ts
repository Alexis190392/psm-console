import { renderSummaryCard, type SummaryCardDetails } from '../components/summary-card';
import { escapeHtml } from '../utils/text';

export interface GeneralViewModel {
  cards: SummaryCardDetails[];
  networkFreshness: string;
}

export function renderGeneralView(model: GeneralViewModel): string {
  return `
    <div class="view-stack">
      <div class="view-header view-header--contained">
        <div>
          <span class="view-kicker">GENERAL</span>
          <h3>Panel general</h3>
          <p>Estado operativo y accesos.</p>
        </div>
        <span class="view-meta-pill">Red: ${escapeHtml(model.networkFreshness)}</span>
      </div>
      <section class="summary-grid summary-grid--ready">
        ${model.cards.map((card) => renderSummaryCard(card)).join('')}
      </section>
    </div>
  `;
}
