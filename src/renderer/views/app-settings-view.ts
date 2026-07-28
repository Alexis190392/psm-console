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
        <div class="view-header__meta">
          <span id="settings-save-status" class="settings-save-status" aria-live="polite"></span>
          <span class="view-meta-pill">${escapeHtml(APP_VERSION_LABEL)}</span>
        </div>
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
        <h4>Datos de la app</h4>
        <dl>
          <div><dt>Raiz portable</dt><dd title="${escapeHtml(status.portableRoot)}">${escapeHtml(status.portableRoot)}</dd></div>
          <div><dt>Preferencias</dt><dd>${escapeHtml(status.settingsRelativePath)}</dd></div>
          <div><dt>Logs</dt><dd>${escapeHtml(status.logsRelativePath)}</dd></div>
          <div><dt>Backups</dt><dd>${escapeHtml(status.backupsRelativePath)}</dd></div>
        </dl>
      </article>
      <article class="content-card settings-overview-card">
        <h4>Actualizaciones</h4>
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
    <section class="settings-api-layout">
      <div class="settings-api-profiles">
        <form class="admin-card settings-api-form" data-remote-api-form="ADMIN">
        <div class="admin-card__title-row">
          <h4>API administrativa</h4>
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
            <input name="port" type="number" inputmode="numeric" min="1024" max="65535" step="1" value="${String(settings.port)}" required />
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
        ${renderRemoteApiProfileError(status)}
        <p class="settings-api-status__warning ${settings.bindMode === 'LOCAL_NETWORK' ? '' : 'hidden'}">
          HTTP disponible en la red local. Usalo solo en una LAN confiable.
        </p>
        </form>
        ${renderClientApiProfile(status.client)}
      </div>
      ${renderRemoteApiConnectionStatus(status)}
    </section>
  `;
}

export function renderRemoteApiConnectionStatus(status: RemoteApiStatusDto): string {
  const sharedState = resolveSharedRemoteApiState(status);
  const running = sharedState === 'RUNNING';
  const connections = status.connections;
  return `
    <article class="settings-api-connection">
      <header class="settings-api-connection__header">
        <h4>Direcciones disponibles</h4>
        <div class="settings-api-connection__state">
          <span class="settings-api-status__indicator settings-api-status__indicator--${sharedState.toLowerCase()}"></span>
          <strong>${running ? 'En ejecucion' : remoteApiStateLabel(sharedState)}</strong>
        </div>
      </header>
      <div class="settings-api-addresses">
        ${connections.length > 0
          ? connections.map((connection) => `
              <button
                class="settings-api-address settings-api-address--${connection.state.toLowerCase()}"
                type="button"
                ${connection.endpoint ? `data-copy-value="${escapeHtml(connection.endpoint)}"` : 'disabled'}
                title="${escapeHtml(connection.endpoint ? 'Copiar direccion' : connection.message)}"
              >
                <span class="settings-api-address__indicator" aria-hidden="true"></span>
                <span class="settings-api-address__content">
                  <strong>${escapeHtml(connection.label)}</strong>
                  <code>${escapeHtml(connection.endpoint ?? connectionStateLabel(connection.state))}</code>
                  <small>${escapeHtml(connection.message)}</small>
                </span>
                ${connection.endpoint ? renderIcon('copy', 'settings-api-address__copy') : ''}
              </button>
            `).join('')
          : `
              <div class="settings-api-address settings-api-address--disabled">
                <span class="settings-api-address__indicator" aria-hidden="true"></span>
                <span class="settings-api-address__content">
                  <strong>Sin direcciones activas</strong>
                  <small>Habilita la API administrativa o cliente para iniciar la conexion web.</small>
                </span>
              </div>
            `}
      </div>
      <dl class="settings-api-connection__meta">
        <div><dt>Acceso</dt><dd>${status.settings.bindMode === 'LOCAL_NETWORK' ? 'Red local' : 'Este equipo'}</dd></div>
        <div><dt>Puerto</dt><dd><code>${String(status.settings.port)}</code></dd></div>
        <div><dt>Sesion</dt><dd>Mientras la app este abierta</dd></div>
      </dl>
    </article>
  `;
}

function resolveSharedRemoteApiState(status: RemoteApiStatusDto): RemoteApiStatusDto['state'] {
  if (status.state === 'RUNNING' || status.client.state === 'RUNNING') {
    return 'RUNNING';
  }
  if (status.state === 'STARTING' || status.client.state === 'STARTING') {
    return 'STARTING';
  }
  if (status.state === 'ERROR' || status.client.state === 'ERROR') {
    return 'ERROR';
  }
  return 'DISABLED';
}

function renderClientApiProfile(status: RemoteApiProfileStatusDto): string {
  const settings = status.settings;
  const permissions = 'permissions' in settings ? settings.permissions : [];
  return `
    <form class="admin-card settings-api-form" data-remote-api-form="CLIENT">
      <div class="admin-card__title-row">
        <h4>API cliente</h4>
        <label class="toggle-control">
          <input name="enabled" type="checkbox" ${settings.enabled ? 'checked' : ''} />
          <span class="toggle-control__track" aria-hidden="true"><span></span></span>
          <span>${settings.enabled ? 'Activa' : 'Inactiva'}</span>
        </label>
      </div>
      <div class="settings-api-form__fields">
        <input name="bindMode" type="hidden" value="${settings.bindMode}" />
        <input name="port" type="hidden" value="${String(settings.port)}" />
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
      ${renderRemoteApiProfileError(status)}
    </form>
  `;
}

function renderRemoteApiProfileError(status: RemoteApiProfileStatusDto): string {
  return status.state === 'ERROR'
    ? `<p class="settings-api-profile-error">${escapeHtml(status.message)}</p>`
    : '';
}

function renderClientPermissions(permissions: RemoteApiPermission[]): string {
  const groups: Array<{
    label: string;
    options: Array<{ value: RemoteApiPermission; label: string }>;
  }> = [
    {
      label: 'Informacion',
      options: [
        { value: 'GENERAL', label: 'Estado general' },
        { value: 'LOGS', label: 'Logs' }
      ]
    },
    {
      label: 'Control del servidor',
      options: [
        { value: 'SERVER_START', label: 'Iniciar' },
        { value: 'SERVER_RESTART', label: 'Reiniciar' },
        { value: 'SERVER_STOP', label: 'Detener' }
      ]
    },
    {
      label: 'Jugadores',
      options: [
        { value: 'PLAYERS_VIEW', label: 'Ver jugadores' },
        { value: 'PLAYERS_KICK', label: 'Expulsar' },
        { value: 'PLAYERS_BAN', label: 'Banear' }
      ]
    }
  ];
  return `
    <fieldset class="settings-api-permissions">
      <legend>Contenido visible para el cliente</legend>
      <div class="settings-api-permission-groups">
        ${groups.map((group) => `
          <section class="settings-api-permission-group">
            <h5>${group.label}</h5>
            <div class="settings-api-permissions__grid">
              ${group.options.map((option) => `
                <label class="choice-chip settings-permission-option">
                  <input name="permissions" type="checkbox" value="${option.value}" ${permissions.includes(option.value) ? 'checked' : ''} />
                  <span>${option.label}</span>
                </label>
              `).join('')}
            </div>
          </section>
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

function connectionStateLabel(state: RemoteApiStatusDto['connections'][number]['state']): string {
  if (state === 'CHECKING') {
    return 'Verificando';
  }
  if (state === 'UNAVAILABLE') {
    return 'No disponible';
  }
  if (state === 'UNKNOWN') {
    return 'No confirmado';
  }
  if (state === 'DISABLED') {
    return 'No expuesta';
  }
  return 'Disponible';
}
