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
  adminTab?: string;
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
  const adminTabAttribute = details.adminTab ? ` data-admin-tab="${escapeHtml(details.adminTab)}"` : '';

  return `
    <button${idAttribute} class="summary-card summary-card--${details.tone}" data-target="${details.target}"${adminTabAttribute}${copyAttribute} type="button">
      <span class="summary-card__body">
        <span class="summary-card__title">${escapeHtml(details.title)}</span>
        <strong>${escapeHtml(details.value)}</strong>
        <small>${escapeHtml(details.detail)}</small>
      </span>
      <span class="summary-card__icon" aria-label="${escapeHtml(details.label)}">
        <span class="ui-icon ui-icon--${escapeHtml(details.icon)}" aria-hidden="true"></span>
      </span>
    </button>
  `;
}

export function createSummaryCardState(state: SummaryCardTone): SummaryCardState {
  if (state === 'ok') {
    return { icon: 'check', tone: 'ok', label: 'Correcto' };
  }

  if (state === 'error') {
    return { icon: 'x', tone: 'error', label: 'Incorrecto' };
  }

  if (state === 'warning') {
    return { icon: 'warning', tone: 'warning', label: 'Revisar' };
  }

  if (state === 'loading') {
    return { icon: '', tone: 'loading', label: 'Analizando' };
  }

  if (state === 'configuration') {
    return { icon: 'settings-warning', tone: 'configuration', label: 'Requiere configuracion' };
  }

  return { icon: 'settings', tone: 'optional', label: 'Configuracion opcional' };
}
