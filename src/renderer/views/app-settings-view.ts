import type { AppSettingsStatusDto } from '../../shared/dto/app-settings.dto';
import type { AppUpdateStatusDto } from '../../shared/dto/app-update-status.dto';
import type { BackupSummaryDto } from '../../shared/dto/backup-status.dto';
import type {
  RemoteApiPermission,
  RemoteApiProfileStatusDto,
  RemoteApiStatusDto
} from '../../shared/dto/remote-api.dto';
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
  remoteApiStatus: RemoteApiStatusDto,
  activeTab: SettingsTab
): string {
  const title = activeTab === 'summary'
    ? 'Resumen'
    : activeTab === 'application'
      ? 'Aplicacion'
      : activeTab === 'automation'
        ? 'Automatizaciones'
        : 'API web';

  return `
    <div class="view-stack view-stack--scroll app-settings-view">
      <div class="view-header view-header--contained">
        <h3>${title}</h3>
        <span class="view-meta-pill">${escapeHtml(APP_VERSION_LABEL)}</span>
      </div>
      ${activeTab === 'summary'
        ? renderSettingsSummary(status, update, backupSummary, idleStatus, remoteApiStatus)
        : activeTab === 'application'
          ? renderApplicationSettings(status, update)
          : activeTab === 'automation'
            ? renderAutomationSettings(backupSummary, idleStatus)
            : renderRemoteApiSettings(remoteApiStatus)}
    </div>
  `;
}

