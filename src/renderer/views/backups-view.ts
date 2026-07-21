import type { BackupSummaryDto } from '../../shared/dto/backup-status.dto';
import { renderInlineConfirm } from '../components/inline-confirm';
import { formatBytes, formatDateTime } from '../utils/format';
import { escapeHtml } from '../utils/text';

export function renderBackupsView(summary: BackupSummaryDto): string {
  return `
    <div class="view-stack view-stack--scroll">
      <div class="view-header">
        <div>
          <span class="view-kicker">BACKUPS</span>
          <h3>Backups del servidor</h3>
          <p>${escapeHtml(summary.message)}</p>
        </div>
        <div class="view-actions">
          <button id="create-config-backup" class="secondary-button" type="button">Backup INI</button>
          <button id="create-world-backup" class="primary-button" type="button">Backup mundo</button>
          <button id="delete-selected-backups" class="secondary-button backup-trash-selected" type="button" disabled>
            Enviar seleccionados a papelera
          </button>
        </div>
      </div>
      <section class="backup-actions">
        <article class="backup-source-card">
          <span>Configuracion activa</span>
          <strong>${escapeHtml(summary.configurationSourcePath)}</strong>
        </article>
        <article class="backup-source-card">
          <span>Partida del servidor</span>
          <strong>${escapeHtml(summary.worldSourcePath)}</strong>
        </article>
      </section>
      <section class="backup-layout">
        ${renderBackupList('Configuracion', summary.configurationBackups)}
        ${renderBackupList('Mundo', summary.worldBackups)}
      </section>
      ${renderInlineConfirm({
        id: 'backup-confirmation',
        messageId: 'backup-confirmation-message',
        message: 'La accion requiere confirmacion.',
        hidden: true,
        actions: [
          { id: 'confirm-backup', label: 'Confirmar', tone: 'primary' },
          { id: 'cancel-backup', label: 'Cancelar', tone: 'secondary' }
        ]
      })}
    </div>
  `;
}

function renderBackupList(title: string, backups: BackupSummaryDto['configurationBackups']): string {
  return `
    <section class="backup-list">
      <div class="backup-list__header">
        <h4>${escapeHtml(title)}</h4>
        <span>${String(backups.length)} backups</span>
      </div>
      <div class="backup-list__items">
        ${
          backups.length > 0
            ? backups.map((backup) => renderBackupItem(backup)).join('')
            : '<p class="backup-empty">Todavia no hay backups de este tipo.</p>'
        }
      </div>
    </section>
  `;
}

function renderBackupItem(backup: BackupSummaryDto['configurationBackups'][number]): string {
  return `
    <article class="backup-item">
      <span>
        <strong>${escapeHtml(backup.name)}</strong>
        <small>${escapeHtml(formatDateTime(backup.createdAt))}</small>
      </span>
      <span class="backup-item__meta">${escapeHtml(formatBytes(backup.sizeBytes))}</span>
      <label class="backup-select" aria-label="Seleccionar backup ${escapeHtml(backup.name)}">
        <input data-backup-select="${escapeHtml(backup.id)}" type="checkbox" />
        <span class="backup-select__box" aria-hidden="true"></span>
      </label>
    </article>
  `;
}
