import { escapeHtml } from '../utils/text';

export function renderIcon(name: string, extraClass = ''): string {
  const className = `ui-icon ui-icon--${name}${extraClass ? ` ${extraClass}` : ''}`;

  return `<span class="${escapeHtml(className)}" aria-hidden="true"></span>`;
}