function renderSettingsSummary(
  status: AppSettingsStatusDto,
  update: AppUpdateStatusDto | null,
  backupSummary: BackupSummaryDto,
  idleStatus: ServerIdleStatusDto,
  remoteApiStatus: RemoteApiStatusDto
): string {
  const idleEnabled = idleStatus.policy.enabled;
  const backupEnabled = backupSummary.policy.automaticEnabled;
  const updateAvailable = update?.state === 'AVAILABLE';
  const updateChecked = update !== null;
  const backupCount = backupSummary.configurationBackups.length + backupSummary.worldBackups.length;

  return `
    <section class="settings-summary" aria-label="Resumen de configuracion">
      <button class="settings-summary-card" data-settings-target="application" type="button">
        <span class="settings-summary-card__icon">${renderIcon('settings')}</span>
        <span class="settings-summary-card__content">
          <span class="view-kicker">APLICACION</span>
          <strong>${escapeHtml(APP_VERSION_LABEL)}</strong>
          <small>Preferencias en ${escapeHtml(status.settingsRelativePath)}</small>
        </span>
        <span class="settings-summary-card__action">Ver detalles</span>
      </button>
      <button class="settings-summary-card" data-settings-target="application" type="button">
        <span class="settings-summary-card__icon settings-summary-card__icon--${updateAvailable ? 'warning' : updateChecked ? 'ready' : 'neutral'}">
          ${renderIcon(updateAvailable ? 'download' : updateChecked ? 'check' : 'refresh')}
        </span>
        <span class="settings-summary-card__content">
          <span class="view-kicker">ACTUALIZACIONES</span>
          <strong>${updateAvailable ? 'Nueva version disponible' : updateChecked ? 'Aplicacion actualizada' : 'Sin verificacion reciente'}</strong>
          <small>${escapeHtml(update?.message ?? 'Sin comprobacion reciente.')}</small>
        </span>
        <span class="settings-summary-card__action">Ver detalles</span>
      </button>
      <button class="settings-summary-card" data-settings-target="automation" type="button">
        <span class="settings-summary-card__icon settings-summary-card__icon--${idleEnabled ? 'ready' : 'neutral'}">
          ${renderIcon('clock')}
        </span>
        <span class="settings-summary-card__content">
          <span class="view-kicker">APAGADO AUTOMATICO</span>
          <strong>${idleEnabled ? 'Activo' : 'Inactivo'}</strong>
          <small>${idleEnabled
            ? `Detiene el servidor tras ${String(idleStatus.policy.emptySeconds)} s sin jugadores.`
            : 'El servidor no se detendra por inactividad.'}</small>
        </span>
        <span class="settings-summary-card__action">Configurar</span>
      </button>
      <button class="settings-summary-card" data-settings-target="automation" type="button">
        <span class="settings-summary-card__icon settings-summary-card__icon--${backupEnabled ? 'ready' : 'neutral'}">
          ${renderIcon('backup')}
        </span>
        <span class="settings-summary-card__content">
          <span class="view-kicker">BACKUPS AUTOMATICOS</span>
          <strong>${backupEnabled ? `Cada ${String(backupSummary.policy.automaticIntervalHours)} h` : 'Inactivos'}</strong>
          <small>${String(backupCount)} backups disponibles. Retencion: ${String(backupSummary.policy.automaticRetentionPerType)} por tipo.</small>
        </span>
        <span class="settings-summary-card__action">Configurar</span>
      </button>
      <button class="settings-summary-card" data-settings-target="remote-api" type="button">
        <span class="settings-summary-card__icon settings-summary-card__icon--${remoteApiStatus.state === 'RUNNING' ? 'ready' : remoteApiStatus.state === 'ERROR' ? 'warning' : 'neutral'}">
          ${renderIcon('network')}
        </span>
        <span class="settings-summary-card__content">
          <span class="view-kicker">API WEB</span>
          <strong>${remoteApiStatus.state === 'RUNNING' ? 'Disponible' : remoteApiStatus.settings.enabled ? 'Con error' : 'Deshabilitada'}</strong>
          <small>${escapeHtml(remoteApiStatus.endpoint ?? remoteApiStatus.message)}</small>
        </span>
        <span class="settings-summary-card__action">Configurar</span>
      </button>
    </section>
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
          <span class="input-with-unit">
            <input name="emptySeconds" type="number" min="10" max="86400" step="1" value="${String(idleStatus.policy.emptySeconds)}" ${idleEnabled ? '' : 'disabled'} />
            <small>s</small>
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
          <label>
            <span>Cada</span>
            <span class="input-with-unit">
              <input name="automaticIntervalHours" type="number" min="1" max="168" value="${String(backup.automaticIntervalHours)}" />
              <small>h</small>
            </span>
          </label>
          <label>
            <span>Conservar por tipo</span>
            <input name="automaticRetentionPerType" type="number" min="1" max="100" value="${String(backup.automaticRetentionPerType)}" />
          </label>
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

function renderRemoteApiSettings(status: RemoteApiStatusDto): string {
  const settings = status.settings;
  const enabled = settings.enabled;
  const passwordHint = settings.passwordConfigured
    ? 'Deja este campo vacio para conservar la contraseña actual.'
    : 'Configura una contraseña de al menos 5 caracteres para habilitar la API.';

  return `
    <section class="settings-api-grid">
      <form class="admin-card settings-api-form" data-remote-api-form="ADMIN">
        <div class="admin-card__title-row">
          <div>
            <span class="view-kicker">ACCESO HTTP</span>
            <h4>API administrativa</h4>
          </div>
          <label class="toggle-control">
            <input name="enabled" type="checkbox" ${enabled ? 'checked' : ''} />
            <span class="toggle-control__track" aria-hidden="true"><span></span></span>
            <span>${enabled ? 'Activa' : 'Inactiva'}</span>
          </label>
        </div>
        <div class="settings-api-form__fields">
          <label>
            <span>Acceso</span>
            <select name="bindMode">
              <option value="LOCAL_ONLY" ${settings.bindMode === 'LOCAL_ONLY' ? 'selected' : ''}>Solo este equipo</option>
              <option value="LOCAL_NETWORK" ${settings.bindMode === 'LOCAL_NETWORK' ? 'selected' : ''}>Red local</option>
            </select>
          </label>
          <label>
            <span>Puerto</span>
            <input name="port" type="number" min="1024" max="65535" step="1" value="${String(settings.port)}" required />
          </label>
          <label>
            <span>Usuario</span>
            <input name="username" type="text" minlength="3" maxlength="64" pattern="[A-Za-z0-9._-]+" value="${escapeHtml(settings.username)}" autocomplete="username" required />
          </label>
          <label>
            <span>Nueva contraseña</span>
            <input name="password" type="password" minlength="5" maxlength="128" autocomplete="new-password" placeholder="${settings.passwordConfigured ? 'Contrasena configurada' : 'Minimo 5 caracteres'}" />
            <small>${passwordHint}</small>
          </label>
        </div>
        <div class="admin-card__actions">
          <button class="primary-button button-with-icon" type="submit">${renderIcon('save')}<span>Guardar API</span></button>
        </div>
      </form>
      <article class="content-card settings-api-status">
        <span class="view-kicker">ESTADO</span>
        <div class="settings-api-status__heading">
          <strong>${escapeHtml(remoteApiStateLabel(status.state))}</strong>
          <span class="settings-api-status__indicator settings-api-status__indicator--${status.state.toLowerCase()}"></span>
        </div>
        <p>${escapeHtml(status.message)}</p>
        ${status.endpoint ? `<code>${escapeHtml(status.endpoint)}</code>` : ''}
        <dl>
          <div><dt>Autenticacion</dt><dd>Usuario y token temporal</dd></div>
          <div><dt>Sesion</dt><dd>8 h</dd></div>
          <div><dt>Estado publico</dt><dd><code>/api/v1/health</code></dd></div>
        </dl>
        <p class="settings-api-status__warning ${settings.bindMode === 'LOCAL_NETWORK' ? '' : 'hidden'}">
          Usa acceso por red solo en una LAN confiable. Esta primera version sirve HTTP y no debe publicarse directamente en Internet.
        </p>
      </article>
      ${renderClientApiProfile(status.client)}
    </section>
  `;
}

function renderClientApiProfile(status: RemoteApiProfileStatusDto): string {
  const settings = status.settings;
  const permissions = 'permissions' in settings ? settings.permissions : [];
  return `
    <form class="admin-card settings-api-form" data-remote-api-form="CLIENT">
      <div class="admin-card__title-row">
        <div>
          <span class="view-kicker">ACCESO LIMITADO</span>
          <h4>API cliente</h4>
        </div>
        <label class="toggle-control">
          <input name="enabled" type="checkbox" ${settings.enabled ? 'checked' : ''} />
          <span class="toggle-control__track" aria-hidden="true"><span></span></span>
          <span>${settings.enabled ? 'Activa' : 'Inactiva'}</span>
        </label>
      </div>
      <div class="settings-api-form__fields">
        <label>
          <span>Acceso</span>
          <select name="bindMode">
            <option value="LOCAL_ONLY" ${settings.bindMode === 'LOCAL_ONLY' ? 'selected' : ''}>Solo este equipo</option>
            <option value="LOCAL_NETWORK" ${settings.bindMode === 'LOCAL_NETWORK' ? 'selected' : ''}>Red local</option>
          </select>
        </label>
        <label>
          <span>Puerto</span>
          <input name="port" type="number" min="1024" max="65535" step="1" value="${String(settings.port)}" required />
        </label>
        <label>
          <span>Usuario cliente</span>
          <input name="username" type="text" minlength="3" maxlength="64" pattern="[A-Za-z0-9._-]+" value="${escapeHtml(settings.username)}" autocomplete="username" required />
        </label>
        <label>
          <span>Nueva contrasena</span>
          <input name="password" type="password" minlength="5" maxlength="128" autocomplete="new-password" placeholder="${settings.passwordConfigured ? 'Contrasena configurada' : 'Minimo 5 caracteres'}" />
          <small>${settings.passwordConfigured ? 'Deja el campo vacio para conservarla.' : 'Minimo 5 caracteres.'}</small>
        </label>
      </div>
      ${renderClientPermissions(permissions)}
      <div class="admin-card__actions">
        <button class="primary-button button-with-icon" type="submit">${renderIcon('save')}<span>Guardar API cliente</span></button>
      </div>
    </form>
    <article class="content-card settings-api-status">
      <span class="view-kicker">ESTADO CLIENTE</span>
      <div class="settings-api-status__heading">
        <strong>${escapeHtml(remoteApiStateLabel(status.state))}</strong>
        <span class="settings-api-status__indicator settings-api-status__indicator--${status.state.toLowerCase()}"></span>
      </div>
      <p>${escapeHtml(status.message)}</p>
      ${status.endpoint ? `<code>${escapeHtml(status.endpoint)}</code>` : ''}
      <dl>
        <div><dt>Autenticacion</dt><dd>Usuario cliente y token</dd></div>
        <div><dt>Sesion</dt><dd>8 h</dd></div>
      </dl>
      <p class="settings-api-status__warning ${settings.bindMode === 'LOCAL_NETWORK' ? '' : 'hidden'}">
        La API cliente usa HTTP. Habilitala solo en una red local confiable.
      </p>
    </article>
  `;
}

function renderClientPermissions(permissions: RemoteApiPermission[]): string {
  const options: Array<{ value: RemoteApiPermission; label: string; detail: string }> = [
    { value: 'GENERAL', label: 'Estado general', detail: 'Estado de la aplicacion y del servidor.' },
    { value: 'SERVER_CONTROL', label: 'Control del servidor', detail: 'Iniciar, reiniciar y detener.' },
    { value: 'PLAYERS', label: 'Jugadores', detail: 'Listado de jugadores conectados.' },
    { value: 'LOGS', label: 'Logs', detail: 'Actividad de la instancia.' }
  ];
  return `
    <fieldset class="settings-api-permissions">
      <legend>Contenido visible para el cliente</legend>
      <div class="settings-api-permissions__grid">
        ${options.map((option) => `
          <label class="settings-permission-option">
            <input name="permissions" type="checkbox" value="${option.value}" ${permissions.includes(option.value) ? 'checked' : ''} />
            <span><strong>${option.label}</strong><small>${option.detail}</small></span>
          </label>
        `).join('')}
      </div>
    </fieldset>
  `;
}

function remoteApiStateLabel(state: RemoteApiStatusDto['state']): string {
  if (state === 'RUNNING') {
    return 'En ejecucion';
  }
  if (state === 'STARTING') {
    return 'Iniciando';
  }
  if (state === 'ERROR') {
    return 'Error';
  }
  return 'Deshabilitada';
}
