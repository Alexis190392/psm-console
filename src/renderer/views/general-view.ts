import { renderSummaryCard, type SummaryCardDetails } from '../components/summary-card';
import { escapeHtml } from '../utils/text';

export interface GeneralViewModel {
  cards: SummaryCardDetails[];
  networkFreshness: string;
}

export function renderGeneralView(model: GeneralViewModel): string {
  return `
    <div class="view-stack">
      <section class="summary-grid summary-grid--ready">
        ${model.cards.map((card) => renderSummaryCard(card)).join('')}
      </section>
      <p class="view-note">Red y firewall: ${escapeHtml(model.networkFreshness)}.</p>
    </div>
  `;
}
