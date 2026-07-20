import type { AllowedActionsDto } from '../../shared/dto/allowed-actions.dto';
import type { ApplicationStatus } from '../../shared/enums/application-status';
import { escapeHtml } from '../utils/text';

export function renderPreflightSummaryView(status: ApplicationStatus, actions: AllowedActionsDto | null): string {
  return `
    <div class="view-stack">
      <section class="summary-grid">
        <article class="summary-item">
          <span>Estado</span>
          <strong>${escapeHtml(status)}</strong>
        </article>
        <article class="summary-item">
          <span>Configuracion</span>
          <strong>${actions?.canEditConfiguration ? 'Disponible' : 'Bloqueada'}</strong>
        </article>
        <article class="summary-item">
          <span>Servidor</span>
          <strong>${actions?.canStartServer ? 'Listo para iniciar' : 'Pendiente'}</strong>
        </article>
      </section>
    </div>
  `;
}

export function renderSimpleView(title: string, message: string): string {
  return `
    <div class="view-stack">
      <div class="view-header">
        <div>
          <span class="view-kicker">${escapeHtml(title.toUpperCase())}</span>
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(message)}</p>
        </div>
      </div>
    </div>
  `;
}

