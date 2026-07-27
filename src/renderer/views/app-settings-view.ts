import type { AppSettingsStatusDto } from '../../shared/dto/app-settings.dto';
import type { AppUpdateStatusDto } from '../../shared/dto/app-update-status.dto';
import type { BackupSummaryDto } from '../../shared/dto/backup-status.dto';
import type { ServerIdleStatusDto } from '../../shared/dto/server-idle-policy.dto';
import { APP_VERSION_LABEL } from '../../shared/constants/app-info';
import { renderIcon } from '../components/icon';
import { escapeHtml } from '../utils/text';
import type { SettingsTab } from '../state/settings-view-state';

export function renderAppSettingsView(
  status: AppSettingsStatusDto,
  update: AppUpdateStatusDto | null,
  backupSummary: BackupSummaryDto,
  idleStatus: ServerIdleStatusDto,
  activeTab: SettingsTab
): string {
  return `
    <div class="view-stack view-stack--scroll app-settings-view">
      <div class="view-header view-header--contained">
        <h3>${activeTab === 'application' ? 'Aplicacion' : 'Automatizaciones'}</h3>
        <span class="view-meta-pill">${escapeHtml(APP_VERSION_LABEL)}</span>
      </div>
      ${activeTab === 'application'
        ? renderApplicationSettings(status, update)
        : renderAutomationSettings(backupSummary, idleStatus)}
    </div>
  `;
}

function renderApplicationSettings(status: AppSettingsStatusDto, update: AppUpdateStatusDto | null): string {
  return `
    <section class="settings-overview-grid">
      <article class="content-card settings-overview-card">
        <span class="view-kicker">DATOS DE LA APP</span>
        <dl>
          <div><dt>Raiz portable</dt><dd title="${escapeHtml(status.portableRoot)}">${escapeHtml(status.portableRoot)}</dd></div>
          <div><dt>Preferencias</dt><dd>${escapeHtml(status.settingsRelativePath)}</dd></div>
          <div><dt>Logs</dt><dd>${escapeHtml(status.logsRelativePath)}</dd></div>
          <div><dt>Backups</dt><dd>${escapeHtml(status.backupsRelativePath)}</dd></div>
        </dl>
      </article>
      <article class="content-card settings-overview-card">
        <span class="view-kicker">ACTUALIZACIONES</span>
        <div class="settings-update-row">
          <div>
            <strong>${escapeHtml(update?.message ?? 'Sin comprobacion reciente.')}</strong>
            <small>${update?.latestVersion ? `Disponible ${escapeHtml(update.latestVersion)}` : escapeHtml(APP_VERSION_LABEL)}</small>
          </div>
          ${update?.state === 'AVAILABLE'
            ? `<button id="settings-open-release" class="secondary-button button-with-icon" type="button">${renderIcon('download')}<span>Ver release</span></button>`
            : ''}
        </div>
      </article>
    </section>
  `;
}

function renderAutomationSettings(summary: BackupSummaryDto, idleStatus: ServerIdleStatusDto): string {
  const idleEnabled = idleStatus.policy.enabled;
  const idleMessage = idleStatus.state === 'COUNTDOWN' && typeof idleStatus.remainingSeconds === 'number'
    ? `${String(idleStatus.remainingSeconds)} s restantes`
    : idleStatus.message;
  const backup = summary.policy;

  return `
    <section class="settings-automation-grid">
      <form class="admin-card admin-card--idle" data-idle-policy-form>
        <span class="view-kicker">SERVIDOR VACIO</span>
        <div class="admin-card__title-row">
          <h4>Apagado automatico</h4>
          <label class="toggle-control">
            <input name="enabled" type="checkbox" ${idleEnabled ? 'checked' : ''} />
            <span class="toggle-control__track" aria-hidden="true"><span></span></span>
            <span>${idleEnabled ? 'Activo' : 'Inactivo'}</span>
          </label>
        </div>
        <label class="admin-idle-seconds">
          <span>Espera sin jugadores</span>
          <span class="admin-idle-seconds__input">
            <input name="emptySeconds" type="number" min="10" max="86400" step="1" value="${String(idleStatus.policy.emptySeconds)}" ${idleEnabled ? '' : 'disabled'} />
            <small>segundos</small>
          </span>
        </label>
        <p class="admin-card__hint">${escapeHtml(idleMessage)}</p>
        <button class="secondary-button button-with-icon" type="submit">${renderIcon('save')}<span>Guardar</span></button>
      </form>
      <form id="backup-policy-form" class="admin-card settings-backup-policy">
        <span class="view-kicker">RESPALDOS</span>
        <div class="admin-card__title-row">
          <h4>Backups automaticos</h4>
          <label class="toggle-control">
            <input name="automaticEnabled" type="checkbox" ${backup.automaticEnabled ? 'checked' : ''} />
            <span class="toggle-control__track" aria-hidden="true"><span></span></span>
            <span>${backup.automaticEnabled ? 'Activo' : 'Inactivo'}</span>
          </label>
        </div>
        <div class="settings-backup-policy__fields">
          <label><span>Cada</span><input name="automaticIntervalHours" type="number" min="1" max="168" value="${String(backup.automaticIntervalHours)}" /><small>horas</small></label>
          <label><span>Conservar</span><input name="automaticRetentionPerType" type="number" min="1" max="100" value="${String(backup.automaticRetentionPerType)}" /><small>por tipo</small></label>
        </div>
        <label class="settings-check-row">
          <input name="compressWorldBackups" type="checkbox" ${backup.compressWorldBackups ? 'checked' : ''} />
          <span>Comprimir backups del mundo</span>
        </label>
        <button class="secondary-button button-with-icon" type="submit">${renderIcon('save')}<span>Guardar</span></button>
      </form>
    </section>
  `;
}
