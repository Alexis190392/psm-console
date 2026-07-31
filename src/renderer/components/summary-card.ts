import { escapeHtml } from '../utils/text';
import { renderIcon } from './icon';

export type SummaryCardTone = 'ok' | 'error' | 'warning' | 'optional' | 'loading' | 'configuration';

export interface SummaryCardState {
  icon: string;
  tone: string;
  label: string;
}

export interface SummaryCardDetails extends SummaryCardState {
  id?: string;
  density?: 'compact' | 'prominent';
  title: string;
  value: string;
  detail: string;
  target?: string;
  disabled?: boolean;
  adminTab?: string;
  settingsTab?: string;
  copyValue?: string;
  action?: 'server-update';
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
  const settingsTabAttribute = details.settingsTab ? ` data-settings-tab="${escapeHtml(details.settingsTab)}"` : '';
  const actionAttribute = details.action ? ` data-summary-action="${escapeHtml(details.action)}"` : '';
  const targetAttribute = details.target ? ` data-target="${escapeHtml(details.target)}"` : '';
  const disabledAttribute = details.disabled ? ' disabled aria-disabled="true"' : '';
  const canOpenTargetFromIcon = Boolean(
    details.copyValue && ['warning', 'configuration', 'error'].includes(details.tone)
  );
  const iconClass = `summary-card__icon${canOpenTargetFromIcon ? ' summary-card__icon--action' : ''}`;
  const iconTitle = canOpenTargetFromIcon ? 'Revisar detalle' : details.label;
  const densityClass = details.density ? ` summary-card--${details.density}` : '';

  return `
    <button${idAttribute} class="summary-card summary-card--${details.tone}${densityClass}"${targetAttribute}${adminTabAttribute}${settingsTabAttribute}${copyAttribute}${actionAttribute}${disabledAttribute} type="button">
      <span class="summary-card__body">
        <span class="summary-card__title">${escapeHtml(details.title)}</span>
        <strong>${escapeHtml(details.value)}</strong>
        <small title="${escapeHtml(details.detail)}">${escapeHtml(details.detail)}</small>
      </span>
      <span class="${iconClass}" aria-label="${escapeHtml(iconTitle)}" title="${escapeHtml(iconTitle)}" data-summary-icon="${canOpenTargetFromIcon ? 'target' : 'state'}">
        ${renderIcon(details.icon)}
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
