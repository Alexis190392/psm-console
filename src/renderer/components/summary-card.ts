import { escapeHtml } from '../utils/text';

export type SummaryCardTone = 'ok' | 'error' | 'warning' | 'optional' | 'loading' | 'configuration';

export interface SummaryCardState {
  icon: string;
  tone: string;
  label: string;
}

export interface SummaryCardDetails extends SummaryCardState {
  id?: string;
  title: string;
  value: string;
  detail: string;
  target: string;
  copyValue?: string;
}

export interface SummaryCardViewModel {
  value: string;
  detail: string;
  state: SummaryCardState;
  copyValue?: string;
}

export function renderSummaryCard(details: SummaryCardDetails): string {
  const idAttribute = details.id ? ` id="${escapeHtml(details.id)}"` : '';
  const copyAttribute = details.copyValue ? ` data-copy-value="${escapeHtml(details.copyValue)}"` : '';

  return `
    <button${idAttribute} class="summary-card summary-card--${details.tone}" data-target="${details.target}"${copyAttribute} type="button">
      <span class="summary-card__body">
        <span class="summary-card__title">${escapeHtml(details.title)}</span>
        <strong>${escapeHtml(details.value)}</strong>
        <small>${escapeHtml(details.detail)}</small>
      </span>
      <span class="summary-card__icon" aria-label="${escapeHtml(details.label)}">${details.icon}</span>
    </button>
  `;
}

export function createSummaryCardState(state: SummaryCardTone): SummaryCardState {
  if (state === 'ok') {
    return { icon: '&#10003;', tone: 'ok', label: 'Correcto' };
  }

  if (state === 'error') {
    return { icon: '&times;', tone: 'error', label: 'Incorrecto' };
  }

  if (state === 'warning') {
    return { icon: '!', tone: 'warning', label: 'Revisar' };
  }

  if (state === 'loading') {
    return { icon: '', tone: 'loading', label: 'Analizando' };
  }

  if (state === 'configuration') {
    return { icon: '&#9881;!', tone: 'configuration', label: 'Requiere configuracion' };
  }

  return { icon: '&#9881;', tone: 'optional', label: 'Configuracion opcional' };
}
