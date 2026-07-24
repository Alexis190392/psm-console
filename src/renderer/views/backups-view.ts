import type { BackupSummaryDto } from '../../shared/dto/backup-status.dto';
import { formatBytes, formatDateTime } from '../utils/format';
import { escapeHtml } from '../utils/text';

export function renderBackupsView(summary: BackupSummaryDto): string {
  const totalBackups = summary.configurationBackups.length + summary.worldBackups.length;
  const backups = [...summary.configurationBackups, ...summary.worldBackups]
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));

  return `
    <div class="view-stack view-stack--scroll">
      <div class="view-header view-header--contained">
        <div>
          <h3>Backups</h3>
        </div>
        <div class="view-meta-stack">
          <span class="view-meta-pill">${String(totalBackups)} backups</span>
          <span class="view-meta-path">${escapeHtml(formatBytes(summary.totalSizeBytes))} en total</span>
        </div>
      </div>
      ${renderBackupPolicy(summary)}
      <details class="source-disclosure">
        <summary>Rutas protegidas</summary>
        <div class="backup-actions">
          <article class="backup-source-card">
            <span>Configuracion activa</span>
            <strong title="${escapeHtml(summary.configurationSourcePath)}">${escapeHtml(summary.configurationSourcePath)}</strong>
          </article>
          <article class="backup-source-card">
            <span>Partida del servidor</span>
            <strong title="${escapeHtml(summary.worldSourcePath)}">${escapeHtml(summary.worldSourcePath)}</strong>
          </article>
        </div>
      </details>
      <section class="backup-list backup-list--unified">
        <div class="backup-list__header">
          <h4>Historial</h4>
          <div class="segmented-filter" role="group" aria-label="Filtrar backups por tipo">
            <button class="segmented-filter__button segmented-filter__button--active" type="button" data-backup-filter="all" aria-pressed="true">Todos</button>
            <button class="segmented-filter__button" type="button" data-backup-filter="configuration" aria-pressed="false">INI</button>
            <button class="segmented-filter__button" type="button" data-backup-filter="world" aria-pressed="false">Mundo</button>
          </div>
        </div>
        <div class="backup-list__columns" aria-hidden="true">
          <span>Backup</span><span>Tipo</span><span>Integridad</span><span>Tamano</span><span></span>
        </div>
        <div class="backup-list__items">
          ${backups.length > 0 ? backups.map(renderBackupItem).join('') : '<p class="backup-empty">Todavia no hay backups disponibles.</p>'}
        </div>
      </section>
    </div>
  `;
}

function renderBackupPolicy(summary: BackupSummaryDto): string {
  const policy = summary.policy;
  const integrityLabel = summary.corruptedBackups > 0
    ? `${String(summary.corruptedBackups)} con error`
    : `${String(summary.verifiedBackups)} verificados`;

  return `
    <form id="backup-policy-form" class="backup-policy">
      <div class="backup-policy__status">
        <span>Integridad</span>
        <strong class="${summary.corruptedBackups > 0 ? 'backup-integrity--corrupted' : ''}">${escapeHtml(integrityLabel)}</strong>
      </div>
      <label class="backup-policy__toggle">
        <input name="automaticEnabled" type="checkbox" ${policy.automaticEnabled ? 'checked' : ''} />
        <span class="switch-control" aria-hidden="true"><span></span></span>
        <span>Automáticos</span>
      </label>
      <label class="backup-policy__field">
        <span>Cada</span>
        <input name="automaticIntervalHours" type="number" min="1" max="168" value="${String(policy.automaticIntervalHours)}" />
        <small>horas</small>
      </label>
      <label class="backup-policy__field">
        <span>Conservar</span>
        <input name="automaticRetentionPerType" type="number" min="1" max="100" value="${String(policy.automaticRetentionPerType)}" />
        <small>por tipo</small>
      </label>
      <label class="backup-policy__toggle">
        <input name="compressWorldBackups" type="checkbox" ${policy.compressWorldBackups ? 'checked' : ''} />
        <span class="switch-control" aria-hidden="true"><span></span></span>
        <span>Comprimir mundo</span>
      </label>
      <button class="secondary-button icon-button" type="submit" aria-label="Guardar politica de backups" title="Guardar politica">
        <span class="ui-icon ui-icon--check" aria-hidden="true"></span>
      </button>
    </form>
  `;
}

function renderBackupItem(backup: BackupSummaryDto['configurationBackups'][number]): string {
  const origin = backup.origin === 'automatic'
    ? 'Automatico'
    : backup.origin === 'safety'
      ? 'Preventivo'
      : 'Manual';
  const integrity = backup.integrity === 'VERIFIED'
    ? 'Verificado'
    : backup.integrity === 'CORRUPTED'
      ? 'Danado'
      : 'Sin verificar';

  return `
    <article class="backup-item backup-item--${backup.integrity.toLowerCase()}" data-backup-row data-backup-kind="${backup.kind}">
      <span>
        <strong>${escapeHtml(backup.name)}</strong>
        <small>${escapeHtml(formatDateTime(backup.createdAt))} - ${escapeHtml(origin)}</small>
      </span>
      <span class="backup-item__kind">${backup.kind === 'configuration' ? 'INI' : 'Mundo'}</span>
      <span class="backup-item__state" title="${escapeHtml(backup.integrityMessage)}">${escapeHtml(integrity)}</span>
      <span class="backup-item__meta">${escapeHtml(formatBytes(backup.sizeBytes))}</span>
      <label class="backup-select" aria-label="Seleccionar backup ${escapeHtml(backup.name)}">
        <input data-backup-select="${escapeHtml(backup.id)}" type="checkbox" />
        <span class="backup-select__box" aria-hidden="true"></span>
      </label>
    </article>
  `;
}
