import { escapeHtml } from '../utils/text';

export interface InlineConfirmAction {
  id: string;
  label: string;
  tone?: 'primary' | 'secondary' | 'warning' | 'danger';
}

export interface InlineConfirmOptions {
  id?: string;
  messageId?: string;
  message: string;
  hidden?: boolean;
  actions: InlineConfirmAction[];
}

export function renderInlineConfirm(options: InlineConfirmOptions): string {
  const idAttribute = options.id ? ` id="${escapeHtml(options.id)}"` : '';
  const hiddenClass = options.hidden ? ' hidden' : '';
  const messageIdAttribute = options.messageId ? ` id="${escapeHtml(options.messageId)}"` : '';

  return `
    <div${idAttribute} class="inline-confirm${hiddenClass}">
      <span${messageIdAttribute}>${escapeHtml(options.message)}</span>
      ${options.actions.map((action) => renderInlineConfirmAction(action)).join('')}
    </div>
  `;
}

function renderInlineConfirmAction(action: InlineConfirmAction): string {
  const className = getActionClassName(action.tone ?? 'secondary');

  return `<button id="${escapeHtml(action.id)}" class="${className}" type="button">${escapeHtml(action.label)}</button>`;
}

function getActionClassName(tone: NonNullable<InlineConfirmAction['tone']>): string {
  if (tone === 'primary') {
    return 'primary-button';
  }

  if (tone === 'warning') {
    return 'primary-button primary-button--warning';
  }

  if (tone === 'danger') {
    return 'primary-button primary-button--danger';
  }

  return 'secondary-button';
}

