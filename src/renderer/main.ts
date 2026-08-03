import './styles.css';
import { APP_INFO, APP_VERSION_LABEL } from '../shared/constants/app-info';
import { formatLocalLogTimestamp } from '../shared/utils/local-time';
import { ApplicationStatus } from '../shared/enums/application-status';
import type { AllowedActionsDto } from '../shared/dto/allowed-actions.dto';
import type { AppProcessMetricDto, AppProcessMetricsDto } from '../shared/dto/app-process-metrics.dto';
import type { AppUpdateStatusDto } from '../shared/dto/app-update-status.dto';
import type { BackupSummaryDto, BackupUpdatePolicyRequestDto } from '../shared/dto/backup-status.dto';
import type {
  FirewallDiagnosticProgressDto,
  FirewallDiagnosticStepId,
  FirewallDiagnosticStepState,
  FirewallPortCheckDto,
  FirewallStatusDto
} from '../shared/dto/firewall-status.dto';
import type { NetworkDiagnosticsDto } from '../shared/dto/network-diagnostics.dto';
import type { LogFileSummaryDto, LogModule } from '../shared/dto/log-status.dto';
import type { OperationProgressDto } from '../shared/dto/operation-progress.dto';
import type { PalworldAdminAction, PalworldAdminStatusDto } from '../shared/dto/palworld-admin.dto';
import type { PalworldPlayersStatusDto } from '../shared/dto/palworld-players-status.dto';
import type { PalworldUpdateStatusDto } from '../shared/dto/palworld-installation-status.dto';
import type { PalworldQueryPortStatusDto, PalworldRuntimeStatusDto } from '../shared/dto/palworld-runtime-status.dto';
import type {
  RemoteApiPermission,
  RemoteApiStatusDto,
  RemoteApiUpdateRequestDto
} from '../shared/dto/remote-api.dto';
import {
  createSummaryCardState,
  renderSummaryCard,
  type SummaryCardViewModel
} from './components/summary-card';
import { renderInlineConfirm } from './components/inline-confirm';
import { renderIcon } from './components/icon';
import { CONFIGURATION_PRESETS } from './config/configuration-presets';
import { hasConfigurationChangedExternally } from './config/configuration-change-guard';
import { getSettingDefinition } from './config/setting-definition-resolver';
import {
  formatSettingValue,
  parsePalworldSettings,
  serializePalworldSettings,
  unquoteSettingValue,
  type ParsedPalworldSettings
} from './config/palworld-settings-parser';
import { formatBytes, formatLastVerification } from './utils/format';
import { syncLiveElement } from './utils/dom-sync';
import { getOperationFailureMessage, isOperationSuccessful } from './utils/operation-result';
import { cssEscape, escapeHtml, normalizeSearchText } from './utils/text';
import { renderBackupsView as renderBackupsViewHtml } from './views/backups-view';
import { hasAdminGeneralData, renderAdminStatus, type AdminTab } from './views/admin-view';
import {
  renderAppSettingsView,
  renderRemoteApiConnectionStatus
} from './views/app-settings-view';
import {
  renderConfigurationPresets,
  renderSettingsFilterBar,
  renderSettingsForm
} from './views/server-configuration-view';
import {
  createGeneralRemoteApiCard,
  createGeneralServerUpdateCard,
  renderGeneralRemoteApiCard,
  renderGeneralUpdateAction,
  renderGeneralView as renderGeneralViewHtml,
  shouldRefreshGeneralRemoteApi
} from './views/general-view';
import { renderPreflightSummaryView, renderSimpleView as renderSimpleViewHtml } from './views/status-views';
import { NavigationState } from './state/navigation-state';
import { AdminViewState } from './state/admin-view-state';
import { SettingsViewState, type SettingsTab } from './state/settings-view-state';
import { resolveServerActionState } from './state/server-action-state';

const palcmLogoUrl = new URL('./assets/palcm-logo.png', import.meta.url).href;
const palcmSymbolUrl = new URL('./assets/palcm-symbol.png', import.meta.url).href;

const appRoot = document.querySelector<HTMLDivElement>('#app');

if (!appRoot) {
  throw new Error('Renderer root element was not found.');
}

const rootElement = appRoot;

rootElement.innerHTML = `
  <a class="skip-link" href="#content-view">Saltar al contenido</a>
  <svg
    class="tactical-window-frame"
    aria-hidden="true"
    preserveAspectRatio="none"
    focusable="false"
  >
    <defs>
      <linearGradient id="tactical-window-frame-gradient" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#08d9e8" />
        <stop offset="48%" stop-color="#08d9e8" stop-opacity="0.78" />
        <stop offset="76%" stop-color="#ff2b7f" stop-opacity="0.82" />
        <stop offset="100%" stop-color="#ff2b7f" />
      </linearGradient>
    </defs>
    <path class="tactical-window-frame__glow" />
    <path class="tactical-window-frame__line" />
  </svg>
  <header class="titlebar">
    <div class="titlebar__brand">
      <img class="titlebar__logo" src="${palcmSymbolUrl}" alt="" />
      <span class="titlebar__product">${escapeHtml(APP_INFO.displayName)}</span>
      <span class="titlebar__version">${escapeHtml(APP_VERSION_LABEL)}</span>
    </div>
    <div class="titlebar__signal" aria-hidden="true">
      <span></span><span></span><span></span>
    </div>
    <div class="titlebar__spacer"></div>
  </header>
  <aside class="sidebar">
    <section class="sidebar__identity">
      <img class="sidebar__logo" src="${palcmLogoUrl}" alt="" />
      <div>
        <h1>${escapeHtml(APP_INFO.shortName)}</h1>
        <p>${escapeHtml(APP_VERSION_LABEL)}</p>
        <p class="sidebar__credit">by <strong>${escapeHtml(APP_INFO.authorAlias)}</strong></p>
      </div>
      <button
        id="sidebar-toggle"
        class="sidebar-toggle"
        type="button"
        aria-label="Contraer menu lateral"
        aria-expanded="true"
        title="Contraer menu lateral"
      >${renderIcon('sidebar-collapse')}</button>
    </section>
    <nav class="sidebar__nav" aria-label="Navegacion principal">
      <a class="sidebar__link sidebar__link--active" data-nav="home" href="#">
        ${renderIcon('home', 'sidebar__link-icon')}
        <span>General</span>
      </a>
      <a class="sidebar__link sidebar__link--locked" data-nav="server" href="#">
        ${renderIcon('server', 'sidebar__link-icon')}
        <span>Servidor</span>
      </a>
      <div class="sidebar__group sidebar__group--collapsed hidden" data-nav-group="admin">
        <a class="sidebar__link sidebar__link--group sidebar__link--locked" data-nav="admin" data-admin-group-toggle="true" href="#">
          ${renderIcon('admin', 'sidebar__link-icon')}
          <span>Administracion</span>
          <span class="sidebar__chevron" aria-hidden="true"></span>
        </a>
        <div class="sidebar__subnav" aria-label="Secciones de administracion">
          <a class="sidebar__sublink sidebar__link--locked" data-nav="admin" data-admin-sidebar-tab="general" href="#">
            ${renderIcon('admin-server', 'sidebar__sublink-icon')}
            <span>Servidor</span>
          </a>
          <a class="sidebar__sublink sidebar__link--locked" data-nav="admin" data-admin-sidebar-tab="players" href="#">
            ${renderIcon('users', 'sidebar__sublink-icon')}
            <span>Jugadores</span>
          </a>
          <a class="sidebar__sublink sidebar__link--locked" data-nav="admin" data-admin-sidebar-tab="map" href="#">
            ${renderIcon('map', 'sidebar__sublink-icon')}
            <span>Mapa</span>
          </a>
        </div>
      </div>
      <a class="sidebar__link sidebar__link--locked" data-nav="network" href="#">
        ${renderIcon('network', 'sidebar__link-icon')}
        <span>Red y Firewall</span>
      </a>
      <a class="sidebar__link sidebar__link--locked" data-nav="backups" href="#">
        ${renderIcon('backup', 'sidebar__link-icon')}
        <span>Backups</span>
      </a>
      <a class="sidebar__link sidebar__link--locked" data-nav="logs" href="#">
        ${renderIcon('logs', 'sidebar__link-icon')}
        <span>Logs</span>
      </a>
      <div class="sidebar__group sidebar__group--collapsed" data-nav-group="settings">
        <a class="sidebar__link sidebar__link--group" data-nav="settings" data-settings-group-toggle="true" href="#">
          ${renderIcon('settings', 'sidebar__link-icon')}
          <span>Configuracion</span>
          <span class="sidebar__chevron" aria-hidden="true"></span>
        </a>
        <div class="sidebar__subnav" aria-label="Configuracion de la aplicacion">
          <a class="sidebar__sublink" data-nav="settings" data-settings-sidebar-tab="summary" href="#">
            ${renderIcon('dashboard', 'sidebar__sublink-icon')}
            <span>Resumen</span>
          </a>
          <a class="sidebar__sublink" data-nav="settings" data-settings-sidebar-tab="application" href="#">
            ${renderIcon('application', 'sidebar__sublink-icon')}
            <span>Aplicacion</span>
          </a>
          <a class="sidebar__sublink" data-nav="settings" data-settings-sidebar-tab="automation" href="#">
            ${renderIcon('automation', 'sidebar__sublink-icon')}
            <span>Automatizaciones</span>
          </a>
          <a class="sidebar__sublink" data-nav="settings" data-settings-sidebar-tab="remote-api" href="#">
            ${renderIcon('api', 'sidebar__sublink-icon')}
            <span>API web</span>
          </a>
        </div>
      </div>
    </nav>
    <section id="sidebar-runtime-status" class="sidebar-status sidebar-status--blocked" aria-live="polite">
      <span class="sidebar-status__dot" aria-hidden="true"></span>
      <span>
        <strong>Servidor</strong>
        <small>Bloqueado</small>
      </span>
    </section>
    <button id="start-server-action" class="primary-action" type="button" disabled>Iniciar servidor</button>
  </aside>
  <main class="workspace">
    <section class="hero">
      <p class="eyebrow">PREPARACION</p>
      <h2 id="hero-title">Preparando entorno</h2>
      <p id="hero-subtitle">Verificando dependencias, rutas y archivos necesarios para administrar el servidor.</p>
    </section>
    <section class="panel">
      <div class="panel__header">
        <span>Estado de aplicacion</span>
        <strong id="status-label">${ApplicationStatus.BOOTSTRAPPING}</strong>
      </div>
      <div class="progress"><div id="progress-bar" class="progress__bar"></div></div>
      <details id="process-metrics-panel" class="process-metrics hidden">
        <summary class="process-metrics__summary">
          <span>Procesos de PSM Console</span>
          <small>CPU, memoria y funciones internas</small>
        </summary>
        <div class="process-metrics__body" aria-live="polite">
          <div class="process-metrics__header">
            <strong>Consumo actual</strong>
            <button id="refresh-process-metrics" class="secondary-button icon-button" type="button" aria-label="Actualizar procesos" title="Actualizar procesos">
              ${renderIcon('refresh')}
            </button>
          </div>
          <div id="process-metrics-list" class="process-metrics__grid">
            <p class="empty-state empty-state--compact">Abre este detalle para revisar los subprocesos.</p>
          </div>
        </div>
      </details>
      <div class="console-shell">
        <button id="export-console" class="console-export icon-button" type="button" aria-label="Exportar consola" title="Exportar consola">
          ${renderIcon('download')}
        </button>
        <div class="console-tools">
          <input id="console-search" type="search" placeholder="Buscar en logs" aria-label="Buscar en logs" />
          <select id="console-module-filter" aria-label="Filtrar modulo de logs">
            <option value="all">Todos</option>
            <option value="manager">App</option>
            <option value="steamcmd">SteamCMD</option>
            <option value="palserver">Servidor</option>
            <option value="firewall">Firewall</option>
            <option value="backup">Backups</option>
            <option value="error">Errores</option>
          </select>
          <button id="pause-console" class="console-tool-button icon-button" type="button" aria-label="Pausar logs" aria-pressed="false" title="Pausar logs">
            ${renderIcon('pause')}
          </button>
          <button id="clear-console" class="console-tool-button icon-button" type="button" aria-label="Limpiar vista" title="Limpiar vista">
            ${renderIcon('clear')}
          </button>
          <button id="open-log-history" class="console-tool-button icon-button" type="button" aria-label="Abrir logs anteriores" title="Abrir logs anteriores">
            ${renderIcon('clock')}
          </button>
        </div>
        <div id="log-history-panel" class="log-history-panel hidden"></div>
        <div id="historical-log-banner" class="historical-log-banner hidden"></div>
        <pre id="console-output" class="log">Consultando IPC seguro...</pre>
      </div>
      <div id="confirmation-panel" class="confirmation-panel hidden">
        <div>
          <div class="confirmation-panel__eyebrow" id="confirmation-kind">ACCION REQUERIDA</div>
          <h3 id="confirmation-title">Confirmar accion</h3>
          <p id="confirmation-message">La accion requiere confirmacion explicita.</p>
          <dl class="confirmation-panel__details">
            <div>
              <dt>Origen</dt>
              <dd id="confirmation-source">-</dd>
            </div>
            <div>
              <dt>Destino</dt>
              <dd id="confirmation-target">-</dd>
            </div>
          </dl>
        </div>
        <div class="action-row">
          <button id="confirm-action" class="primary-button" type="button">Aceptar y continuar</button>
          <button id="cancel-action" class="secondary-button" type="button">Cancelar</button>
          <span id="operation-message" class="operation-message" aria-live="polite">Sin operacion activa.</span>
        </div>
      </div>
      <div id="content-view" class="content-view hidden" role="main" tabindex="-1"></div>
    </section>
  </main>
  <footer id="app-footer" class="app-footer hidden"></footer>
  <p id="view-announcer" class="sr-only" aria-live="polite" aria-atomic="true"></p>
  <div id="toast-region" class="toast-region" aria-live="polite" aria-atomic="true"></div>
`;

const palcmApi = window.palcm;

const statusLabel = document.querySelector('#status-label');
const portableRoot = document.querySelector('#portable-root');
const heroEyebrow = document.querySelector('.eyebrow');
const heroTitle = document.querySelector('#hero-title');
const heroSubtitle = document.querySelector('#hero-subtitle');
const panelStatusHeader = document.querySelector('.panel__header');
const consoleOutput = document.querySelector<HTMLPreElement>('#console-output');
const exportConsoleButton = document.querySelector<HTMLButtonElement>('#export-console');
const consoleSearchInput = document.querySelector<HTMLInputElement>('#console-search');
const consoleModuleFilter = document.querySelector<HTMLSelectElement>('#console-module-filter');
const pauseConsoleButton = document.querySelector<HTMLButtonElement>('#pause-console');
const clearConsoleButton = document.querySelector<HTMLButtonElement>('#clear-console');
const openLogHistoryButton = document.querySelector<HTMLButtonElement>('#open-log-history');
const logHistoryPanel = document.querySelector<HTMLDivElement>('#log-history-panel');
const historicalLogBanner = document.querySelector<HTMLDivElement>('#historical-log-banner');
const processMetricsPanel = document.querySelector<HTMLElement>('#process-metrics-panel');
const processMetricsList = document.querySelector<HTMLElement>('#process-metrics-list');
const refreshProcessMetricsButton = document.querySelector<HTMLButtonElement>('#refresh-process-metrics');
const progressBar = document.querySelector<HTMLDivElement>('#progress-bar');
const steamCmdFooter = document.querySelector('#steamcmd-footer');
const operationMessage = document.querySelector('#operation-message');
const confirmationPanel = document.querySelector<HTMLDivElement>('#confirmation-panel');
const confirmationKind = document.querySelector('#confirmation-kind');
const confirmationTitle = document.querySelector('#confirmation-title');
const confirmationMessage = document.querySelector('#confirmation-message');
const confirmationSource = document.querySelector('#confirmation-source');
const confirmationTarget = document.querySelector('#confirmation-target');
const confirmActionButton = document.querySelector<HTMLButtonElement>('#confirm-action');
const cancelActionButton = document.querySelector<HTMLButtonElement>('#cancel-action');
const contentView = document.querySelector<HTMLDivElement>('#content-view');
const appFooter = document.querySelector<HTMLElement>('#app-footer');
const viewAnnouncer = document.querySelector<HTMLElement>('#view-announcer');
const toastRegion = document.querySelector<HTMLElement>('#toast-region');
const sidebarRuntimeStatus = document.querySelector<HTMLElement>('#sidebar-runtime-status');
const startServerAction = document.querySelector<HTMLButtonElement>('#start-server-action');
const sidebarToggle = document.querySelector<HTMLButtonElement>('#sidebar-toggle');
const navLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-nav]'));
const adminNavGroup = document.querySelector<HTMLElement>('[data-nav-group="admin"]');
const settingsNavGroup = document.querySelector<HTMLElement>('[data-nav-group="settings"]');
const consoleLines: string[] = [];
const operationLogOffsets = new Map<string, number>();
let latestFirewallStatus: FirewallStatusDto | null = null;
let firewallStatusRequest: Promise<FirewallStatusDto> | null = null;
let latestFirewallError: string | null = null;
let activeFirewallRequestId: string | null = null;
const firewallDiagnosticProgress = new Map<FirewallDiagnosticStepId, FirewallDiagnosticProgressDto>();
let latestFirewallCheckedAt: Date | null = null;
let latestLocalAddresses: string[] = [];
let latestPublicNetwork: NetworkDiagnosticsDto | null = null;
let latestPublicNetworkError: string | null = null;
let publicNetworkRequest: Promise<NetworkDiagnosticsDto> | null = null;
let latestPublicNetworkPort: string | null = null;
let publicNetworkRequestPort: string | null = null;
let latestConfiguredPort: string | null = null;
let latestBackupSummary: BackupSummaryDto | null = null;
let latestUpdateStatus: AppUpdateStatusDto | null = null;
let latestPalworldUpdateStatus: PalworldUpdateStatusDto | null = null;
let updateStatusRequest: Promise<AppUpdateStatusDto> | null = null;
let announcedUpdateVersion: string | null = null;
let adminRefreshTimer: number | null = null;
let remoteApiConnectionRefreshTimer: number | null = null;
let generalRemoteApiRefreshTimer: number | null = null;
let remoteApiSaveStatusTimer: number | null = null;
let latestRemoteApiStatus: RemoteApiStatusDto | null = null;
let remoteApiUpdateQueue: Promise<void> = Promise.resolve();
const remoteApiAutosaveTimers: Record<'ADMIN' | 'CLIENT', number | null> = {
  ADMIN: null,
  CLIENT: null
};
let adminStatusRequest: Promise<[PalworldAdminStatusDto, PalworldPlayersStatusDto]> | null = null;
const adminViewState = new AdminViewState();
const settingsViewState = new SettingsViewState();
let consoleSearchTerm = '';
let consoleSelectedModule: LogModule | 'all' = 'all';
let consolePaused = false;
let latestPersistentLogsSignature = '';
let historicalLogLines: string[] | null = null;
let selectedHistoricalLog: LogFileSummaryDto | null = null;
let settingInfoDismissBound = false;
let latestServerSettings: ParsedPalworldSettings | null = null;
let latestServerSettingsPath: string | null = null;
let serverConfigurationDraft: { path: string; content: string } | null = null;
let configurationAutoCreateAttempted = false;
let pendingAction: 'steamcmd' | 'server' | 'config' | null = null;
let activeCancellableOperationId: string | null = null;
const navigationState = new NavigationState();
let latestStatus: ApplicationStatus = ApplicationStatus.BOOTSTRAPPING;
let latestActions: AllowedActionsDto | null = null;
let lastCopyToast: { value: string; copiedAt: number } | null = null;
let confirmationReturnFocus: HTMLElement | null = null;
let confirmationFocusActive = false;
let inlineConfirmationReturnFocus: HTMLElement | null = null;
let activeViewRenderId = 0;
let runtimeStateRefreshTimer: number | null = null;
let latestSummary: {
  steamCmdStatus: string;
  serverStatus: string;
  configurationStatus: string;
  configurationPath: string;
  serverPath: string;
} | null = null;

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'palcm:sidebar-collapsed';
const SIDEBAR_COMPACT_BREAKPOINT = 1007;
const SIDEBAR_SMALL_BREAKPOINT = 640;
const SHORT_WINDOW_BREAKPOINT = 850;
let sidebarPreference: boolean | null = null;
let sidebarOverlayOpen = false;

initializeSidebar();
initializeTacticalWindowFrame();

const FIREWALL_DIAGNOSTIC_ORDER: FirewallDiagnosticStepId[] = [
  'configuration',
  'windows-firewall',
  'public-network',
  'query-port',
  'summary'
];

if (!palcmApi) {
  showIpcError('El preload seguro no expuso window.palcm. Revisar preload, sandbox y build.');
} else {
  palcmApi.firewall.onDiagnosticProgress(updateFirewallDiagnosticProgress);
  palcmApi.server.onRuntimeStatusChanged(scheduleRuntimeStateRefresh);
  await refreshState();

  confirmActionButton?.addEventListener('click', () => {
    runUiAction('No se pudo ejecutar la accion pendiente', runPendingAction);
  });

  cancelActionButton?.addEventListener('click', () => {
    appendConsoleLine('Accion cancelada por el usuario.');
    hideConfirmation();
  });

  exportConsoleButton?.addEventListener('click', exportConsole);
  consoleSearchInput?.addEventListener('input', () => {
    consoleSearchTerm = consoleSearchInput.value.trim().toLowerCase();
    renderConsoleOutput();
  });
  consoleModuleFilter?.addEventListener('change', () => {
    consoleSelectedModule = parseConsoleModuleFilter(consoleModuleFilter.value);
    latestPersistentLogsSignature = '';
    if (navigationState.is('logs')) {
      void loadPersistentLogs();
    }
  });
  pauseConsoleButton?.addEventListener('click', () => {
    consolePaused = !consolePaused;
    pauseConsoleButton.setAttribute('aria-pressed', consolePaused ? 'true' : 'false');
    pauseConsoleButton.setAttribute('aria-label', consolePaused ? 'Reanudar logs' : 'Pausar logs');
    pauseConsoleButton.title = consolePaused ? 'Reanudar logs' : 'Pausar logs';
    pauseConsoleButton.innerHTML = consolePaused ? renderIcon('play') : renderIcon('pause');
    renderConsoleOutput();
  });
  clearConsoleButton?.addEventListener('click', () => {
    if (selectedHistoricalLog) {
      return;
    }
    consoleLines.splice(0, consoleLines.length);
    operationLogOffsets.clear();
    latestPersistentLogsSignature = '';
    renderConsoleOutput();
  });
  openLogHistoryButton?.addEventListener('click', () => {
    void toggleLogHistory();
  });
  refreshProcessMetricsButton?.addEventListener('click', () => {
    void loadAppProcessMetrics();
  });
  startServerAction?.addEventListener('click', () => {
    if (!latestActions) {
      return;
    }
    const action = resolveServerActionState(latestStatus, latestActions).action;
    if (action === 'stop') {
      runUiAction('No se pudo detener el servidor', stopPalworldServer);
      return;
    }
    if (action === 'start') {
      runUiAction('No se pudo iniciar el servidor', startPalworldServer);
    }
  });

  navLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();

      if (link.getAttribute('aria-disabled') === 'true') {
        return;
      }

      const nextView = link.dataset['nav'] ?? 'home';
      if (nextView === 'admin') {
        adminViewState.setMenuOpen(true);
        const requestedAdminTab = link.dataset['adminSidebarTab'];
        if (isAdminTab(requestedAdminTab)) {
          adminViewState.setTab(requestedAdminTab);
        }
      }
      if (nextView === 'settings') {
        settingsViewState.setMenuOpen(true);
        const requestedSettingsTab = link.dataset['settingsSidebarTab'];
        if (isSettingsTab(requestedSettingsTab)) {
          settingsViewState.setTab(requestedSettingsTab);
        }
      }

      if (navigationState.is('server') && nextView !== 'server') {
        rememberServerConfigurationDraft();
      }

      navigationState.set(nextView);
      renderActiveView();
      updateNavigation(latestStatus);
      announceAndFocusView();
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') {
      return;
    }
    closeSettingInfoPanels();
    closeActiveFooterConfirmation();
    hideFirewallConfirmation();
    hideQueryPortStopConfirmation();
  });

  observeConfirmationFocus();
}

function scheduleRuntimeStateRefresh(): void {
  if (runtimeStateRefreshTimer !== null) {
    window.clearTimeout(runtimeStateRefreshTimer);
  }

  runtimeStateRefreshTimer = window.setTimeout(() => {
    runtimeStateRefreshTimer = null;
    void synchronizeRuntimeState();
  }, 50);
}

function initializeSidebar(): void {
  sidebarPreference = readStoredSidebarState();
  synchronizeResponsiveLayout();

  sidebarToggle?.addEventListener('click', () => {
    if (isCompactWindow()) {
      sidebarOverlayOpen = !sidebarOverlayOpen;
      synchronizeResponsiveLayout();
      return;
    }

    sidebarPreference = !rootElement.classList.contains('app--sidebar-collapsed');
    setSidebarCollapsed(sidebarPreference);
  });

  window.addEventListener('resize', () => {
    synchronizeResponsiveLayout();
  });

  navLinks.forEach((link) => {
    const label = link.querySelector<HTMLElement>('span:not(.sidebar__chevron)')?.textContent.trim();
    if (label) {
      link.title = label;
    }
    link.addEventListener('click', () => {
      if (link.hasAttribute('data-admin-group-toggle') || link.hasAttribute('data-settings-group-toggle')) {
        return;
      }
      if (!isCompactWindow() || !sidebarOverlayOpen) {
        return;
      }
      sidebarOverlayOpen = false;
      synchronizeResponsiveLayout();
    });
  });
}

function isCompactWindow(): boolean {
  return window.innerWidth <= SIDEBAR_COMPACT_BREAKPOINT;
}

function synchronizeResponsiveLayout(): void {
  const compactWidth = isCompactWindow();
  const smallWidth = window.innerWidth <= SIDEBAR_SMALL_BREAKPOINT;
  const shortHeight = window.innerHeight <= SHORT_WINDOW_BREAKPOINT;

  rootElement.classList.toggle('app--responsive-compact', compactWidth);
  rootElement.classList.toggle('app--responsive-small', smallWidth);
  rootElement.classList.toggle('app--responsive-short', shortHeight);

  if (!compactWidth) {
    sidebarOverlayOpen = false;
  }

  rootElement.classList.toggle('app--sidebar-overlay-open', compactWidth && sidebarOverlayOpen);
  const collapsed = compactWidth
    ? !sidebarOverlayOpen
    : (sidebarPreference ?? window.innerWidth <= 1180);
  setSidebarCollapsed(collapsed, false);
}

function initializeTacticalWindowFrame(): void {
  const frame = rootElement.querySelector<SVGSVGElement>('.tactical-window-frame');
  const paths = Array.from(
    rootElement.querySelectorAll<SVGPathElement>(
      '.tactical-window-frame__glow, .tactical-window-frame__line'
    )
  );

  if (!frame || paths.length === 0) {
    return;
  }

  const syncFrame = (): void => {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const titlebar = rootElement.querySelector<HTMLElement>('.titlebar');
    const titlebarRect = titlebar?.getBoundingClientRect();
    const edge = 1;
    const cut = 28;
    const nativeControlsWidth = Math.max(
      0,
      Math.round(width - (titlebarRect?.right ?? width - 138))
    );
    const titlebarHeight = Math.max(48, Math.round(titlebarRect?.height ?? 48));
    const topLeftWing = width * 0.28;
    const bottomLeftWing = width * 0.22;
    const bottomRightWing = width * 0.86;
    const controlDockStart = width - nativeControlsWidth;

    rootElement.style.setProperty('--native-controls-width', `${String(nativeControlsWidth)}px`);
    rootElement.style.setProperty('--native-titlebar-height', `${String(titlebarHeight)}px`);
    document.body.style.setProperty('--native-controls-width', `${String(nativeControlsWidth)}px`);
    document.body.style.setProperty('--native-titlebar-height', `${String(titlebarHeight)}px`);

    const points: Array<readonly [number, number]> = [
      [cut, edge],
      [topLeftWing, edge],
      [topLeftWing + cut, cut],
      [controlDockStart - 40, cut],
      [controlDockStart - 12, edge],
      [controlDockStart, edge],
      [controlDockStart, titlebarHeight],
      [width - edge, titlebarHeight],
      [width - edge, height - cut],
      [width - cut, height - edge],
      [bottomRightWing, height - edge],
      [bottomRightWing - cut, height - cut],
      [bottomLeftWing + cut, height - cut],
      [bottomLeftWing, height - edge],
      [cut, height - edge],
      [edge, height - cut],
      [edge, cut]
    ];
    const path = `M ${points
      .map(([x, y]) => `${String(x)} ${String(y)}`)
      .join(' L ')} Z`;

    frame.setAttribute('viewBox', `0 0 ${String(width)} ${String(height)}`);
    paths.forEach((framePath) => {
      framePath.setAttribute('d', path);
    });
  };

  syncFrame();
  window.addEventListener('resize', syncFrame);
}

function readStoredSidebarState(): boolean | null {
  try {
    const storedValue = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
    if (storedValue === null) {
      return null;
    }
    return storedValue === 'true';
  } catch {
    return null;
  }
}

function setSidebarCollapsed(collapsed: boolean, persist = true): void {
  rootElement.classList.toggle('app--sidebar-collapsed', collapsed);

  if (sidebarToggle) {
    const label = collapsed ? 'Expandir menu lateral' : 'Contraer menu lateral';
    sidebarToggle.innerHTML = renderIcon(collapsed ? 'sidebar-expand' : 'sidebar-collapse');
    sidebarToggle.setAttribute('aria-label', label);
    sidebarToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    sidebarToggle.title = label;
  }

  if (!persist) {
    return;
  }

  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed));
  } catch {
    // The menu remains functional for the current session when storage is unavailable.
  }
}

async function synchronizeRuntimeState(): Promise<void> {
  const previousStatus = latestStatus;
  await refreshStatusChrome();

  if (
    latestStatus !== previousStatus
    && (navigationState.is('home') || navigationState.is('admin'))
  ) {
    renderActiveView();
  }
}

async function refreshState(): Promise<void> {
  if (!palcmApi) {
    return;
  }

  try {
    const status = await palcmApi.app.getStatus();
    const actions = await palcmApi.app.getActions();
    const steamCmd = await palcmApi.steamCmd.getStatus();
    const server = await palcmApi.server.getInstallationStatus();
    const config = await palcmApi.config.getStatus();
    latestStatus = status.status;
    latestActions = actions;
    latestSummary = {
      steamCmdStatus: steamCmd.status,
      serverStatus: server.status,
      configurationStatus: config.status,
      configurationPath: config.activePath,
      serverPath: server.executablePath
    };

    setText(statusLabel, status.status);
    setText(portableRoot, `Portable Path: ${status.portableRoot}`);
    setText(steamCmdFooter, `SteamCMD: ${steamCmd.status}`);
    renderHero(status.status);
    setProgressForStatus(status.status);
    appendConsoleLine(`Estado: ${status.status}`);
    appendConsoleLine(`Raiz de ejecucion: ${status.portableRoot}`);
    appendConsoleLine(`SteamCMD: ${steamCmd.status} - ${steamCmd.executablePath}`);
    appendConsoleLine(`Servidor Palworld: ${server.status} - ${server.executablePath}`);
    appendConsoleLine(`Configuracion: ${config.status} - ${config.activePath}`);
    updateNavigation(status.status);
    updateStartServerButton(actions);

    if (actions.canInstallSteamCmd) {
      showPreflight();
      showSteamCmdConfirmation(steamCmd.officialDownloadUrl, steamCmd.installDirectory);
      return;
    }

    if (actions.canInstallServer) {
      showPreflight();
      showServerConfirmation(server.appId, server.installDirectory);
      return;
    }

    if (status.status === ApplicationStatus.CONFIGURATION_MISSING) {
      showPreflight();
      if (!configurationAutoCreateAttempted) {
        configurationAutoCreateAttempted = true;
        hideConfirmation();
        appendConsoleLine('Configuracion activa ausente o invalida. Creando base default del INI.');
        runUiAction(
          'No se pudo crear la configuracion inicial',
          () => createDefaultConfiguration({ automatic: true })
        );
        return;
      }

      showConfigConfirmation(config.templatePath, config.activePath);
      return;
    }

    hideConfirmation();
    renderActiveView();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showIpcError(`No se pudo consultar IPC seguro: ${message}`);
  }
}

async function refreshStatusChrome(): Promise<void> {
  if (!palcmApi) {
    return;
  }

  try {
    const status = await palcmApi.app.getStatus();
    const actions = await palcmApi.app.getActions();
    latestStatus = status.status;
    latestActions = actions;
    setText(statusLabel, status.status);
    renderHero(status.status);
    setProgressForStatus(status.status);
    updateNavigation(status.status);
    updateStartServerButton(actions);
  } catch (error) {
    appendConsoleLine(`No se pudo actualizar el estado runtime: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function showPreflight(): void {
  appFooter?.classList.add('hidden');
  rootElement.classList.remove('app--footer-visible', 'app--wide');
  document.querySelector('.hero')?.classList.remove('hidden');
  panelStatusHeader?.classList.remove('hidden');
  progressBar?.parentElement?.classList.remove('hidden');
  contentView?.classList.add('hidden');
  document.querySelector('.console-shell')?.classList.remove('hidden');
  document.querySelector('.console-tools')?.classList.add('hidden');
}

async function runPendingAction(): Promise<void> {
  if (!palcmApi) {
    return;
  }

  if (pendingAction === 'steamcmd') {
    await installSteamCmd();
    return;
  }

  if (pendingAction === 'server') {
    await installServer();
    return;
  }

  if (pendingAction === 'config') {
    await createDefaultConfiguration();
  }
}

async function installSteamCmd(): Promise<void> {
  if (!palcmApi) {
    return;
  }

  disableConfirmationButtons();
  appendConsoleLine('Confirmado: descargar SteamCMD.');
  const accepted = await palcmApi.steamCmd.install({ confirmed: true });
  const completed = await pollOperation(accepted.operationId);
  await refreshState();
  if (!completed) {
    return;
  }
}

async function installServer(): Promise<void> {
  if (!palcmApi) {
    return;
  }

  disableConfirmationButtons();
  appendConsoleLine('Confirmado: instalar Palworld Dedicated Server.');
  const accepted = await palcmApi.server.install({ confirmed: true });
  const completed = await pollOperation(accepted.operationId);
  await refreshState();
  if (!completed) {
    return;
  }
}

async function createDefaultConfiguration(options: { automatic?: boolean } = {}): Promise<void> {
  if (!palcmApi) {
    return;
  }

  if (!options.automatic) {
    disableConfirmationButtons();
    appendConsoleLine('Confirmado: crear configuracion inicial.');
  }

  const accepted = await palcmApi.config.createDefault({ confirmed: true });
  const completed = await pollOperation(accepted.operationId);
  await refreshState();
  if (!completed) {
    return;
  }
}

async function startPalworldServer(): Promise<void> {
  if (!palcmApi || !latestActions?.canStartServer) {
    appendConsoleLine('No se inicio el servidor: el estado actual no permite iniciar desde la app.');
    return;
  }

  appendConsoleLine('Confirmado: iniciar Palworld Dedicated Server.');
  navigationState.set('logs');
  renderActiveView();
  updateStartServerButton({
    ...latestActions,
    canStartServer: false
  });

  try {
    const accepted = await palcmApi.server.start({ confirmed: true });
    await refreshStatusChrome();
    window.setTimeout(() => {
      void refreshStatusChrome();
    }, 1000);
    void pollOperation(accepted.operationId, { refreshStatusWhileRunning: true });
  } catch (error) {
    appendConsoleLine(`No se pudo iniciar el servidor: ${error instanceof Error ? error.message : String(error)}`);
    await refreshStatusChrome();
  }
}

async function stopPalworldServer(): Promise<void> {
  if (!palcmApi || !latestActions?.canStopServer) {
    appendConsoleLine('No se detuvo el servidor: el estado actual no permite detenerlo desde la app.');
    return;
  }

  appendConsoleLine('Confirmado: detener Palworld Dedicated Server.');
  navigationState.set('logs');
  renderActiveView();
  updateStartServerButton({
    ...latestActions,
    canStopServer: false
  });

  try {
    const accepted = await palcmApi.server.stop({ confirmed: true });
    await refreshStatusChrome();
    await pollOperation(accepted.operationId, { refreshStatusWhileRunning: true });
  } catch (error) {
    appendConsoleLine(`No se pudo detener el servidor: ${error instanceof Error ? error.message : String(error)}`);
    await refreshStatusChrome();
  }
}

async function pollOperation(
  operationId: string,
  options: { refreshStatusWhileRunning?: boolean } = {}
): Promise<boolean> {
  if (!palcmApi) {
    return false;
  }

  activeCancellableOperationId = operationId;

  try {
    for (;;) {
      const operation = await palcmApi.operation.get(operationId);
      renderOperation(operation);

      if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(operation.status)) {
        const failureMessage = getOperationFailureMessage(operation);
        if (failureMessage) {
          appendConsoleLine(`${operation.title}: ${failureMessage}`);
          showToast(
            operation.status === 'CANCELLED' ? 'Operacion cancelada' : `Operacion fallida: ${failureMessage}`,
            operation.status === 'FAILED' ? 'error' : 'info'
          );
        }
        return isOperationSuccessful(operation);
      }

      if (options.refreshStatusWhileRunning) {
        await refreshStatusChrome();
      }

      await wait(500);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendConsoleLine(`No se pudo consultar la operacion: ${message}`);
    showToast('No se pudo consultar el progreso de la operacion', 'error');
    return false;
  } finally {
    activeCancellableOperationId = null;
    updateFooterChrome();
    if (options.refreshStatusWhileRunning) {
      await refreshStatusChrome();
    }
  }
}

function renderOperation(operation: OperationProgressDto): void {
  setText(operationMessage, `${String(operation.percent)}% - ${operation.message}`);
  appendOperationLogs(operation);

  if (progressBar) {
    progressBar.style.width = `${String(operation.percent)}%`;
  }

  if (operation.canCancel && !['COMPLETED', 'FAILED', 'CANCELLED'].includes(operation.status)) {
    renderOperationCancellationFooter(operation);
  }
}

function renderOperationCancellationFooter(operation: OperationProgressDto): void {
  if (!appFooter) {
    return;
  }

  rootElement.classList.add('app--footer-visible');
  appFooter.classList.remove('app-footer--server');
  appFooter.classList.remove('hidden', 'app-footer--confirm');
  appFooter.innerHTML = `
    <span class="app-footer__message">${escapeHtml(operation.message)}</span>
    <button id="cancel-running-operation" class="secondary-button secondary-button--warning button-with-icon" type="button">
      ${renderIcon('x')}
      <span>Cancelar</span>
    </button>
  `;
  document.querySelector<HTMLButtonElement>('#cancel-running-operation')?.addEventListener('click', () => {
    runUiAction('No se pudo cancelar la operacion', cancelRunningOperation);
  });
}

async function cancelRunningOperation(): Promise<void> {
  if (!palcmApi || !activeCancellableOperationId) {
    return;
  }

  const operationId = activeCancellableOperationId;
  activeCancellableOperationId = null;
  try {
    const operation = await palcmApi.operation.cancel({ operationId });
    renderOperation(operation);
    showToast('Cancelacion solicitada');
  } catch (error) {
    activeCancellableOperationId = operationId;
    showToast(error instanceof Error ? error.message : String(error), 'error');
  }
}

function showIpcError(message: string): void {
  setText(statusLabel, ApplicationStatus.ERROR);

  if (consoleOutput) {
    consoleOutput.textContent = message;
    consoleOutput.classList.add('log--error');
  }
}

function renderHero(status: ApplicationStatus): void {
  if (status === ApplicationStatus.SERVER_STARTING) {
    setText(heroEyebrow, 'SERVER');
    setText(heroTitle, 'Servidor iniciando');
    setText(heroSubtitle, 'PalServer.exe se esta ejecutando. Revisa la pestana Logs para ver la salida en tiempo real.');
    return;
  }

  if (status === ApplicationStatus.SERVER_RUNNING) {
    setText(heroEyebrow, 'SERVER');
    setText(heroTitle, 'Servidor en ejecucion');
    setText(heroSubtitle, 'El servidor esta activo. Puedes compartir la IP LAN cuando Juego local figure correcto.');
    return;
  }

  if (status === ApplicationStatus.ERROR) {
    setText(heroEyebrow, 'SERVER');
    setText(heroTitle, 'Servidor con error');
    setText(heroSubtitle, 'Revisa Logs para ver el ultimo mensaje y vuelve a iniciar cuando el entorno local este correcto.');
    return;
  }

  if (status === ApplicationStatus.READY) {
    setText(heroEyebrow, 'GENERAL');
    setText(heroTitle, 'Entorno listo');
    setText(heroSubtitle, 'SteamCMD, servidor, configuracion y acciones principales estan disponibles.');
    return;
  }

  if (status === ApplicationStatus.CONFIGURATION_MISSING) {
    setText(heroEyebrow, 'PREPARACION');
    setText(heroTitle, 'Entorno base listo');
    setText(heroSubtitle, 'SteamCMD y el servidor estan instalados. Falta preparar la configuracion inicial.');
    return;
  }

  setText(heroEyebrow, 'PREPARACION');
  setText(heroTitle, 'Preparando entorno');
  setText(heroSubtitle, 'Verificando dependencias, rutas y archivos necesarios para administrar el servidor.');
}

function setProgressForStatus(status: ApplicationStatus): void {
  const statusProgress: Partial<Record<ApplicationStatus, number>> = {
    [ApplicationStatus.STEAMCMD_MISSING]: 25,
    [ApplicationStatus.STEAMCMD_INSTALLING]: 40,
    [ApplicationStatus.SERVER_MISSING]: 60,
    [ApplicationStatus.SERVER_INSTALLING]: 75,
    [ApplicationStatus.CONFIGURATION_MISSING]: 90,
    [ApplicationStatus.READY]: 100,
    [ApplicationStatus.SERVER_STARTING]: 100,
    [ApplicationStatus.SERVER_RUNNING]: 100,
    [ApplicationStatus.ERROR]: 100
  };

  if (progressBar) {
    progressBar.style.width = `${String(statusProgress[status] ?? 15)}%`;
  }
}

function showSteamCmdConfirmation(source: string, target: string): void {
  pendingAction = 'steamcmd';
  showConfirmation({
    kind: 'STEAMCMD',
    title: 'Descargar SteamCMD',
    message: 'SteamCMD no esta instalado. Para continuar se descargara desde el sitio oficial de Valve.',
    source,
    target
  });
}

function showServerConfirmation(appId: string, target: string): void {
  pendingAction = 'server';
  showConfirmation({
    kind: 'PALWORLD SERVER',
    title: 'Instalar servidor Palworld',
    message: `SteamCMD instalara Palworld Dedicated Server usando AppID ${appId}.`,
    source: `SteamCMD app_update ${appId} validate`,
    target
  });
}

function showConfigConfirmation(source: string, target: string): void {
  pendingAction = 'config';
  showConfirmation({
    kind: 'CONFIGURACION',
    title: 'Crear configuracion inicial',
    message: 'El servidor ya esta instalado. Falta crear el archivo de configuracion activo desde la plantilla.',
    source,
    target
  });
}

function showConfirmation(details: {
  kind: string;
  title: string;
  message: string;
  source: string;
  target: string;
}): void {
  confirmationPanel?.classList.remove('hidden');
  setText(confirmationKind, details.kind);
  setText(confirmationTitle, details.title);
  setText(confirmationMessage, details.message);
  setText(confirmationSource, details.source);
  setText(confirmationTarget, details.target);

  if (confirmActionButton) {
    confirmActionButton.disabled = false;
  }

  if (cancelActionButton) {
    cancelActionButton.disabled = false;
  }
}

function hideConfirmation(): void {
  pendingAction = null;
  confirmationPanel?.classList.add('hidden');
}

function disableConfirmationButtons(): void {
  if (confirmActionButton) {
    confirmActionButton.disabled = true;
  }

  if (cancelActionButton) {
    cancelActionButton.disabled = true;
  }
}

function appendOperationLogs(operation: OperationProgressDto): void {
  const offset = operationLogOffsets.get(operation.operationId) ?? 0;
  const nextLines = operation.logs.slice(offset);
  operationLogOffsets.set(operation.operationId, operation.logs.length);
  nextLines.forEach((line) => {
    appendConsoleLine(line, false);
  });
}

function appendConsoleLine(line: string, includeTimestamp = true): void {
  const text = includeTimestamp ? `[${formatLocalLogTimestamp()}] ${line}` : line;
  consoleLines.push(text);

  if (consoleLines.length > 500) {
    consoleLines.splice(0, consoleLines.length - 500);
  }

  renderConsoleOutput();
}

function renderConsoleOutput(): void {
  if (!consoleOutput) {
    return;
  }

  const sourceLines = historicalLogLines ?? consoleLines;
  const visibleLines = consoleSearchTerm
    ? sourceLines.filter((line) => line.toLowerCase().includes(consoleSearchTerm))
    : sourceLines;

  consoleOutput.textContent = visibleLines.join('\n');

  if (!consolePaused) {
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
  }
}

function updateNavigation(status: ApplicationStatus): void {
  const serverAvailable = ![
    ApplicationStatus.STEAMCMD_MISSING,
    ApplicationStatus.SERVER_MISSING
  ].includes(status);
  const logsAvailable = serverAvailable;
  const serverRunning = status === ApplicationStatus.SERVER_RUNNING;

  if (navigationState.is('admin') && !serverRunning) {
    navigationState.set('home');
    adminViewState.setMenuOpen(false);
  }

  navLinks.forEach((link) => {
    const nav = link.dataset['nav'];
    const enabled =
      nav === 'home' ||
      nav === 'settings' ||
      (nav === 'server' && serverAvailable) ||
      (nav === 'admin' && serverRunning) ||
      (nav === 'logs' && logsAvailable) ||
      (nav === 'backups' && serverAvailable) ||
      (nav === 'network' && serverAvailable);

    link.classList.toggle('sidebar__link--locked', !enabled);
    link.classList.toggle('sidebar__link--active', isSidebarNavActive(link));
    link.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    link.tabIndex = enabled ? 0 : -1;
    if (isSidebarNavActive(link)) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  });

  if (adminNavGroup) {
    adminNavGroup.classList.toggle('hidden', !serverRunning);
    adminNavGroup.classList.toggle('sidebar__group--open', serverRunning && (adminViewState.isMenuOpen() || navigationState.is('admin')));
    adminNavGroup.classList.toggle('sidebar__group--collapsed', !serverRunning || (!adminViewState.isMenuOpen() && !navigationState.is('admin')));
    adminNavGroup.querySelector<HTMLElement>('[data-admin-group-toggle]')
      ?.setAttribute('aria-expanded', serverRunning && (adminViewState.isMenuOpen() || navigationState.is('admin')) ? 'true' : 'false');
  }

  if (settingsNavGroup) {
    const open = settingsViewState.isMenuOpen() || navigationState.is('settings');
    settingsNavGroup.classList.toggle('sidebar__group--open', open);
    settingsNavGroup.classList.toggle('sidebar__group--collapsed', !open);
    settingsNavGroup.querySelector<HTMLElement>('[data-settings-group-toggle]')
      ?.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
}

function isSidebarNavActive(link: HTMLAnchorElement): boolean {
  const nav = link.dataset['nav'];
  if (nav !== navigationState.current) {
    return false;
  }

  if (nav !== 'admin') {
    if (nav !== 'settings') {
      return true;
    }
    if (link.dataset['settingsGroupToggle'] === 'true') {
      return false;
    }
    const requestedSettingsTab = link.dataset['settingsSidebarTab'];
    return isSettingsTab(requestedSettingsTab) && settingsViewState.isTab(requestedSettingsTab);
  }

  if (link.dataset['adminGroupToggle'] === 'true') {
    return false;
  }

  const requestedAdminTab = link.dataset['adminSidebarTab'];
  if (!requestedAdminTab) {
    return true;
  }

  return isAdminTab(requestedAdminTab) && adminViewState.isTab(requestedAdminTab);
}

function isSettingsTab(value: string | undefined): value is SettingsTab {
  return value === 'summary' || value === 'application' || value === 'automation' || value === 'remote-api';
}

function isAdminTab(value: string | undefined): value is 'general' | 'players' | 'map' {
  return value === 'general' || value === 'players' || value === 'map';
}

function updateStartServerButton(actions: AllowedActionsDto): void {
  if (!startServerAction) {
    return;
  }
  const state = resolveServerActionState(latestStatus, actions);
  startServerAction.disabled = state.disabled;
  startServerAction.textContent = state.buttonLabel;
  startServerAction.dataset.action = state.action;
  startServerAction.title = state.buttonLabel;
  updateSidebarRuntimeStatus(state.runtimeTone, state.runtimeLabel);
}

function updateSidebarRuntimeStatus(
  tone: 'ready' | 'blocked' | 'starting' | 'running' | 'error',
  label: string
): void {
  if (!sidebarRuntimeStatus) {
    return;
  }

  sidebarRuntimeStatus.classList.remove(
    'sidebar-status--ready',
    'sidebar-status--blocked',
    'sidebar-status--starting',
    'sidebar-status--running',
    'sidebar-status--error'
  );
  sidebarRuntimeStatus.classList.add(`sidebar-status--${tone}`);

  const labelElement = sidebarRuntimeStatus.querySelector('small');
  if (labelElement) {
    labelElement.textContent = label;
  }
}

function refreshStartButtonState(): void {
  if (latestActions) {
    updateStartServerButton(latestActions);
  }
}

function isOperationalStatus(status: ApplicationStatus): boolean {
  return [
    ApplicationStatus.READY,
    ApplicationStatus.SERVER_STARTING,
    ApplicationStatus.SERVER_RUNNING,
    ApplicationStatus.ERROR
  ].includes(status);
}

function renderActiveView(): void {
  if (!latestActions) {
    return;
  }

  const renderId = ++activeViewRenderId;
  stopRuntimeViewRefreshers();
  rootElement.dataset['view'] = navigationState.current;
  hideConfirmation();
  updateReadyChrome();
  updateFooterChrome();
  updateHeroChrome();
  const isLogsView = navigationState.is('logs');
  document.querySelector('.console-shell')?.classList.toggle('hidden', !isLogsView);
  document.querySelector('.console-tools')?.classList.toggle('hidden', !isLogsView);
  processMetricsPanel?.classList.toggle('hidden', !isLogsView);
  contentView?.classList.toggle('hidden', navigationState.is('logs'));
  navLinks.forEach((link) => {
    link.classList.toggle('sidebar__link--active', isSidebarNavActive(link));
  });

  if (navigationState.is('home')) {
    void renderGeneralView(renderId);
    return;
  }

  if (navigationState.is('server')) {
    void renderServerConfigurationView(renderId);
    return;
  }

  if (navigationState.is('admin')) {
    void renderAdminView(renderId);
    return;
  }

  if (navigationState.is('network')) {
    void renderFirewallView(false, renderId);
    return;
  }

  if (navigationState.is('backups')) {
    void renderBackupsView(renderId);
    return;
  }

  if (navigationState.is('settings')) {
    void renderAppSettings(renderId);
    return;
  }

  if (navigationState.is('logs')) {
    void loadAppProcessMetrics();
    void loadPersistentLogs();
  }

}

function isCurrentViewRender(renderId: number, view: NavigationState['current']): boolean {
  return activeViewRenderId === renderId && navigationState.is(view);
}

function renderViewLoading(message: string): void {
  if (!contentView) {
    return;
  }

  contentView.querySelector('.view-loading-overlay')?.remove();
  Array.from(contentView.children).forEach((child) => {
    if (child instanceof HTMLElement) {
      child.inert = true;
    }
  });
  contentView.setAttribute('aria-busy', 'true');
  contentView.insertAdjacentHTML(
    'beforeend',
    `
      <section class="view-loading-overlay" role="status" aria-live="polite">
        <div class="view-loading-overlay__loader">
          <img src="${palcmLogoUrl}" alt="" />
          <span>${escapeHtml(message)}</span>
        </div>
      </section>
    `
  );
}

function clearViewLoadingOverlay(): void {
  if (!contentView) {
    return;
  }

  contentView.querySelector('.view-loading-overlay')?.remove();
  Array.from(contentView.children).forEach((child) => {
    if (child instanceof HTMLElement) {
      child.inert = false;
    }
  });
  contentView.removeAttribute('aria-busy');
}

async function renderGeneralView(renderId: number): Promise<void> {
  updateReadyChrome();

  if (!isOperationalStatus(latestStatus)) {
    if (isCurrentViewRender(renderId, 'home')) {
      renderPreflightSummary();
    }
    return;
  }

  renderViewLoading('ACTUALIZANDO ENTORNO');
  const [port, backupSummary, serverRuntime, playersSummary, remoteApiStatus] = await Promise.all([
    readConfiguredPort(),
    readBackupSummaryForGeneral(),
    readServerRuntimeForGeneral(),
    readPlayersStatusForGeneral(),
    readRemoteApiStatusForGeneral()
  ]);

  if (!isCurrentViewRender(renderId, 'home')) {
    return;
  }

  latestConfiguredPort = port;
  const portState = port ? createSummaryCardState('ok') : createSummaryCardState('warning');
  const isNetworkLoading = !latestFirewallStatus && !latestFirewallError;
  const localPlay = createLocalPlaySummary(latestFirewallStatus, port, isNetworkLoading, latestLocalAddresses);
  const isPublicNetworkLoading = !latestFirewallStatus && !latestFirewallError && !latestPublicNetwork && !latestPublicNetworkError;
  const publicPlay = createPublicPlaySummary(latestFirewallStatus, isPublicNetworkLoading, latestPublicNetwork, port);
  const backupState = createBackupSummaryCard(backupSummary);
  const serverState = createServerRuntimeSummary(serverRuntime);
  const playersState = createPlayersSummaryCard(playersSummary);
  const remoteApiCard = createGeneralRemoteApiCard(remoteApiStatus);
  const serverUpdateCard = createGeneralServerUpdateCard(latestPalworldUpdateStatus);
  const networkFreshness = formatLastVerification(latestFirewallCheckedAt);

  setContent(renderGeneralViewHtml({
    networkFreshness,
    update: latestUpdateStatus,
    primaryCards: [
      {
          title: 'Servidor',
          value: serverState.value,
          detail: serverState.detail,
          target: serverState.state.tone === 'error' ? 'logs' : 'server',
          ...serverState.state
      },
      serverUpdateCard,
      {
          id: 'general-local-play-card',
          title: 'Juego local',
          value: localPlay.value,
          detail: localPlay.detail,
          copyValue: localPlay.copyValue,
          target: 'network',
          ...localPlay.state
      },
      {
          id: 'general-public-play-card',
          title: 'Juego publico',
          value: publicPlay.value,
          detail: publicPlay.detail,
          copyValue: publicPlay.copyValue,
          target: 'network',
          ...publicPlay.state
      },
      remoteApiCard,
      {
          title: 'Jugadores',
          value: playersState.value,
          detail: playersState.detail,
          target: playersSummary?.status === 'SERVER_STOPPED' ? undefined : 'admin',
          adminTab: playersSummary?.status === 'SERVER_STOPPED' ? undefined : 'players',
          disabled: playersSummary?.status === 'SERVER_STOPPED',
          ...playersState.state
      }
    ],
    supportCards: [
      {
          title: 'SteamCMD',
          value: 'Instalado',
          detail: 'Cliente listo para actualizar y validar archivos.',
          target: 'logs',
          ...createSummaryCardState('ok')
      },
      {
          title: 'Configuracion',
          value: 'Activa',
          detail: latestSummary?.configurationPath ?? 'PalWorldSettings.ini disponible.',
          target: 'server',
          ...createSummaryCardState('ok')
      },
      {
          title: 'Puerto',
          value: port ? `UDP ${port}` : 'Sin validar',
          detail: port ? 'Puerto leido desde la configuracion activa.' : 'No se encontro PublicPort en el INI activo.',
          target: 'network',
          ...portState
      },
      {
          title: 'Backups',
          value: backupState.value,
          detail: backupState.detail,
          target: 'backups',
          ...backupState.state
      }
    ]
  }));
  bindSummaryCards();
  bindReleaseUpdateAction();
  void hydrateGeneralServerUpdate(renderId);
  void hydrateGeneralLocalPreview(port, renderId);
  void hydrateGeneralPublicPreview(port, renderId);
  void hydrateGeneralNetworkSummary(port, renderId);
  scheduleGeneralRemoteApiRefresh(remoteApiStatus, renderId);
  void loadReleaseUpdateStatus();
}

async function readRemoteApiStatusForGeneral(): Promise<RemoteApiStatusDto | null> {
  if (!palcmApi) {
    return null;
  }

  try {
    return await palcmApi.remoteApi.getStatus();
  } catch (error) {
    appendConsoleLine(`No se pudo leer la API web para General: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function scheduleGeneralRemoteApiRefresh(status: RemoteApiStatusDto | null, renderId: number): void {
  if (generalRemoteApiRefreshTimer !== null) {
    window.clearTimeout(generalRemoteApiRefreshTimer);
    generalRemoteApiRefreshTimer = null;
  }
  if (!shouldRefreshGeneralRemoteApi(status) || !isCurrentViewRender(renderId, 'home')) {
    return;
  }

  generalRemoteApiRefreshTimer = window.setTimeout(() => {
    generalRemoteApiRefreshTimer = null;
    void refreshGeneralRemoteApiCard(renderId);
  }, 3_000);
}

async function refreshGeneralRemoteApiCard(renderId: number): Promise<void> {
  const status = await readRemoteApiStatusForGeneral();
  if (!isCurrentViewRender(renderId, 'home')) {
    return;
  }

  const html = renderGeneralRemoteApiCard(status);
  const currentCard = document.querySelector('#general-remote-api-card');
  if (currentCard) {
    replaceSummaryCard('general-remote-api-card', html);
  } else {
    document.querySelector('#general-primary-grid')?.insertAdjacentHTML('beforeend', html);
  }
  bindSummaryCards();
  scheduleGeneralRemoteApiRefresh(status, renderId);
}

function bindReleaseUpdateAction(): void {
  document.querySelector<HTMLButtonElement>('[data-open-release="true"]')?.addEventListener('click', () => {
    if (!palcmApi) {
      return;
    }

    void palcmApi.update.openRelease()
      .then(() => {
        showToast('Se abrió la página oficial de descarga.');
      })
      .catch((error: unknown) => {
        appendConsoleLine(`No se pudo abrir la release: ${error instanceof Error ? error.message : String(error)}`);
        showToast('No se pudo abrir la página de descarga', 'error');
      });
  });
}

async function loadReleaseUpdateStatus(): Promise<void> {
  if (!palcmApi || latestUpdateStatus || updateStatusRequest) {
    return;
  }

  updateStatusRequest = palcmApi.update.getStatus();

  try {
    latestUpdateStatus = await updateStatusRequest;

    const availableVersion = latestUpdateStatus.state === 'AVAILABLE'
      ? latestUpdateStatus.latestVersion
      : undefined;
    if (availableVersion && availableVersion !== announcedUpdateVersion) {
      announcedUpdateVersion = availableVersion;
      showToast(`Nueva versión disponible: v${availableVersion}.`);
    }

    if (navigationState.is('home')) {
      const updateAction = document.querySelector<HTMLElement>('#general-update-action');
      if (updateAction) {
        updateAction.innerHTML = renderGeneralUpdateAction(latestUpdateStatus);
        bindReleaseUpdateAction();
      }
    }
  } catch (error) {
    appendConsoleLine(`No se pudo consultar actualizaciones: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    updateStatusRequest = null;
  }
}

async function readBackupSummaryForGeneral(): Promise<BackupSummaryDto | null> {
  if (!palcmApi) {
    return null;
  }

  try {
    latestBackupSummary = await palcmApi.backup.getSummary();
    return latestBackupSummary;
  } catch (error) {
    appendConsoleLine(`No se pudo leer el resumen de backups: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function readServerRuntimeForGeneral(): Promise<PalworldRuntimeStatusDto | null> {
  if (!palcmApi) {
    return null;
  }

  try {
    return await palcmApi.server.getRuntimeStatus();
  } catch (error) {
    appendConsoleLine(`No se pudo leer el runtime del servidor: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function readPlayersStatusForGeneral(): Promise<PalworldPlayersStatusDto | null> {
  if (!palcmApi) {
    return null;
  }

  try {
    return await palcmApi.players.getStatus();
  } catch (error) {
    appendConsoleLine(`No se pudo leer el monitor de jugadores: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function createServerRuntimeSummary(runtime: PalworldRuntimeStatusDto | null): SummaryCardViewModel {
  if (!runtime) {
    return {
      value: 'Instalado',
      detail: latestSummary?.serverPath ?? 'PalServer.exe detectado.',
      state: createSummaryCardState('ok')
    };
  }

  if (runtime.state === 'RUNNING') {
    return {
      value: 'Ejecutandose',
      detail: runtime.pid ? `Activo. PID ${String(runtime.pid)}.` : 'Activo detectado por la app.',
      state: createSummaryCardState('ok')
    };
  }

  if (runtime.state === 'STARTING') {
    return {
      value: 'Iniciando',
      detail: runtime.message,
      state: createSummaryCardState('loading')
    };
  }

  if (runtime.state === 'STOPPING') {
    return {
      value: 'Deteniendo',
      detail: runtime.message,
      state: createSummaryCardState('warning')
    };
  }

  if (runtime.state === 'ERROR') {
    return {
      value: 'Revisar logs',
      detail: runtime.message,
      state: createSummaryCardState('error')
    };
  }

  return {
    value: 'Detenido',
    detail: 'Listo para iniciar desde la app cuando la red local este OK.',
    state: createSummaryCardState('optional')
  };
}

function createPlayersSummaryCard(summary: PalworldPlayersStatusDto | null): SummaryCardViewModel {
  if (!summary) {
    return {
      value: 'Sin datos',
      detail: 'Abre Administracion para verificar el monitor.',
      state: createSummaryCardState('optional')
    };
  }

  if (summary.status === 'READY') {
    return {
      value: `${String(summary.currentPlayers)}${summary.maxPlayers ? `/${String(summary.maxPlayers)}` : ''}`,
      detail: summary.currentPlayers === 1 ? '1 jugador conectado.' : `${String(summary.currentPlayers)} jugadores conectados.`,
      state: createSummaryCardState('ok')
    };
  }

  if (summary.status === 'SERVER_STOPPED') {
    return {
      value: 'Servidor detenido',
      detail: 'Inicia el servidor para consultar jugadores.',
      state: createSummaryCardState('optional')
    };
  }

  if (summary.status === 'REST_CONFIGURED_RESTART_REQUIRED') {
    return {
      value: 'Reiniciar servidor',
      detail: summary.message,
      state: createSummaryCardState('warning')
    };
  }

  if (summary.status === 'REST_STARTING') {
    return {
      value: 'Esperando REST',
      detail: summary.message,
      state: createSummaryCardState('loading')
    };
  }

  if (summary.status === 'REST_DISABLED' || summary.status === 'ADMIN_PASSWORD_MISSING') {
    return {
      value: 'Configurar monitor',
      detail: summary.message,
      state: createSummaryCardState('configuration')
    };
  }

  return {
    value: 'Sin conexion',
    detail: summary.message,
    state: createSummaryCardState('warning')
  };
}

function createBackupSummaryCard(summary: BackupSummaryDto | null): SummaryCardViewModel {
  if (!summary) {
    return {
      value: 'Pendiente',
      detail: 'Abre Backups para crear el primer respaldo.',
      state: createSummaryCardState('configuration')
    };
  }

  const total = summary.configurationBackups.length + summary.worldBackups.length;

  if (total === 0) {
    return {
      value: 'Sin backups',
      detail: 'Crea un backup antes de cambios grandes o pruebas con mundos reales.',
      state: createSummaryCardState('warning')
    };
  }

  return {
    value: `${String(total)} disponibles`,
    detail: `${String(summary.configurationBackups.length)} de configuracion, ${String(summary.worldBackups.length)} del mundo.`,
    state: createSummaryCardState('ok')
  };
}

async function hydrateGeneralLocalPreview(port: string | null, renderId: number): Promise<void> {
  const addresses = await readLocalAddressesForGeneral();

  if (addresses.length > 0) {
    latestLocalAddresses = addresses;
  }
  refreshStartButtonState();

  if (!isCurrentViewRender(renderId, 'home') || !isOperationalStatus(latestStatus) || latestFirewallStatus) {
    return;
  }

  const localPlay = createLocalPlaySummary(null, port, true, latestLocalAddresses);
  replaceSummaryCard(
    'general-local-play-card',
    renderSummaryCard({
      id: 'general-local-play-card',
      title: 'Juego local',
      value: localPlay.value,
      detail: localPlay.detail,
      copyValue: localPlay.copyValue,
      target: 'network',
      ...localPlay.state
    })
  );
  bindSummaryCards();
}

async function hydrateGeneralNetworkSummary(port: string | null, renderId: number): Promise<void> {
  const firewall = await readFirewallStatusForGeneral();

  refreshStartButtonState();

  if (!isCurrentViewRender(renderId, 'home') || !isOperationalStatus(latestStatus)) {
    return;
  }

  const localPlay = createLocalPlaySummary(firewall, port, false, latestLocalAddresses);
  const publicPlay = createPublicPlaySummary(firewall, false, latestPublicNetwork, port);
  replaceSummaryCard(
    'general-local-play-card',
    renderSummaryCard({
      id: 'general-local-play-card',
      title: 'Juego local',
      value: localPlay.value,
      detail: localPlay.detail,
      copyValue: localPlay.copyValue,
      target: 'network',
      ...localPlay.state
    })
  );
  replaceSummaryCard(
    'general-public-play-card',
    renderSummaryCard({
      id: 'general-public-play-card',
      title: 'Juego publico',
      value: publicPlay.value,
      detail: publicPlay.detail,
      copyValue: publicPlay.copyValue,
      target: 'network',
      ...publicPlay.state
    })
  );
  bindSummaryCards();
}

async function hydrateGeneralPublicPreview(port: string | null, renderId: number): Promise<void> {
  const publicNetwork = await readPublicNetworkForGeneral(port);

  if (!isCurrentViewRender(renderId, 'home') || !isOperationalStatus(latestStatus) || latestFirewallStatus) {
    return;
  }

  const publicPlay = createPublicPlaySummary(null, false, publicNetwork, port);
  replaceSummaryCard(
    'general-public-play-card',
    renderSummaryCard({
      id: 'general-public-play-card',
      title: 'Juego publico',
      value: publicPlay.value,
      detail: publicPlay.detail,
      copyValue: publicPlay.copyValue,
      target: 'network',
      ...publicPlay.state
    })
  );
  bindSummaryCards();
}

async function readFirewallStatusForGeneral(): Promise<FirewallStatusDto | null> {
  try {
    return await getFirewallStatus();
  } catch (error) {
    appendConsoleLine(`No se pudo completar el resumen de red para General: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function readLocalAddressesForGeneral(): Promise<string[]> {
  if (!palcmApi) {
    return [];
  }

  try {
    return await palcmApi.network.getLocalAddresses();
  } catch (error) {
    appendConsoleLine(`No se pudo leer la IP local: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

async function readPublicNetworkForGeneral(port: string | null = latestConfiguredPort): Promise<NetworkDiagnosticsDto | null> {
  if (!palcmApi) {
    return null;
  }

  if (latestPublicNetwork && latestPublicNetworkPort === port) {
    return latestPublicNetwork;
  }

  if (publicNetworkRequest && publicNetworkRequestPort === port) {
    return publicNetworkRequest;
  }

  latestPublicNetworkError = null;
  publicNetworkRequestPort = port;
  publicNetworkRequest = palcmApi.network
    .getPublicAddress(port ? { port: Number(port) } : undefined)
    .then((network) => {
      latestPublicNetwork = network;
      latestPublicNetworkPort = port;
      latestPublicNetworkError = null;
      return network;
    })
    .finally(() => {
      publicNetworkRequest = null;
      publicNetworkRequestPort = null;
    });

  try {
    return await publicNetworkRequest;
  } catch (error) {
      latestPublicNetworkError = error instanceof Error ? error.message : String(error);
      appendConsoleLine(`No se pudo leer la IP publica rapida: ${latestPublicNetworkError}`);
      return null;
  }
}

function createLocalPlaySummary(
  firewall: FirewallStatusDto | null,
  port: string | null,
  isLoading: boolean,
  localAddresses: string[] = []
): SummaryCardViewModel {
  if (isLoading) {
    const localIp = localAddresses[0];

    if (localIp && port) {
      return {
        value: `${localIp}:${port}`,
        detail: 'IP LAN detectada. Click para copiar.',
        state: createSummaryCardState('ok'),
        copyValue: `${localIp}:${port}`
      };
    }

    return {
      value: 'Analizando',
      detail: 'Verificando puerto e IP local.',
      state: createSummaryCardState('loading')
    };
  }

  if (!port) {
    return {
      value: 'Sin puerto',
      detail: 'Falta leer PublicPort para probar desde la red local.',
      state: createSummaryCardState('warning')
    };
  }

  if (!firewall) {
    return {
      value: 'Pendiente',
      detail: 'Falta completar la verificacion local de Windows.',
      state: createSummaryCardState('configuration')
    };
  }

  const playerPort = getPlayerLocalPortCheck(firewall);

  if (playerPort?.state === 'READY') {
    const localIp = firewall.external.network.localIpv4[0];

    return {
      value: localIp ? `${localIp}:${port}` : `UDP ${port}`,
      detail: 'Listo para probar desde otra PC de la misma red.',
      state: createSummaryCardState('ok'),
      copyValue: localIp ? `${localIp}:${port}` : undefined
    };
  }

  if (playerPort?.state === 'MISSING') {
    return {
      value: 'Revisar firewall',
      detail: 'Windows necesita permitir el puerto UDP de jugadores para LAN.',
      state: createSummaryCardState('warning')
    };
  }

  return {
    value: 'No confirmado',
    detail: 'No se pudo validar completamente el firewall local de Windows.',
    state: createSummaryCardState('optional')
  };
}

function createPublicPlaySummary(
  firewall: FirewallStatusDto | null,
  isLoading: boolean,
  fastNetwork: NetworkDiagnosticsDto | null = latestPublicNetwork,
  fallbackPort: string | null = latestConfiguredPort
): SummaryCardViewModel {
  if (isLoading) {
    return {
      value: 'Analizando',
      detail: 'Consultando IP publica rapida.',
      state: createSummaryCardState('loading')
    };
  }

  if (!firewall) {
    if (fastNetwork) {
      return createPublicPlaySummaryFromNetwork(fastNetwork, fallbackPort);
    }

    return {
      value: latestFirewallError ? 'Error' : 'Pendiente',
      detail: 'Abre Red y Firewall para diagnosticar IP publica, router y CGNAT.',
      state: latestFirewallError ? createSummaryCardState('error') : createSummaryCardState('configuration')
    };
  }

  const network = firewall.external.network;

  if (network.cgnatStatus === 'LIKELY') {
    const port = getPublicPortFromFirewall(firewall);
    const copyValue = network.publicIp && port ? `${network.publicIp}:${port}` : undefined;

    return {
      value: copyValue ?? network.publicIp ?? 'No confirmado',
      detail: 'IP publica detectada. El acceso externo es informativo y no bloquea el servidor.',
      state: createSummaryCardState('warning'),
      copyValue
    };
  }

  if (network.cgnatStatus === 'UNLIKELY') {
    const port = getPublicPortFromFirewall(firewall);
    const copyValue = network.publicIp && port ? `${network.publicIp}:${port}` : undefined;
    const probeSummary = createPublicPortProbeSummary(network, copyValue);

    if (probeSummary) {
      return probeSummary;
    }

    return {
      value: copyValue ?? network.publicIp ?? 'Posible',
      detail: 'IP publica detectada. Verificando puerto externo.',
      state: createSummaryCardState(copyValue ? 'warning' : 'loading'),
      copyValue
    };
  }

  if (network.cgnatStatus === 'NEEDS_ROUTER_CHECK') {
    const port = getPublicPortFromFirewall(firewall);
    const copyValue = network.publicIp && port ? `${network.publicIp}:${port}` : undefined;
    const probeSummary = createPublicPortProbeSummary(network, copyValue);

    if (probeSummary) {
      return probeSummary;
    }

    return {
      value: copyValue ?? network.publicIp ?? 'No confirmado',
      detail: 'IP publica detectada. Falta confirmar si el puerto responde desde Internet.',
      state: createSummaryCardState(copyValue ? 'warning' : 'loading'),
      copyValue
    };
  }

  return {
    value: 'Sin Internet',
    detail: 'No se pudo consultar la IP publica para evaluar acceso externo.',
    state: createSummaryCardState('optional')
  };
}

function createPublicPlaySummaryFromNetwork(
  network: NetworkDiagnosticsDto,
  port: string | null
): SummaryCardViewModel {
  if (network.cgnatStatus === 'LIKELY') {
    const copyValue = network.publicIp && port ? `${network.publicIp}:${port}` : undefined;
    const probeSummary = createPublicPortProbeSummary(network, copyValue);

    if (probeSummary) {
      return probeSummary;
    }

    return {
      value: copyValue ?? network.publicIp ?? 'No confirmado',
      detail: 'IP publica detectada. El acceso externo es informativo y no bloquea el servidor.',
      state: createSummaryCardState('warning'),
      copyValue
    };
  }

  if (network.cgnatStatus === 'UNLIKELY') {
    const copyValue = network.publicIp && port ? `${network.publicIp}:${port}` : undefined;
    const probeSummary = createPublicPortProbeSummary(network, copyValue);

    if (probeSummary) {
      return probeSummary;
    }

    return {
      value: copyValue ?? network.publicIp ?? 'Posible',
      detail: copyValue ? 'IP publica detectada. Verificando puerto externo.' : 'IP publica detectada. Falta leer puerto publico.',
      state: createSummaryCardState(copyValue ? 'warning' : 'loading'),
      copyValue
    };
  }

  if (network.cgnatStatus === 'NEEDS_ROUTER_CHECK') {
    const copyValue = network.publicIp && port ? `${network.publicIp}:${port}` : undefined;
    const probeSummary = createPublicPortProbeSummary(network, copyValue);

    if (probeSummary) {
      return probeSummary;
    }

    return {
      value: copyValue ?? network.publicIp ?? 'Requiere prueba',
      detail: 'IP publica detectada. Falta confirmar si el puerto responde desde Internet.',
      state: createSummaryCardState('warning'),
      copyValue
    };
  }

  return {
    value: 'Sin Internet',
    detail: 'No se pudo consultar la IP publica rapidamente.',
    state: createSummaryCardState('optional')
  };
}

function createPublicPortProbeSummary(
  network: NetworkDiagnosticsDto,
  copyValue: string | undefined
): SummaryCardViewModel | null {
  if (network.externalAccessEvidence) {
    return {
      value: copyValue ?? network.publicIp ?? 'Accesible',
      detail: 'Acceso confirmado por un jugador conectado desde Internet. Click para copiar.',
      state: createSummaryCardState('ok'),
      copyValue
    };
  }

  const probe = network.publicPortProbe;

  if (!probe) {
    return null;
  }

  if (probe.udp === 'OPEN') {
    return {
      value: copyValue ?? network.publicIp ?? 'Abierto',
      detail: 'UDP abierto desde Internet. Click para copiar.',
      state: createSummaryCardState('ok'),
      copyValue
    };
  }

  if (probe.udp === 'CLOSED') {
    return {
      value: copyValue ?? network.publicIp ?? 'Cerrado',
      detail: 'IP detectada, pero el puerto UDP no responde desde Internet.',
      state: createSummaryCardState('error'),
      copyValue
    };
  }

  return {
    value: copyValue ?? network.publicIp ?? 'No confirmado',
    detail: probe.message,
    state: createSummaryCardState('warning'),
    copyValue
  };
}

function renderPreflightSummary(): void {
  panelStatusHeader?.classList.remove('hidden');
  progressBar?.parentElement?.classList.remove('hidden');
  setContent(renderPreflightSummaryView(latestStatus, latestActions));
}

async function renderServerConfigurationView(renderId = ++activeViewRenderId): Promise<void> {
  if (!palcmApi) {
    return;
  }

  updateReadyChrome();
  renderViewLoading('LEYENDO CONFIGURACION');

  try {
    const file = await palcmApi.config.read();
    const parsed = parsePalworldSettings(file.content);

    if (!isCurrentViewRender(renderId, 'server')) {
      return;
    }

    latestServerSettings = parsed;
    latestServerSettingsPath = file.path;
    setContent(`
      <div class="view-stack">
        <div class="view-header view-header--contained">
          <div>
            <h3>Configuracion</h3>
          </div>
          <div class="view-meta-stack" aria-label="Resumen de configuracion">
            <span class="view-meta-pill">${String(parsed.settings.length)} parametros</span>
            <span class="view-meta-path">${escapeHtml(file.path)}</span>
          </div>
        </div>
        ${renderConfigurationPresets()}
        ${renderSettingsFilterBar(parsed)}
        <div id="settings-scroll" class="settings-scroll">
          <form id="settings-form" class="settings-form">
            ${renderSettingsForm(parsed)}
          </form>
          <details class="advanced-config">
            <summary>Ver INI avanzado</summary>
            <textarea id="config-editor" class="config-editor" spellcheck="false">${escapeHtml(file.content)}</textarea>
          </details>
        </div>
      </div>
    `);
    renderServerFooter(parsed);
    bindSettingsControls(parsed);
    restoreServerConfigurationDraft(parsed, file.path);
  } catch (error) {
    if (!isCurrentViewRender(renderId, 'server')) {
      return;
    }

    latestServerSettings = null;
    latestServerSettingsPath = null;
    appFooter?.classList.add('hidden');
    rootElement.classList.remove('app--footer-visible', 'app--wide');
    const message = error instanceof Error ? error.message : String(error);
    renderSimpleView('Servidor', `No se pudo leer la configuracion activa. ${message}`);
  }
}

async function saveConfiguration(parsed?: ParsedPalworldSettings): Promise<void> {
  if (!palcmApi) {
    return;
  }

  const editor = document.querySelector<HTMLTextAreaElement>('#config-editor');
  const content = editor?.value ?? (parsed ? serializePalworldSettings(parsed, readSettingsFormValues(parsed)) : undefined);

  if (!content || (parsed && !hasServerPendingChanges(parsed))) {
    return;
  }

  if (parsed && !(await canSaveCurrentConfiguration(parsed))) {
    return;
  }

  appendConsoleLine('Confirmado: guardar configuracion activa.');
  navigationState.set('logs');
  renderActiveView();
  const accepted = await palcmApi.config.save({
    confirmed: true,
    content
  });
  if (!(await pollOperation(accepted.operationId))) {
    return;
  }
  clearServerConfigurationDraft();
  showToast('Configuracion guardada');
  navigationState.set('server');
  await refreshState();
}

async function canSaveCurrentConfiguration(parsed: ParsedPalworldSettings): Promise<boolean> {
  if (!palcmApi) {
    return false;
  }

  try {
    const current = await palcmApi.config.read();

    if (!hasConfigurationChangedExternally(parsed.originalContent, current.content)) {
      return true;
    }

    const message = 'El INI activo cambio fuera de la app. Recarga la pestaña Servidor antes de guardar para no pisar cambios externos.';
    appendConsoleLine(message);
    showToast('El INI cambio fuera de la app. Recarga antes de guardar.', 'error');
    setText(document.querySelector('#server-footer-message'), message);
    return false;
  } catch (error) {
    const message = `No se pudo verificar si el INI cambio por fuera. Guardado cancelado. ${error instanceof Error ? error.message : String(error)}`;
    appendConsoleLine(message);
    showToast('No se pudo verificar el INI activo', 'error');
    setText(document.querySelector('#server-footer-message'), message);
    return false;
  }
}

async function restoreDefaultConfiguration(): Promise<void> {
  if (!palcmApi) {
    return;
  }

  appendConsoleLine('Confirmado: restaurar configuracion default.');
  navigationState.set('logs');
  renderActiveView();
  const accepted = await palcmApi.config.restoreDefault({ confirmed: true });
  if (!(await pollOperation(accepted.operationId))) {
    return;
  }
  clearServerConfigurationDraft();
  showToast('Configuracion default restaurada');
  navigationState.set('server');
  await refreshState();
}

function showRestoreDefaultConfirmation(): void {
  if (!appFooter) {
    return;
  }

  appFooter.classList.remove('hidden');
  appFooter.classList.add('app-footer--confirm');
  appFooter.innerHTML = renderInlineConfirm({
    message: 'Se creara un backup y se reemplazara la configuracion activa por los valores default instalados.',
    actions: [
      { id: 'confirm-restore-default', label: 'Restaurar default', tone: 'warning' },
      { id: 'cancel-restore-default', label: 'Cancelar', tone: 'secondary' }
    ]
  });
  document.querySelector<HTMLButtonElement>('#confirm-restore-default')?.addEventListener('click', () => {
    runUiAction('No se pudo restaurar la configuracion default', restoreDefaultConfiguration);
  });
  document.querySelector<HTMLButtonElement>('#cancel-restore-default')?.addEventListener(
    'click',
    hideRestoreDefaultConfirmation
  );
}

async function renderBackupsView(renderId = ++activeViewRenderId): Promise<void> {
  if (!palcmApi) {
    return;
  }

  updateReadyChrome();
  renderViewLoading('LEYENDO BACKUPS');

  try {
    latestBackupSummary = await palcmApi.backup.getSummary();
    const summary = latestBackupSummary;

    if (!isCurrentViewRender(renderId, 'backups')) {
      return;
    }

    setContent(renderBackupsViewHtml(summary));
    bindBackupFilters();
    renderBackupsFooter();
    document.querySelectorAll<HTMLInputElement>('[data-backup-select]').forEach((checkbox) => {
      checkbox.addEventListener('change', updateSelectedBackupsState);
    });
    updateSelectedBackupsState();
  } catch (error) {
    if (!isCurrentViewRender(renderId, 'backups')) {
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    renderSimpleView('Backups', `No se pudo leer el estado de backups. ${message}`);
  }
}

async function renderAppSettings(renderId = ++activeViewRenderId): Promise<void> {
  if (!palcmApi) {
    return;
  }

  renderViewLoading('LEYENDO PREFERENCIAS');
  try {
    await loadReleaseUpdateStatus();
    const [settingsStatus, backupSummary, idleStatus, remoteApiStatus] = await Promise.all([
      palcmApi.appSettings.getStatus(),
      palcmApi.backup.getSummary(),
      palcmApi.serverIdle.getStatus(),
      palcmApi.remoteApi.getStatus()
    ]);
    if (!isCurrentViewRender(renderId, 'settings')) {
      return;
    }

    latestBackupSummary = backupSummary;
    latestRemoteApiStatus = remoteApiStatus;
    setContent(renderAppSettingsView(
      settingsStatus,
      latestUpdateStatus,
      backupSummary,
      idleStatus,
      remoteApiStatus,
      settingsViewState.getTab()
    ));
    bindAppSettingsControls();
    scheduleRemoteApiConnectionRefresh(remoteApiStatus);
  } catch (error) {
    if (isCurrentViewRender(renderId, 'settings')) {
      renderSimpleView('Configuracion', `No se pudieron cargar las preferencias. ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function bindAppSettingsControls(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-settings-target]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset['settingsTarget'];
      if (!isSettingsTab(target)) {
        return;
      }
      settingsViewState.setTab(target);
      renderActiveView();
      updateNavigation(latestStatus);
      announceAndFocusView();
    });
  });

  document.querySelector<HTMLButtonElement>('#settings-open-release')?.addEventListener('click', () => {
    void palcmApi?.update.openRelease();
  });

  const idleForm = document.querySelector<HTMLFormElement>('[data-idle-policy-form]');
  const idleEnabled = idleForm?.elements.namedItem('enabled');
  const idleSeconds = idleForm?.elements.namedItem('emptySeconds');
  if (idleEnabled instanceof HTMLInputElement && idleSeconds instanceof HTMLInputElement) {
    idleEnabled.addEventListener('change', () => {
      idleSeconds.disabled = !idleEnabled.checked;
    });
    idleForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      if (idleForm.reportValidity()) {
        showIdlePolicyConfirmation(idleForm);
      }
    });
  }

  bindBackupPolicyControls();
  bindRemoteApiControls();
}

function bindRemoteApiControls(): void {
  bindRemoteApiAddressCopies();
  document.querySelectorAll<HTMLFormElement>('[data-remote-api-form]').forEach((form) => {
    const profile = form.dataset['remoteApiForm'] === 'CLIENT' ? 'CLIENT' : 'ADMIN';
    const enabled = form.elements.namedItem('enabled');
    const bindMode = form.elements.namedItem('bindMode');
    const port = form.elements.namedItem('port');
    const username = form.elements.namedItem('username');
    const password = form.elements.namedItem('password');
    if (!(enabled instanceof HTMLInputElement)
      || !(bindMode instanceof HTMLSelectElement || bindMode instanceof HTMLInputElement)
      || !(port instanceof HTMLInputElement)
      || !(username instanceof HTMLInputElement)
      || !(password instanceof HTMLInputElement)) {
      return;
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      saveRemoteApiForm(form, profile, true);
    });

    form.addEventListener('change', (event) => {
      const target = event.target;
      if (target === username || target === password) {
        return;
      }
      scheduleRemoteApiAutosave(form, profile);
    });

    [username, password].forEach((field) => {
      field.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') {
          return;
        }
        event.preventDefault();
        saveRemoteApiForm(form, profile, true);
      });
    });

    port.addEventListener('keydown', (event) => {
      if (['e', 'E', '+', '-', '.', ','].includes(event.key)) {
        event.preventDefault();
      }
    });
  });
}

function scheduleRemoteApiAutosave(
  form: HTMLFormElement,
  profile: 'ADMIN' | 'CLIENT'
): void {
  const activeTimer = remoteApiAutosaveTimers[profile];
  if (activeTimer !== null) {
    window.clearTimeout(activeTimer);
  }
  remoteApiAutosaveTimers[profile] = window.setTimeout(() => {
    remoteApiAutosaveTimers[profile] = null;
    saveRemoteApiForm(form, profile, false);
  }, 250);
}

function saveRemoteApiForm(
  form: HTMLFormElement,
  profile: 'ADMIN' | 'CLIENT',
  includeCredentials: boolean
): void {
  const currentProfile = profile === 'CLIENT'
    ? latestRemoteApiStatus?.client.settings
    : latestRemoteApiStatus?.settings;
  const enabled = form.elements.namedItem('enabled');
  const bindMode = form.elements.namedItem('bindMode');
  const password = form.elements.namedItem('password');
  if (!(enabled instanceof HTMLInputElement)
    || !(bindMode instanceof HTMLSelectElement || bindMode instanceof HTMLInputElement)
    || !(password instanceof HTMLInputElement)
    || !currentProfile) {
    return;
  }
  if (!form.reportValidity()) {
    return;
  }
  if (enabled.checked && !currentProfile.passwordConfigured && !password.value) {
    password.setCustomValidity('Configura una contrasena de al menos 5 caracteres y presiona Enter.');
    password.reportValidity();
    password.setCustomValidity('');
    return;
  }

  const values = new FormData(form);
  const editedUsername = values.get('username');
  const request: RemoteApiUpdateRequestDto = {
    confirmed: true,
    profile,
    enabled: enabled.checked,
    bindMode: bindMode.value === 'LOCAL_NETWORK' ? 'LOCAL_NETWORK' : 'LOCAL_ONLY',
    port: Number(values.get('port')),
    username: includeCredentials && typeof editedUsername === 'string'
      ? editedUsername
      : currentProfile.username,
    ...(profile === 'CLIENT'
      ? { permissions: values.getAll('permissions').filter(isRemoteApiPermission) }
      : {}),
    ...(includeCredentials && password.value ? { password: password.value } : {})
  };

  runUiAction(
    'No se pudo guardar el cambio de la API',
    () => prepareRemoteApiConfirmation(request)
  );
}

function bindRemoteApiAddressCopies(): void {
  document.querySelectorAll<HTMLButtonElement>('.settings-api-address[data-copy-value]').forEach((button) => {
    button.addEventListener('click', () => {
      const value = button.dataset['copyValue'];
      if (value) {
        void copyToClipboard(value, button);
      }
    });
  });
}

function scheduleRemoteApiConnectionRefresh(status: RemoteApiStatusDto): void {
  if (remoteApiConnectionRefreshTimer !== null) {
    window.clearTimeout(remoteApiConnectionRefreshTimer);
    remoteApiConnectionRefreshTimer = null;
  }
  if (!status.connections.some((connection) => connection.state === 'CHECKING')) {
    return;
  }
  remoteApiConnectionRefreshTimer = window.setTimeout(() => {
    remoteApiConnectionRefreshTimer = null;
    void refreshRemoteApiConnectionStatus();
  }, 350);
}

async function refreshRemoteApiConnectionStatus(): Promise<void> {
  if (!palcmApi || !navigationState.is('settings') || settingsViewState.getTab() !== 'remote-api') {
    return;
  }
  const status = await palcmApi.remoteApi.getStatus();
  if (!navigationState.is('settings') || settingsViewState.getTab() !== 'remote-api') {
    return;
  }
  const current = document.querySelector<HTMLElement>('.settings-api-connection');
  if (current) {
    const template = document.createElement('template');
    template.innerHTML = renderRemoteApiConnectionStatus(status).trim();
    const next = template.content.firstElementChild;
    if (next instanceof HTMLElement) {
      syncLiveElement(current, next);
      bindRemoteApiAddressCopies();
    }
  }
  scheduleRemoteApiConnectionRefresh(status);
}

async function prepareRemoteApiConfirmation(request: RemoteApiUpdateRequestDto): Promise<void> {
  if (!requiresRemoteApiNetworkCheck(request)) {
    await queueRemoteApiUpdate(request);
    return;
  }
  let firewallConfigured = true;
  if (palcmApi && request.enabled && request.bindMode === 'LOCAL_NETWORK') {
    try {
      const status = await palcmApi.remoteApi.getFirewallStatus({
        profile: request.profile ?? 'ADMIN',
        port: request.port
      });
      firewallConfigured = status.configured;
    } catch {
      firewallConfigured = false;
    }
  }
  if (request.enabled && request.bindMode === 'LOCAL_NETWORK' && !firewallConfigured) {
    showRemoteApiConfirmation(request, false);
    return;
  }
  await queueRemoteApiUpdate(request);
}

function requiresRemoteApiNetworkCheck(request: RemoteApiUpdateRequestDto): boolean {
  if (!request.enabled || request.bindMode !== 'LOCAL_NETWORK' || !latestRemoteApiStatus) {
    return false;
  }
  if (request.profile === 'CLIENT') {
    return request.enabled !== latestRemoteApiStatus.settings.client.enabled;
  }
  const current = latestRemoteApiStatus.settings;
  return request.enabled !== current.enabled
    || request.bindMode !== current.bindMode
    || request.port !== current.port;
}

function showRemoteApiConfirmation(
  request: RemoteApiUpdateRequestDto,
  firewallConfigured: boolean
): void {
  if (!appFooter) {
    return;
  }

  rootElement.classList.add('app--footer-visible');
  appFooter.classList.remove('hidden');
  appFooter.classList.add('app-footer--confirm');
  const exposure = request.bindMode === 'LOCAL_NETWORK'
    ? 'desde otros equipos de la red local'
    : 'solo desde este equipo';
  const profileLabel = request.profile === 'CLIENT' ? 'cliente' : 'administrativa';
  const needsFirewall = request.enabled
    && request.bindMode === 'LOCAL_NETWORK'
    && !firewallConfigured;
  appFooter.innerHTML = renderInlineConfirm({
    message: request.enabled
      ? `La API ${profileLabel} quedara disponible ${exposure} por el puerto ${String(request.port)}.${needsFirewall ? ' Windows aun no permite ese puerto.' : ''}`
      : `La API ${profileLabel} se detendra y sus sesiones dejaran de funcionar.`,
    actions: [
      {
        id: 'confirm-remote-api',
        label: needsFirewall ? 'Habilitar y configurar Windows' : request.enabled ? 'Habilitar API' : 'Deshabilitar API',
        tone: request.enabled ? 'warning' : 'secondary'
      },
      ...(needsFirewall
        ? [{ id: 'confirm-remote-api-without-firewall', label: 'Continuar sin regla', tone: 'secondary' as const }]
        : []),
      { id: 'cancel-remote-api', label: 'Cancelar', tone: 'secondary' }
    ]
  });
  document.querySelector<HTMLButtonElement>('#confirm-remote-api')?.addEventListener('click', () => {
    runUiAction('No se pudo guardar la API web', () => queueRemoteApiUpdate({
      ...request,
      configureFirewall: needsFirewall
    }));
  });
  document.querySelector<HTMLButtonElement>('#confirm-remote-api-without-firewall')?.addEventListener('click', () => {
    runUiAction('No se pudo guardar la API web', () => queueRemoteApiUpdate(request));
  });
  document.querySelector<HTMLButtonElement>('#cancel-remote-api')?.addEventListener('click', () => {
    updateFooterChrome();
    void renderAppSettings();
  });
}

async function updateRemoteApi(request: RemoteApiUpdateRequestDto): Promise<void> {
  if (!palcmApi) {
    return;
  }
  const scrollContainer = contentView?.querySelector<HTMLElement>('.view-stack--scroll');
  const previousScrollTop = scrollContainer?.scrollTop ?? 0;
  latestRemoteApiStatus = await palcmApi.remoteApi.update(request);
  if (request.configureFirewall && request.enabled && request.bindMode === 'LOCAL_NETWORK') {
    const accepted = await palcmApi.remoteApi.createFirewallRule({
      confirmed: true,
      profile: request.profile ?? 'ADMIN',
      port: request.port
    });
    const firewallReady = await pollOperation(accepted.operationId);
    if (!firewallReady) {
      showToast('API habilitada, pero Windows no pudo configurarse', 'error');
      updateFooterChrome();
      await renderAppSettings();
      return;
    }
  }
  updateFooterChrome();
  await renderAppSettings();
  contentView?.querySelector<HTMLElement>('.view-stack--scroll')?.scrollTo({
    top: previousScrollTop
  });
  showRemoteApiSavedStatus();
}

function queueRemoteApiUpdate(request: RemoteApiUpdateRequestDto): Promise<void> {
  const queued = remoteApiUpdateQueue
    .catch(() => undefined)
    .then(() => updateRemoteApi(request));
  remoteApiUpdateQueue = queued;
  return queued;
}

function showRemoteApiSavedStatus(): void {
  if (remoteApiSaveStatusTimer !== null) {
    window.clearTimeout(remoteApiSaveStatusTimer);
  }
  const status = document.querySelector<HTMLElement>('#settings-save-status');
  if (!status) {
    return;
  }
  status.textContent = 'Cambio guardado';
  status.classList.add('settings-save-status--visible');
  remoteApiSaveStatusTimer = window.setTimeout(() => {
    status.classList.remove('settings-save-status--visible');
    remoteApiSaveStatusTimer = null;
  }, 2_200);
}

function isRemoteApiPermission(value: FormDataEntryValue): value is RemoteApiPermission {
  return typeof value === 'string'
    && [
      'GENERAL',
      'SERVER_START',
      'SERVER_RESTART',
      'SERVER_STOP',
      'PLAYERS_VIEW',
      'PLAYERS_KICK',
      'PLAYERS_BAN',
      'LOGS'
    ].includes(value);
}

function bindBackupFilters(): void {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-backup-filter]'));
  const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-backup-row]'));

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const filter = button.dataset['backupFilter'] ?? 'all';
      buttons.forEach((candidate) => {
        const active = candidate === button;
        candidate.classList.toggle('segmented-filter__button--active', active);
        candidate.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      rows.forEach((row) => {
        row.classList.toggle('hidden', filter !== 'all' && row.dataset['backupKind'] !== filter);
      });
    });
  });
}

function bindBackupPolicyControls(): void {
  document.querySelector<HTMLFormElement>('#backup-policy-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!(form instanceof HTMLFormElement) || !form.reportValidity()) {
      return;
    }

    const values = new FormData(form);
    showBackupPolicyConfirmation({
      confirmed: true,
      automaticEnabled: values.get('automaticEnabled') === 'on',
      automaticIntervalHours: Number(values.get('automaticIntervalHours')),
      automaticRetentionPerType: Number(values.get('automaticRetentionPerType')),
      compressWorldBackups: values.get('compressWorldBackups') === 'on'
    });
  });
}

function showBackupPolicyConfirmation(request: BackupUpdatePolicyRequestDto): void {
  if (!appFooter) {
    return;
  }

  rootElement.classList.add('app--footer-visible');
  appFooter.classList.remove('hidden');
  appFooter.classList.add('app-footer--confirm');
  appFooter.innerHTML = renderInlineConfirm({
    message: request.automaticEnabled
      ? `Se habilitaran backups cada ${String(request.automaticIntervalHours)} horas. La retencion eliminara permanentemente solo automaticos que excedan ${String(request.automaticRetentionPerType)} por tipo.`
      : 'Se deshabilitaran los backups automaticos. Las copias existentes no se eliminaran.',
    actions: [
      { id: 'confirm-backup-policy', label: 'Guardar politica', tone: 'warning' },
      { id: 'cancel-backup-policy', label: 'Cancelar', tone: 'secondary' }
    ]
  });
  document.querySelector<HTMLButtonElement>('#confirm-backup-policy')?.addEventListener('click', () => {
    runUiAction('No se pudo actualizar la politica de backups', () => updateBackupPolicy(request));
  });
  document.querySelector<HTMLButtonElement>('#cancel-backup-policy')?.addEventListener('click', hideBackupConfirmation);
}

async function updateBackupPolicy(request: BackupUpdatePolicyRequestDto): Promise<void> {
  if (!palcmApi) {
    return;
  }

  navigationState.set('logs');
  renderActiveView();
  const accepted = await palcmApi.backup.updatePolicy(request);
  if (!(await pollOperation(accepted.operationId))) {
    return;
  }
  latestBackupSummary = null;
  navigationState.set('settings');
  await refreshState();
}

function stopRuntimeViewRefreshers(): void {
  if (adminRefreshTimer !== null) {
    window.clearInterval(adminRefreshTimer);
    adminRefreshTimer = null;
  }
  if (remoteApiConnectionRefreshTimer !== null) {
    window.clearTimeout(remoteApiConnectionRefreshTimer);
    remoteApiConnectionRefreshTimer = null;
  }
  if (generalRemoteApiRefreshTimer !== null) {
    window.clearTimeout(generalRemoteApiRefreshTimer);
    generalRemoteApiRefreshTimer = null;
  }
}

async function renderAdminView(renderId = ++activeViewRenderId): Promise<void> {
  if (!palcmApi) {
    return;
  }

  renderAdminLoading();
  await refreshAdminView({}, renderId);
  if (isCurrentViewRender(renderId, 'admin')) {
    startAdminAutoRefresh();
  }
}

function renderAdminLoading(): void {
  renderViewLoading('CONECTANDO AL SERVIDOR');
}

async function refreshAdminView(options: { force?: boolean } = {}, renderId?: number): Promise<void> {
  if (!palcmApi || !navigationState.is('admin')) {
    return;
  }

  try {
    adminStatusRequest ??= Promise.all([
      palcmApi.admin.getStatus(),
      palcmApi.players.getStatus()
    ]).finally(() => {
      adminStatusRequest = null;
    });
    const [adminStatus, playersStatus] = await adminStatusRequest;

    const belongsToCurrentView = renderId === undefined || isCurrentViewRender(renderId, 'admin');
    if (belongsToCurrentView && navigationState.is('admin') && (options.force || !isEditingAdminForm())) {
      const activeTab = adminViewState.getTab();
      if (activeTab === 'general' && adminStatus.status === 'READY' && !hasAdminGeneralData(adminStatus)) {
        renderViewLoading('CARGANDO DATOS DEL SERVIDOR');
        return;
      }
      const html = renderAdminStatus(adminStatus, playersStatus, activeTab);
      if (!updateAdminLiveRegions(html, activeTab)) {
        setContent(html);
      }
      bindAdminControls();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if ((renderId === undefined || isCurrentViewRender(renderId, 'admin')) && navigationState.is('admin')) {
      renderSimpleView('Administracion', `No se pudo cargar el panel administrativo. ${message}`);
    }
  }
}

function updateAdminLiveRegions(html: string, activeTab: AdminTab): boolean {
  if (!contentView?.querySelector(`[data-admin-active-tab="${activeTab}"]`)) {
    return false;
  }

  const template = document.createElement('template');
  template.innerHTML = html.trim();
  const nextRegions = Array.from(template.content.querySelectorAll<HTMLElement>('[data-admin-live-region]'));
  const currentRegions = new Map(
    Array.from(contentView.querySelectorAll<HTMLElement>('[data-admin-live-region]')).map((region) => [
      region.dataset['adminLiveRegion'] ?? '',
      region
    ])
  );

  if (nextRegions.length !== currentRegions.size) {
    return false;
  }

  for (const nextRegion of nextRegions) {
    const regionId = nextRegion.dataset['adminLiveRegion'] ?? '';
    const currentRegion = currentRegions.get(regionId);
    if (!currentRegion) {
      return false;
    }
  }

  for (const nextRegion of nextRegions) {
    const regionId = nextRegion.dataset['adminLiveRegion'] ?? '';
    const currentRegion = currentRegions.get(regionId);
    if (currentRegion) {
      syncLiveElement(currentRegion, nextRegion);
    }
  }

  clearViewLoadingOverlay();
  return true;
}

function isEditingAdminForm(): boolean {
  const activeElement = document.activeElement;

  return activeElement instanceof HTMLElement && Boolean(activeElement.closest('[data-admin-form]'));
}

function startAdminAutoRefresh(): void {
  if (adminRefreshTimer !== null) {
    return;
  }

  adminRefreshTimer = window.setInterval(() => {
    void refreshAdminView();
  }, 3_000);
}

function bindAdminControls(): void {
  const forceUpdateButton = document.querySelector<HTMLButtonElement>('#force-update-server');
  if (forceUpdateButton && forceUpdateButton.dataset['adminBound'] !== 'true') {
    forceUpdateButton.dataset['adminBound'] = 'true';
    forceUpdateButton.addEventListener('click', showForceServerUpdateConfirmation);
  }
  const restartButton = document.querySelector<HTMLButtonElement>('#restart-server');
  if (restartButton && restartButton.dataset['adminBound'] !== 'true') {
    restartButton.dataset['adminBound'] = 'true';
    restartButton.addEventListener('click', showServerRestartConfirmation);
  }
  document.querySelectorAll<HTMLFormElement>('[data-admin-form]').forEach((form) => {
    if (form.dataset['adminBound'] === 'true') {
      return;
    }
    form.dataset['adminBound'] = 'true';
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!form.reportValidity()) {
        return;
      }
      if (form.dataset['adminForm'] === 'announce') {
        void executeAdminAction(form, 'announce');
        return;
      }
      const submitter = event instanceof SubmitEvent && event.submitter instanceof HTMLButtonElement
        ? event.submitter
        : null;
      showAdminConfirmation(form, submitter);
    });
  });
}

async function hydrateGeneralServerUpdate(renderId: number): Promise<void> {
  if (!palcmApi) {
    return;
  }

  try {
    latestPalworldUpdateStatus = await palcmApi.server.getUpdateStatus();
  } catch (error) {
    latestPalworldUpdateStatus = {
      status: 'UNKNOWN',
      appId: '2394010',
      checkedAt: new Date().toISOString(),
      message: 'No se pudo consultar la version publicada por Steam.'
    };
    appendConsoleLine(`No se pudo verificar la actualizacion del servidor: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!isCurrentViewRender(renderId, 'home')) {
    return;
  }

  replaceSummaryCard(
    'general-server-update-card',
    renderSummaryCard({ ...createGeneralServerUpdateCard(latestPalworldUpdateStatus), density: 'prominent' })
  );
  bindSummaryCards();
}

function showForceServerUpdateConfirmation(): void {
  if (!appFooter) {
    return;
  }

  rootElement.classList.add('app--footer-visible');
  appFooter.classList.remove('hidden');
  appFooter.classList.add('app-footer--confirm');
  appFooter.innerHTML = renderInlineConfirm({
    message:
      'Se guardara el mundo si esta activo, se detendra el servidor, se creara un respaldo y SteamCMD ejecutara force_install_dir con app_update 2394010 validate. Si estaba activo, al finalizar se iniciara nuevamente.',
    actions: [
      { id: 'confirm-force-server-update', label: 'Actualizar servidor', tone: 'warning' },
      { id: 'cancel-force-server-update', label: 'Cancelar', tone: 'secondary' }
    ]
  });
  document.querySelector<HTMLButtonElement>('#confirm-force-server-update')?.addEventListener('click', () => {
    runUiAction('No se pudo actualizar el servidor', forceUpdateRunningServer);
  });
  document.querySelector<HTMLButtonElement>('#cancel-force-server-update')?.addEventListener(
    'click',
    updateFooterChrome
  );
}

async function forceUpdateRunningServer(): Promise<void> {
  if (!palcmApi) {
    return;
  }

  const runtimeStatus = await palcmApi.server.getRuntimeStatus();
  if (runtimeStatus.state === 'STARTING' || runtimeStatus.state === 'STOPPING') {
    throw new Error('PALWORLD_SERVER_TRANSITION_IN_PROGRESS');
  }
  const shouldRestart = runtimeStatus.state === 'RUNNING';
  navigationState.set('logs');
  renderActiveView();
  appendConsoleLine('Actualizacion segura: solicitando guardado del mundo.');

  if (shouldRestart) {
    const saveResult = await palcmApi.admin.executeAction({
      confirmed: true,
      action: 'save'
    });
    appendConsoleLine(`Actualizacion segura: ${saveResult.message}`);

    const stopAccepted = await palcmApi.server.stop({ confirmed: true });
    if (!(await pollOperation(stopAccepted.operationId, { refreshStatusWhileRunning: true }))) {
      return;
    }
  }

  appendConsoleLine('Actualizacion segura: ejecutando SteamCMD con force_install_dir y validate.');
  const updateAccepted = await palcmApi.server.update({ confirmed: true });
  if (!(await pollOperation(updateAccepted.operationId))) {
    return;
  }

  if (shouldRestart) {
    appendConsoleLine('Actualizacion segura: iniciando nuevamente el servidor.');
    const startAccepted = await palcmApi.server.start({ confirmed: true });
    if (!(await pollOperation(startAccepted.operationId, { refreshStatusWhileRunning: true }))) {
      return;
    }
  }

  showToast('Servidor actualizado y datos validados');
  latestPalworldUpdateStatus = await palcmApi.server.getUpdateStatus({ force: true });
  await refreshState();
}

function showServerRestartConfirmation(): void {
  if (!appFooter) {
    return;
  }

  rootElement.classList.add('app--footer-visible');
  appFooter.classList.remove('hidden');
  appFooter.classList.add('app-footer--confirm');
  appFooter.innerHTML = renderInlineConfirm({
    message: 'Se detendra la instancia actual y se iniciara nuevamente cuando Windows confirme el cierre.',
    actions: [
      { id: 'confirm-server-restart', label: 'Reiniciar', tone: 'warning' },
      { id: 'cancel-server-restart', label: 'Cancelar', tone: 'secondary' }
    ]
  });
  document.querySelector<HTMLButtonElement>('#confirm-server-restart')?.addEventListener('click', () => {
    runUiAction('No se pudo reiniciar el servidor', restartServer);
  });
  document.querySelector<HTMLButtonElement>('#cancel-server-restart')?.addEventListener('click', updateFooterChrome);
}

async function restartServer(): Promise<void> {
  if (!palcmApi) {
    return;
  }

  navigationState.set('logs');
  renderActiveView();
  const accepted = await palcmApi.server.restart({ confirmed: true });
  if (!(await pollOperation(accepted.operationId, { refreshStatusWhileRunning: true }))) {
    return;
  }
  await refreshState();
}

function showIdlePolicyConfirmation(form: HTMLFormElement): void {
  if (!appFooter) {
    return;
  }

  const data = new FormData(form);
  const enabled = data.get('enabled') === 'on';
  const secondsInput = form.elements.namedItem('emptySeconds');
  const emptySeconds = secondsInput instanceof HTMLInputElement ? Number(secondsInput.value) : 300;
  rootElement.classList.add('app--footer-visible');
  appFooter.classList.remove('hidden');
  appFooter.classList.add('app-footer--confirm');
  appFooter.innerHTML = renderInlineConfirm({
    message: enabled
      ? `El servidor se detendra despues de ${String(emptySeconds)} segundos consecutivos sin jugadores confirmados por REST.`
      : 'Se deshabilitara la detencion automatica por falta de jugadores.',
    actions: [
      { id: 'confirm-idle-policy', label: 'Guardar automatizacion', tone: 'warning' },
      { id: 'cancel-idle-policy', label: 'Cancelar', tone: 'secondary' }
    ]
  });
  document.querySelector<HTMLButtonElement>('#confirm-idle-policy')?.addEventListener('click', () => {
    runUiAction('No se pudo guardar el apagado automatico', async () => {
      if (!palcmApi) {
        return;
      }
      await palcmApi.serverIdle.updatePolicy({ confirmed: true, enabled, emptySeconds });
      updateFooterChrome();
      if (navigationState.is('settings')) {
        await renderAppSettings();
      }
      showToast('Automatizacion guardada');
    });
  });
  document.querySelector<HTMLButtonElement>('#cancel-idle-policy')?.addEventListener('click', updateFooterChrome);
}

function showAdminConfirmation(form: HTMLFormElement, submitter: HTMLButtonElement | null): void {
  const action = resolveAdminAction(form, submitter);
  if (!action || !appFooter) {
    return;
  }

  rootElement.classList.add('app--footer-visible');
  appFooter.classList.remove('hidden');
  appFooter.classList.add('app-footer--confirm');
  appFooter.innerHTML = renderInlineConfirm({
    message: getAdminConfirmationMessage(action),
    actions: [
      { id: 'confirm-admin-action', label: 'Confirmar', tone: action === 'shutdown' || action === 'ban' || action === 'stop' ? 'warning' : 'primary' },
      { id: 'cancel-admin-action', label: 'Cancelar', tone: 'secondary' }
    ]
  });
  document.querySelector<HTMLButtonElement>('#confirm-admin-action')?.addEventListener('click', () => {
    runUiAction('No se pudo ejecutar la accion administrativa', () => executeAdminAction(form, action));
  });
  document.querySelector<HTMLButtonElement>('#cancel-admin-action')?.addEventListener('click', () => {
    updateFooterChrome();
  });
}

function resolveAdminAction(form: HTMLFormElement, submitter: HTMLButtonElement | null): PalworldAdminAction | null {
  const formKind = form.dataset['adminForm'];
  if (
    formKind === 'announce' ||
    formKind === 'save' ||
    formKind === 'unban' ||
    formKind === 'shutdown' ||
    formKind === 'stop'
  ) {
    return formKind;
  }

  const playerAction = submitter?.dataset['playerAction'];
  if (playerAction === 'kick' || playerAction === 'ban' || playerAction === 'unban') {
    return playerAction;
  }

  return null;
}

function getAdminConfirmationMessage(action: PalworldAdminAction): string {
  const messages: Record<PalworldAdminAction, string> = {
    announce: 'Se enviara un anuncio visible para todos los jugadores conectados.',
    save: 'Se solicitara un guardado manual del mundo del servidor.',
    kick: 'Se expulsara al jugador seleccionado de la sesion actual.',
    ban: 'Se baneara al jugador seleccionado del servidor.',
    unban: 'Se intentara remover el baneo del identificador indicado.',
    shutdown: 'Se programara el apagado del servidor con el tiempo indicado.',
    stop: 'Se forzara la detencion inmediata del servidor. Usalo solo si el apagado programado no responde.'
  };

  return messages[action];
}

async function executeAdminAction(form: HTMLFormElement, action: PalworldAdminAction): Promise<void> {
  if (!palcmApi) {
    return;
  }

  const formData = new FormData(form);
  try {
    const result = await palcmApi.admin.executeAction({
      confirmed: true,
      action,
      message: readFormString(formData, 'message'),
      userId: readFormString(formData, 'userId') || readFormString(formData, 'manualUserId'),
      seconds: Number(readFormString(formData, 'seconds') || 60)
    });
    appendConsoleLine(`Administracion: ${result.message}`);
    showToast(result.message);
    if (action === 'announce') {
      form.reset();
    }
    updateFooterChrome();
    await refreshAdminView({ force: true });
    await refreshStatusChrome();
  } catch (error) {
    updateFooterChrome();
    const message = error instanceof Error ? error.message : String(error);
    appendConsoleLine(`No se pudo ejecutar accion administrativa: ${message}`);
    showToast('No se pudo ejecutar la accion administrativa', 'error');
  }
}

function readFormString(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === 'string' ? value : '';
}

function renderBackupsFooter(): void {
  if (!appFooter) {
    return;
  }

  appFooter.classList.remove('hidden', 'app-footer--confirm', 'app-footer--server');
  appFooter.innerHTML = `
    <span id="backup-footer-message" class="app-footer__message">Selecciona backups para enviarlos a la papelera de Windows.</span>
    <button id="create-config-backup" class="secondary-button button-with-icon" type="button">
      ${renderIcon('file')}
      <span>Backup INI</span>
    </button>
    <button id="create-world-backup" class="primary-button button-with-icon" type="button">
      ${renderIcon('backup')}
      <span>Backup mundo</span>
    </button>
    <button id="restore-selected-backup" class="secondary-button button-with-icon" type="button" disabled>
      ${renderIcon('undo')}
      <span>Restaurar</span>
    </button>
    <button id="verify-selected-backup" class="secondary-button button-with-icon" type="button" disabled>
      ${renderIcon('check')}
      <span>Verificar</span>
    </button>
    <button id="delete-selected-backups" class="secondary-button backup-trash-selected button-with-icon" type="button" disabled>
      ${renderIcon('trash')}
      <span id="delete-selected-backups-label">Papelera</span>
    </button>
  `;
  document.querySelector<HTMLButtonElement>('#create-config-backup')?.addEventListener('click', () => {
    showBackupConfirmation('configuration');
  });
  document.querySelector<HTMLButtonElement>('#create-world-backup')?.addEventListener('click', () => {
    showBackupConfirmation('world');
  });
  document.querySelector<HTMLButtonElement>('#delete-selected-backups')?.addEventListener('click', () => {
    showBackupDeleteConfirmation(getSelectedBackupIds());
  });
  document.querySelector<HTMLButtonElement>('#restore-selected-backup')?.addEventListener('click', () => {
    showBackupRestoreConfirmation(getSelectedBackupIds());
  });
  document.querySelector<HTMLButtonElement>('#verify-selected-backup')?.addEventListener('click', () => {
    runUiAction('No se pudo verificar el backup', () => verifySelectedBackup(getSelectedBackupIds()));
  });
}

function showBackupConfirmation(kind: 'configuration' | 'world'): void {
  if (!appFooter) {
    return;
  }

  appFooter.classList.remove('hidden');
  appFooter.classList.add('app-footer--confirm');
  appFooter.innerHTML = renderInlineConfirm({
    message:
      kind === 'configuration'
        ? 'Se copiara el PalWorldSettings.ini activo a backups/configuration. No se modifica la configuracion actual.'
        : 'Se copiara la carpeta SaveGames del servidor a backups/world. El servidor no se modifica.',
    actions: [
      { id: 'confirm-backup', label: 'Confirmar', tone: 'primary' },
      { id: 'cancel-backup', label: 'Cancelar', tone: 'secondary' }
    ]
  });
  document.querySelector<HTMLButtonElement>('#confirm-backup')?.addEventListener('click', () => {
    runUiAction('No se pudo crear el backup', () => createBackup(kind));
  });
  document.querySelector<HTMLButtonElement>('#cancel-backup')?.addEventListener('click', hideBackupConfirmation);
}

function getSelectedBackupIds(): string[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>('[data-backup-select]:checked'))
    .map((checkbox) => checkbox.dataset['backupSelect'] ?? '')
    .filter((backupId) => backupId.length > 0);
}

function updateSelectedBackupsState(): void {
  const deleteButton = document.querySelector<HTMLButtonElement>('#delete-selected-backups');
  const restoreButton = document.querySelector<HTMLButtonElement>('#restore-selected-backup');
  const verifyButton = document.querySelector<HTMLButtonElement>('#verify-selected-backup');
  const selectedCount = getSelectedBackupIds().length;

  if (!deleteButton || !restoreButton || !verifyButton) {
    return;
  }

  deleteButton.disabled = selectedCount === 0;
  deleteButton.setAttribute(
    'aria-label',
    selectedCount === 0
      ? 'Enviar backups seleccionados a la papelera'
      : `Enviar ${String(selectedCount)} backup(s) a la papelera`
  );
  deleteButton.title =
    selectedCount === 0
      ? 'Enviar backups seleccionados a la papelera'
      : `Enviar ${String(selectedCount)} backup(s) a la papelera`;
  setText(
    document.querySelector('#delete-selected-backups-label'),
    selectedCount === 0 ? 'Papelera' : `Papelera (${String(selectedCount)})`
  );
  const selectedBackup = selectedCount === 1 ? findLatestBackupById(getSelectedBackupIds()[0] ?? '') : null;
  restoreButton.disabled = selectedCount !== 1 || selectedBackup?.integrity === 'CORRUPTED';
  verifyButton.disabled = selectedCount !== 1;
  setText(
    document.querySelector('#backup-footer-message'),
    selectedCount === 0
      ? 'Selecciona backups para enviarlos a la papelera de Windows.'
      : selectedCount === 1
        ? '1 backup seleccionado. Puedes restaurarlo o enviarlo a la papelera.'
      : `${String(selectedCount)} backup(s) seleccionados.`
  );
}

async function verifySelectedBackup(backupIds: string[]): Promise<void> {
  if (!palcmApi || backupIds.length !== 1) {
    return;
  }

  navigationState.set('logs');
  renderActiveView();
  const accepted = await palcmApi.backup.verify({ backupId: backupIds[0] ?? '' });
  if (!(await pollOperation(accepted.operationId))) {
    return;
  }
  latestBackupSummary = null;
  navigationState.set('backups');
  await refreshState();
}

function showBackupRestoreConfirmation(backupIds: string[]): void {
  if (!appFooter || backupIds.length !== 1) {
    return;
  }

  const backupId = backupIds[0] ?? '';
  const backup = findLatestBackupById(backupId);
  const isWorldBackup = backup?.kind === 'world';

  appFooter.classList.remove('hidden');
  appFooter.classList.add('app-footer--confirm');
  appFooter.innerHTML = renderInlineConfirm({
    message: isWorldBackup
      ? 'Se creara un backup preventivo del mundo actual y se restaurara el SaveGames seleccionado. El servidor debe estar detenido.'
      : 'Se creara un backup preventivo del INI actual y se restaurara la configuracion seleccionada.',
    actions: [
      { id: 'confirm-backup', label: 'Restaurar', tone: 'warning' },
      { id: 'cancel-backup', label: 'Cancelar', tone: 'secondary' }
    ]
  });
  document.querySelector<HTMLButtonElement>('#confirm-backup')?.addEventListener('click', () => {
    runUiAction('No se pudo restaurar el backup', () => restoreBackup(backupId));
  });
  document.querySelector<HTMLButtonElement>('#cancel-backup')?.addEventListener('click', hideBackupConfirmation);
}

function showBackupDeleteConfirmation(backupIds: string[]): void {
  if (!appFooter || backupIds.length === 0) {
    return;
  }

  appFooter.classList.remove('hidden');
  appFooter.classList.add('app-footer--confirm');
  appFooter.innerHTML = renderInlineConfirm({
    message:
      backupIds.length === 1
        ? 'El backup seleccionado se enviara a la papelera de Windows. Podras recuperarlo desde ahi si fue un error.'
        : `Se enviaran ${String(backupIds.length)} backups a la papelera de Windows. Podras recuperarlos desde ahi si fue un error.`,
    actions: [
      { id: 'confirm-backup', label: 'Enviar a papelera', tone: 'warning' },
      { id: 'cancel-backup', label: 'Cancelar', tone: 'secondary' }
    ]
  });
  document.querySelector<HTMLButtonElement>('#confirm-backup')?.addEventListener('click', () => {
    runUiAction('No se pudieron enviar los backups a la papelera', () => deleteBackups(backupIds));
  });
  document.querySelector<HTMLButtonElement>('#cancel-backup')?.addEventListener('click', hideBackupConfirmation);
}

function findLatestBackupById(backupId: string): BackupSummaryDto['configurationBackups'][number] | null {
  if (!latestBackupSummary) {
    return null;
  }

  return [...latestBackupSummary.configurationBackups, ...latestBackupSummary.worldBackups].find(
    (backup) => backup.id === backupId
  ) ?? null;
}

function hideBackupConfirmation(): void {
  if (navigationState.is('backups')) {
    renderBackupsFooter();
    updateSelectedBackupsState();
    return;
  }
  if (navigationState.is('settings')) {
    updateFooterChrome();
    void renderAppSettings();
  }
}

async function createBackup(kind: 'configuration' | 'world'): Promise<void> {
  if (!palcmApi) {
    return;
  }

  appendConsoleLine(kind === 'configuration' ? 'Confirmado: crear backup de configuracion.' : 'Confirmado: crear backup del mundo.');
  navigationState.set('logs');
  renderActiveView();

  const accepted =
    kind === 'configuration'
      ? await palcmApi.backup.createConfiguration({ confirmed: true })
      : await palcmApi.backup.createWorld({ confirmed: true });

  if (!(await pollOperation(accepted.operationId))) {
    return;
  }
  latestBackupSummary = null;
  navigationState.set('backups');
  await refreshState();
}

async function deleteBackups(backupIds: string[]): Promise<void> {
  if (!palcmApi) {
    return;
  }

  appendConsoleLine(`Confirmado: enviar ${String(backupIds.length)} backup(s) a la papelera.`);
  navigationState.set('logs');
  renderActiveView();

  for (const backupId of backupIds) {
    appendConsoleLine(`Enviando backup a papelera: ${backupId}`);
    const accepted = await palcmApi.backup.delete({
      confirmed: true,
      backupId
    });
    if (!(await pollOperation(accepted.operationId))) {
      latestBackupSummary = null;
      navigationState.set('backups');
      await refreshState();
      return;
    }
  }

  latestBackupSummary = null;
  showToast(
    backupIds.length === 1
      ? 'Backup enviado a la papelera'
      : `${String(backupIds.length)} backups enviados a la papelera`
  );
  navigationState.set('backups');
  await refreshState();
}

async function restoreBackup(backupId: string): Promise<void> {
  if (!palcmApi) {
    return;
  }

  appendConsoleLine(`Confirmado: restaurar backup. ${backupId}`);
  navigationState.set('logs');
  renderActiveView();

  const accepted = await palcmApi.backup.restore({
    confirmed: true,
    backupId
  });

  if (!(await pollOperation(accepted.operationId))) {
    return;
  }
  latestBackupSummary = null;
  showToast('Backup restaurado');
  navigationState.set('backups');
  await refreshState();
}

async function toggleLogHistory(): Promise<void> {
  if (!palcmApi || !logHistoryPanel) {
    return;
  }

  if (!logHistoryPanel.classList.contains('hidden')) {
    logHistoryPanel.classList.add('hidden');
    return;
  }

  logHistoryPanel.classList.remove('hidden');
  logHistoryPanel.innerHTML = '<p class="empty-state empty-state--compact">Buscando archivos de log...</p>';
  try {
    const result = await palcmApi.logs.listFiles();
    const files = result.files.filter((file) => {
      return consoleSelectedModule === 'all' || file.module === consoleSelectedModule;
    });
    logHistoryPanel.innerHTML = files.length > 0
      ? `
        <div class="log-history-panel__header">
          <strong>Logs disponibles</strong>
          <small>Ruta relativa al portable</small>
        </div>
        <div class="log-history-list">
          ${files.map(renderLogHistoryItem).join('')}
        </div>
      `
      : '<p class="empty-state empty-state--compact">No hay archivos para el filtro seleccionado.</p>';
    logHistoryPanel.querySelectorAll<HTMLButtonElement>('[data-log-file-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset['logFileId'];
        if (id) {
          void openHistoricalLog(id);
        }
      });
    });
  } catch (error) {
    logHistoryPanel.innerHTML = `<p class="empty-state empty-state--compact">No se pudo listar el historial: ${escapeHtml(error instanceof Error ? error.message : String(error))}</p>`;
  }
}

function renderLogHistoryItem(file: LogFileSummaryDto): string {
  return `
    <button class="log-history-item" type="button" data-log-file-id="${escapeHtml(file.id)}">
      <span>
        <strong>${escapeHtml(file.module)}</strong>
        <small>${escapeHtml(file.relativePath)}</small>
      </span>
      <span>
        <small>${escapeHtml(formatBytes(file.sizeBytes))}</small>
        <small>${escapeHtml(formatLastVerification(new Date(file.updatedAt)))}</small>
      </span>
    </button>
  `;
}

async function openHistoricalLog(id: string): Promise<void> {
  if (!palcmApi || !historicalLogBanner || !logHistoryPanel) {
    return;
  }

  try {
    const result = await palcmApi.logs.readFile({ id, maxLines: 2000 });
    selectedHistoricalLog = result.file;
    historicalLogLines = result.lines;
    logHistoryPanel.classList.add('hidden');
    historicalLogBanner.classList.remove('hidden');
    historicalLogBanner.innerHTML = `
      <span>
        <strong>${escapeHtml(result.file.relativePath)}</strong>
        <small>${result.truncated ? 'Mostrando las ultimas 2000 lineas' : `${String(result.lines.length)} lineas`}</small>
      </span>
      <button id="return-current-log" class="secondary-button button-with-icon" type="button">
        ${renderIcon('refresh')}
        <span>Volver al log actual</span>
      </button>
    `;
    document.querySelector<HTMLButtonElement>('#return-current-log')?.addEventListener('click', returnToCurrentLog);
    renderConsoleOutput();
  } catch (error) {
    showToast(`No se pudo abrir el log: ${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}

function returnToCurrentLog(): void {
  historicalLogLines = null;
  selectedHistoricalLog = null;
  historicalLogBanner?.classList.add('hidden');
  if (historicalLogBanner) {
    historicalLogBanner.innerHTML = '';
  }
  latestPersistentLogsSignature = '';
  renderConsoleOutput();
  void loadPersistentLogs();
}

async function loadPersistentLogs(): Promise<void> {
  if (!palcmApi || selectedHistoricalLog) {
    return;
  }

  try {
    const modules = consoleSelectedModule === 'all' ? undefined : [consoleSelectedModule];
    const logs = await palcmApi.logs.getRecent({ modules, maxLines: 80 });
    const lines = logs.entries.flatMap((entry) =>
      entry.lines.length > 0
        ? [`--- ${entry.module}.log ---`, ...entry.lines]
        : [`--- ${entry.module}.log sin entradas ---`]
    );
    const signature = `${consoleSelectedModule}:${lines.join('\n')}`;

    if (signature === latestPersistentLogsSignature) {
      return;
    }

    latestPersistentLogsSignature = signature;
    const knownLines = new Set(consoleLines);
    const newLines = lines.filter((line) => !knownLines.has(line));

    if (newLines.length === 0) {
      return;
    }

    appendConsoleLine('Logs de esta ejecucion cargados desde la carpeta portable.');
    newLines.forEach((line) => {
      appendConsoleLine(line, false);
    });
  } catch (error) {
    appendConsoleLine(`No se pudieron leer logs persistentes: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function loadAppProcessMetrics(): Promise<void> {
  if (!palcmApi || !processMetricsList) {
    return;
  }

  try {
    const metrics = await palcmApi.app.getProcessMetrics();
    processMetricsList.innerHTML = renderProcessMetrics(metrics);
  } catch (error) {
    processMetricsList.innerHTML = `<p class="empty-state empty-state--compact">No se pudieron leer procesos: ${escapeHtml(error instanceof Error ? error.message : String(error))}</p>`;
  }
}

function renderProcessMetrics(metrics: AppProcessMetricsDto): string {
  if (metrics.processes.length === 0) {
    return '<p class="empty-state empty-state--compact">Sin subprocesos detectados.</p>';
  }

  return [...metrics.processes]
    .sort(compareAppProcessMetrics)
    .map(renderProcessMetricCard)
    .join('');
}

function compareAppProcessMetrics(a: AppProcessMetricDto, b: AppProcessMetricDto): number {
  const order = ['main', 'renderer', 'gpu', 'utility', 'other'];
  return order.indexOf(a.kind) - order.indexOf(b.kind) || a.pid - b.pid;
}

function renderProcessMetricCard(process: AppProcessMetricDto): string {
  const iconName = getProcessMetricIcon(process);

  return `
    <article class="process-card process-card--${escapeHtml(process.kind)}">
      <div class="process-card__identity">
        <span class="process-card__icon">${renderIcon(iconName)}</span>
        <div>
          <strong>PSMc ${escapeHtml(process.label)}</strong>
          <span>PID ${String(process.pid)}</span>
        </div>
      </div>
      <p>${escapeHtml(process.detail)}</p>
      <dl>
        <div><dt>CPU</dt><dd>${formatProcessCpu(process.cpuPercent)}</dd></div>
        <div><dt>Memoria</dt><dd>${escapeHtml(formatBytes(process.memoryBytes))}</dd></div>
      </dl>
    </article>
  `;
}

function getProcessMetricIcon(process: AppProcessMetricDto): string {
  if (process.kind === 'main') {
    return 'application';
  }

  if (process.kind === 'renderer') {
    return 'dashboard';
  }

  if (process.kind === 'gpu') {
    return 'cpu';
  }

  if (process.kind === 'utility') {
    const service = `${process.serviceName ?? ''} ${process.label}`.toLowerCase();
    if (service.includes('network') || service.includes('red')) {
      return 'waypoints';
    }
    if (service.includes('storage') || service.includes('almacenamiento')) {
      return 'hard-drive';
    }
    return 'settings';
  }

  return 'workflow';
}

function formatProcessCpu(value: number): string {
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

function parseConsoleModuleFilter(value: string): LogModule | 'all' {
  if (['manager', 'steamcmd', 'palserver', 'firewall', 'backup', 'api', 'error'].includes(value)) {
    return value as LogModule;
  }

  return 'all';
}

function hideRestoreDefaultConfirmation(): void {
  if (navigationState.is('server')) {
    void renderServerConfigurationView();
  }
}

function renderSimpleView(title: string, message: string): void {
  panelStatusHeader?.classList.remove('hidden');
  progressBar?.parentElement?.classList.remove('hidden');
  setContent(renderSimpleViewHtml(title, message));
}

function updateReadyChrome(): void {
  const shouldHidePreflightChrome = isOperationalStatus(latestStatus);
  panelStatusHeader?.classList.toggle('hidden', shouldHidePreflightChrome);
  progressBar?.parentElement?.classList.toggle('hidden', shouldHidePreflightChrome);
}

function updateHeroChrome(): void {
  const shouldHideHero = isOperationalStatus(latestStatus) && !navigationState.is('home');
  document.querySelector('.hero')?.classList.toggle('hidden', shouldHideHero);
}

function updateFooterChrome(): void {
  const shouldShowFooter =
    isOperationalStatus(latestStatus) && (navigationState.is('server') || navigationState.is('backups'));
  const shouldUseWideLayout = isOperationalStatus(latestStatus);
  rootElement.classList.toggle('app--footer-visible', shouldShowFooter);
  rootElement.classList.toggle('app--wide', shouldUseWideLayout);

  if (!shouldShowFooter && appFooter) {
    appFooter.classList.add('hidden');
    appFooter.classList.remove('app-footer--server');
    appFooter.innerHTML = '';
  }
}

function closeActiveFooterConfirmation(): void {
  if (!appFooter?.classList.contains('app-footer--confirm')) {
    return;
  }
  if (navigationState.is('backups')) {
    hideBackupConfirmation();
    return;
  }
  if (navigationState.is('server') && latestServerSettings) {
    renderServerFooter(latestServerSettings);
    return;
  }
  updateFooterChrome();
}

function renderServerFooter(parsed: ParsedPalworldSettings): void {
  if (!appFooter) {
    return;
  }

  appFooter.classList.remove('hidden', 'app-footer--confirm');
  appFooter.classList.add('app-footer--server');
  appFooter.innerHTML = `
    <div class="server-footer__actions server-footer__actions--maintenance">
      <button id="restore-default-config" class="secondary-button secondary-button--warning button-with-icon" type="button">
        ${renderIcon('reset')}
        <span>Default</span>
      </button>
      <button id="update-server" class="secondary-button button-with-icon" type="button" ${isServerUpdateBlocked() ? 'disabled' : ''}>
        ${renderIcon('refresh')}
        <span>Actualizar</span>
      </button>
      <button id="server-maintenance" class="secondary-button button-with-icon" type="button" ${isServerUpdateBlocked() ? 'disabled' : ''}>
        ${renderIcon('settings')}
        <span>Mantenimiento</span>
      </button>
    </div>
    <span id="server-footer-message" class="app-footer__message">Sin cambios pendientes.</span>
    <div class="server-footer__actions server-footer__actions--commit">
      <button id="discard-config" class="secondary-button button-with-icon" type="button" disabled>
        ${renderIcon('undo')}
        <span>Descartar</span>
      </button>
      <button id="save-config" class="primary-button button-with-icon" type="button">
        ${renderIcon('check')}
        <span>Guardar</span>
      </button>
    </div>
  `;
  document.querySelector<HTMLButtonElement>('#save-config')?.addEventListener('click', () => {
    runUiAction('No se pudo guardar la configuracion', () => saveConfiguration(parsed));
  });
  document.querySelector<HTMLButtonElement>('#discard-config')?.addEventListener('click', () => {
    discardServerChanges(parsed);
  });
  document.querySelector<HTMLButtonElement>('#restore-default-config')?.addEventListener(
    'click',
    showRestoreDefaultConfirmation
  );
  document.querySelector<HTMLButtonElement>('#update-server')?.addEventListener('click', showServerUpdateConfirmation);
  document.querySelector<HTMLButtonElement>('#server-maintenance')?.addEventListener('click', showMaintenanceMenu);
  updateServerDirtyState(parsed);
}

function showMaintenanceMenu(): void {
  if (!appFooter) {
    return;
  }

  appFooter.classList.remove('hidden');
  appFooter.classList.add('app-footer--confirm');
  appFooter.innerHTML = renderInlineConfirm({
    message: 'Selecciona el componente que quieres volver a descargar y validar desde su fuente oficial.',
    actions: [
      { id: 'repair-steamcmd', label: 'SteamCMD', tone: 'secondary' },
      { id: 'repair-server', label: 'Servidor', tone: 'warning' },
      { id: 'cancel-maintenance', label: 'Cancelar', tone: 'secondary' }
    ]
  });
  document.querySelector<HTMLButtonElement>('#repair-steamcmd')?.addEventListener('click', () => {
    runUiAction('No se pudo reparar SteamCMD', repairSteamCmd);
  });
  document.querySelector<HTMLButtonElement>('#repair-server')?.addEventListener('click', () => {
    runUiAction('No se pudo reparar el servidor', repairServerInstallation);
  });
  document.querySelector<HTMLButtonElement>('#cancel-maintenance')?.addEventListener('click', () => {
    void renderServerConfigurationView();
  });
}

async function repairSteamCmd(): Promise<void> {
  if (!palcmApi) {
    return;
  }

  navigationState.set('logs');
  renderActiveView();
  const accepted = await palcmApi.steamCmd.repair({ confirmed: true });
  if (!(await pollOperation(accepted.operationId))) {
    return;
  }
  showToast('Reparacion de SteamCMD finalizada');
  navigationState.set('server');
  await refreshState();
}

async function repairServerInstallation(): Promise<void> {
  if (!palcmApi) {
    return;
  }

  navigationState.set('logs');
  renderActiveView();
  const accepted = await palcmApi.server.repair({ confirmed: true });
  if (!(await pollOperation(accepted.operationId))) {
    return;
  }
  showToast('Reparacion del servidor finalizada');
  navigationState.set('server');
  await refreshState();
}

function isServerUpdateBlocked(): boolean {
  return [
    ApplicationStatus.SERVER_STARTING,
    ApplicationStatus.SERVER_RUNNING,
    ApplicationStatus.SERVER_STOPPING
  ].includes(latestStatus);
}

function showServerUpdateConfirmation(): void {
  if (!appFooter) {
    return;
  }

  appFooter.classList.remove('hidden');
  appFooter.classList.add('app-footer--confirm');
  appFooter.innerHTML = renderInlineConfirm({
    message: 'Se ejecutara SteamCMD para actualizar y validar Palworld Dedicated Server. El servidor debe estar detenido.',
    actions: [
      { id: 'confirm-server-update', label: 'Actualizar', tone: 'warning' },
      { id: 'cancel-server-update', label: 'Cancelar', tone: 'secondary' }
    ]
  });
  document.querySelector<HTMLButtonElement>('#confirm-server-update')?.addEventListener('click', () => {
    runUiAction('No se pudo actualizar el servidor', updateServerInstallation);
  });
  document.querySelector<HTMLButtonElement>('#cancel-server-update')?.addEventListener('click', () => {
    void renderServerConfigurationView();
  });
}

async function updateServerInstallation(): Promise<void> {
  if (!palcmApi) {
    return;
  }

  appendConsoleLine('Confirmado: actualizar Palworld Dedicated Server.');
  navigationState.set('logs');
  renderActiveView();
  const accepted = await palcmApi.server.update({ confirmed: true });
  if (!(await pollOperation(accepted.operationId))) {
    return;
  }
  showToast('Actualizacion del servidor finalizada');
  navigationState.set('server');
  await refreshState();
}

async function getFirewallStatus(forceRefresh = false): Promise<FirewallStatusDto> {
  if (!palcmApi) {
    throw new Error('IPC_NOT_AVAILABLE');
  }

  if (!forceRefresh && latestFirewallStatus) {
    return latestFirewallStatus;
  }

  if (!forceRefresh && firewallStatusRequest) {
    return firewallStatusRequest;
  }

  if (forceRefresh) {
    latestFirewallStatus = null;
    latestPublicNetwork = null;
    latestPublicNetworkPort = null;
    publicNetworkRequestPort = null;
    latestPublicNetworkError = null;
  }

  latestFirewallError = null;
  activeFirewallRequestId = crypto.randomUUID();
  firewallDiagnosticProgress.clear();
  firewallStatusRequest = palcmApi.firewall
    .getStatus({ requestId: activeFirewallRequestId })
    .then((status) => {
      latestFirewallStatus = status;
      latestLocalAddresses = status.external.network.localIpv4;
      latestFirewallError = null;
      latestFirewallCheckedAt = new Date();
      return status;
    })
    .catch((error: unknown) => {
      latestFirewallError = error instanceof Error ? error.message : String(error);
      throw error;
    })
    .finally(() => {
      firewallStatusRequest = null;
    });

  return firewallStatusRequest;
}

async function renderFirewallView(forceRefresh = false, renderId = ++activeViewRenderId): Promise<void> {
  if (!palcmApi) {
    return;
  }

  if (!forceRefresh && latestFirewallStatus) {
    renderViewLoading('VERIFICANDO STEAM QUERY');
    const queryPortStatus = await palcmApi.server.getQueryPortStatus();
    if (!isCurrentViewRender(renderId, 'network')) {
      return;
    }
    renderFirewallStatusView(latestFirewallStatus, queryPortStatus);
    return;
  }

  updateReadyChrome();
  if (forceRefresh || !firewallStatusRequest) {
    firewallDiagnosticProgress.clear();
  }
  const visibleProgress = renderFirewallDiagnosticProgress();
  const currentProgress = getCurrentFirewallDiagnosticProgress();
  setContent(`
    <div class="view-stack view-stack--scroll">
      <div class="view-header view-header--contained">
        <div>
          <h3>Red y Firewall</h3>
        </div>
        <span class="view-meta-pill">Diagnostico</span>
      </div>
      <section class="firewall-section firewall-section--loading">
        <div class="loading-diagnostic">
          <span class="loading-diagnostic__spinner" aria-hidden="true"></span>
          <div>
            <h4>Diagnostico en curso</h4>
            <p id="firewall-diagnostic-current">${escapeHtml(currentProgress?.detail ?? 'Preparando una solicitud segura al backend.')}</p>
          </div>
        </div>
        <ol id="firewall-diagnostic-steps" class="diagnostic-steps" aria-label="Pasos de verificacion">
          ${visibleProgress || renderDiagnosticStep(0, 'active', 'Iniciando diagnostico', 'Creando la solicitud y preparando los verificadores locales.')}
        </ol>
      </section>
    </div>
  `);

  try {
    const firewallPromise = getFirewallStatus(forceRefresh);
    const requestId = activeFirewallRequestId;
    const queryPortPromise = palcmApi.server.getQueryPortStatus().then((status) => {
      if (requestId) {
        updateFirewallDiagnosticProgress({
          requestId,
          step: 'query-port',
          state: 'done',
          title: 'Steam Query revisado',
          detail: createQueryPortDiagnosticDetail(status)
        });
      }
      return status;
    });
    if (requestId) {
      updateFirewallDiagnosticProgress({
        requestId,
        step: 'query-port',
        state: 'active',
        title: 'Revisando Steam Query',
        detail: 'Consultando si UDP 27015 esta libre o identificando el PID que lo utiliza.'
      });
    }
    const [firewall, queryPortStatus] = await Promise.all([firewallPromise, queryPortPromise]);

    if (!isCurrentViewRender(renderId, 'network')) {
      return;
    }

    renderFirewallStatusView(firewall, queryPortStatus);
  } catch (error) {
    if (!isCurrentViewRender(renderId, 'network')) {
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    renderFirewallErrorView(message);
  }
}

function renderFirewallStatusView(
  firewall: FirewallStatusDto,
  queryPortStatus: PalworldQueryPortStatusDto | null
): void {
  const shouldOpenTechnicalDetails =
    firewall.local.state !== 'READY' || queryPortStatus?.state === 'IN_USE';

  setContent(`
      <div class="view-stack view-stack--scroll">
        <div class="view-header view-header--contained">
          <div>
            <h3>Red y Firewall</h3>
          </div>
          <div class="view-actions">
            <span class="view-meta-pill">${escapeHtml(formatLastVerification(latestFirewallCheckedAt))}</span>
            <button id="refresh-firewall" class="secondary-button icon-button" type="button" aria-label="Actualizar diagnostico" title="Actualizar diagnostico">
              ${renderIcon('refresh')}
            </button>
            ${firewall.local.state === 'READY'
              ? ''
              : `<button id="apply-firewall" class="primary-button primary-button--warning button-with-icon" type="button">
                  ${renderIcon('server')}
                  <span>Configurar Windows</span>
                </button>`}
          </div>
        </div>
        <section class="summary-grid summary-grid--ready network-state-grid">
          ${renderNetworkStateCard('Windows local', createWindowsLocalSummary(firewall))}
          ${renderNetworkStateCard('Acceso externo', createExternalAccessSummary(firewall))}
        </section>
        <details class="technical-disclosure" ${shouldOpenTechnicalDetails ? 'open' : ''}>
          <summary>
            <span>Detalle tecnico</span>
            <small>Puertos, Steam Query y diagnostico externo</small>
          </summary>
          <section class="firewall-layout">
            ${renderFirewallSection('PC local', firewall.local.message, firewall.local.ports)}
            ${renderSteamQueryPortDiagnostics(queryPortStatus)}
            ${renderFirewallSection('Acceso externo', firewall.external.message, firewall.external.ports)}
            ${renderNetworkDiagnostics(firewall.external.network)}
          </section>
        </details>
        <div id="firewall-confirmation" class="inline-confirm hidden" role="alertdialog" aria-label="Confirmar configuracion del Firewall de Windows">
          <span>Se crearan reglas de entrada en el Firewall de Windows para los puertos activos. Windows puede pedir permisos de administrador.</span>
          <button id="confirm-firewall" class="primary-button primary-button--warning button-with-icon" type="button">
            ${renderIcon('check')}
            <span>Configurar</span>
          </button>
          <button id="cancel-firewall" class="secondary-button button-with-icon" type="button">
            ${renderIcon('x')}
            <span>Cancelar</span>
          </button>
        </div>
        <div id="query-port-confirmation" class="inline-confirm hidden" role="alertdialog" aria-label="Confirmar detencion del proceso que ocupa Steam Query">
          <span>Se detendra el proceso que Windows informa como dueño actual de UDP 27015. Usalo si quedo una instancia previa del servidor ocupando Steam Query.</span>
          <button id="confirm-query-port-stop" class="primary-button primary-button--warning button-with-icon" type="button">
            ${renderIcon('stop')}
            <span>Detener proceso</span>
          </button>
          <button id="cancel-query-port-stop" class="secondary-button button-with-icon" type="button">
            ${renderIcon('x')}
            <span>Cancelar</span>
          </button>
        </div>
      </div>
    `);
  document.querySelector<HTMLButtonElement>('#refresh-firewall')?.addEventListener('click', () => {
    void renderFirewallView(true);
  });
  document.querySelector<HTMLButtonElement>('#apply-firewall')?.addEventListener('click', showFirewallConfirmation);
  document.querySelector<HTMLButtonElement>('#confirm-firewall')?.addEventListener('click', () => {
    runUiAction('No se pudieron configurar las reglas de Firewall', applyFirewallRules);
  });
  document.querySelector<HTMLButtonElement>('#cancel-firewall')?.addEventListener('click', hideFirewallConfirmation);
  document.querySelector<HTMLButtonElement>('#stop-query-port-owner')?.addEventListener('click', showQueryPortStopConfirmation);
  document.querySelector<HTMLButtonElement>('#confirm-query-port-stop')?.addEventListener('click', () => {
    runUiAction('No se pudo detener el proceso de Steam Query', stopQueryPortOwner);
  });
  document.querySelector<HTMLButtonElement>('#cancel-query-port-stop')?.addEventListener('click', hideQueryPortStopConfirmation);
}

function renderFirewallErrorView(message: string): void {
  setContent(`
    <div class="view-stack view-stack--scroll">
      <div class="view-header view-header--contained">
        <div>
          <h3>Red y Firewall</h3>
        </div>
        <div class="view-actions">
          <span class="view-meta-pill">Error</span>
          <button id="refresh-firewall" class="secondary-button icon-button" type="button" aria-label="Reintentar diagnostico" title="Reintentar diagnostico">
            ${renderIcon('refresh')}
          </button>
        </div>
      </div>
      <section class="firewall-section firewall-section--loading">
        <div class="loading-diagnostic">
          <span class="summary-card__icon summary-card__icon--error" aria-label="Error">${renderIcon('x')}</span>
          <div>
            <h4>Diagnostico interrumpido</h4>
            <p>${escapeHtml(message)}</p>
          </div>
        </div>
        <ol class="diagnostic-steps" aria-label="Pasos de verificacion">
          ${renderFirewallDiagnosticProgress()}
          ${renderDiagnosticStep(firewallDiagnosticProgress.size, 'error', 'Diagnostico interrumpido', 'La consulta actual no pudo completarse. Reintenta para continuar desde el primer paso.')}
        </ol>
      </section>
    </div>
  `);
  document.querySelector<HTMLButtonElement>('#refresh-firewall')?.addEventListener('click', () => {
    void renderFirewallView(true);
  });
}

function renderFirewallSection(title: string, message: string, ports: FirewallPortCheckDto[]): string {
  return `
    <section class="firewall-section">
      <div class="firewall-section__header">
        <h4>${escapeHtml(title)}</h4>
        <p>${escapeHtml(message)}</p>
      </div>
      <div class="firewall-port-grid">
        ${ports.map((port) => renderFirewallPortCard(port)).join('')}
      </div>
      ${title === 'Acceso externo' ? renderExternalPortRecommendations(ports) : ''}
    </section>
  `;
}

function renderSteamQueryPortDiagnostics(status: PalworldQueryPortStatusDto | null): string {
  const state = status ? mapQueryPortState(status.state) : createSummaryCardState('optional');
  const port = status?.port ?? 27015;
  const details = status?.state === 'IN_USE'
    ? [
        status.processName ? `Proceso: ${status.processName}` : null,
        status.pid ? `PID ${String(status.pid)}` : null,
        status.executablePath ?? null
      ].filter((item): item is string => Boolean(item))
    : [];

  return `
    <section class="firewall-section">
      <div class="firewall-section__header">
        <h4>Steam Query local</h4>
        <p>Verificacion local de Windows. No se prueba desde Internet.</p>
      </div>
      <article class="summary-card summary-card--${state.tone} firewall-port query-port-card">
        <span class="summary-card__body">
          <span class="summary-card__title">Steam Query</span>
          <strong>UDP ${String(port)}</strong>
          <small>${escapeHtml(status?.message ?? 'No se pudo consultar el estado local de Steam Query.')}</small>
          ${details.length > 0 ? `<span class="firewall-port__source">${details.map(escapeHtml).join(' · ')}</span>` : ''}
        </span>
        <span class="summary-card__icon" aria-label="${escapeHtml(state.label)}">${renderIcon(state.icon)}</span>
        ${status?.state === 'IN_USE'
          ? `<button id="stop-query-port-owner" class="secondary-button secondary-button--warning button-with-icon query-port-card__action" type="button">
              ${renderIcon('stop')}
              <span>Detener PID</span>
            </button>`
          : ''}
      </article>
    </section>
  `;
}

function renderNetworkStateCard(
  title: string,
  summary: SummaryCardViewModel
): string {
  return renderSummaryCard({
    title,
    value: summary.value,
    detail: summary.detail,
    copyValue: summary.copyValue,
    target: 'network',
    ...summary.state
  });
}

function getPublicPortFromFirewall(firewall: FirewallStatusDto): string | null {
  const publicPort = firewall.external.ports.find((port) => port.key === 'PublicPort' && port.enabled);

  return publicPort ? String(publicPort.port) : null;
}

function getPlayerLocalPortCheck(firewall: FirewallStatusDto): FirewallPortCheckDto | undefined {
  return firewall.local.ports.find((port) => port.key === 'PublicPort' && port.enabled);
}

function getMissingAuxiliaryLocalPorts(firewall: FirewallStatusDto): FirewallPortCheckDto[] {
  return firewall.local.ports.filter((port) => port.enabled && port.key !== 'PublicPort' && port.state === 'MISSING');
}

function createWindowsLocalSummary(firewall: FirewallStatusDto): SummaryCardViewModel {
  const playerPort = getPlayerLocalPortCheck(firewall);
  const missingAuxiliaryPorts = getMissingAuxiliaryLocalPorts(firewall);

  if (playerPort?.state === 'READY') {
    const port = getPublicPortFromFirewall(firewall);
    const localIp = firewall.external.network.localIpv4[0];
    const copyValue = localIp && port ? `${localIp}:${port}` : undefined;

    return {
      value: copyValue ?? 'Listo',
      detail: missingAuxiliaryPorts.length > 0
        ? 'Juego local listo. Hay servicios auxiliares pendientes si quieres usarlos.'
        : copyValue ? 'Click para copiar la direccion LAN.' : 'Windows permite el puerto local de jugadores.',
      state: createSummaryCardState('ok'),
      copyValue
    };
  }

  if (playerPort?.state === 'MISSING') {
    return {
      value: 'Configurar',
      detail: 'Falta permitir en Windows el puerto UDP de jugadores.',
      state: createSummaryCardState('configuration')
    };
  }

  if (firewall.local.state === 'ERROR') {
    return {
      value: 'Error',
      detail: 'No se pudo consultar o preparar el estado local de Windows.',
      state: createSummaryCardState('error')
    };
  }

  return {
    value: 'No confirmado',
    detail: 'La verificacion local no esta disponible en este entorno.',
    state: createSummaryCardState('optional')
  };
}

function createExternalAccessSummary(firewall: FirewallStatusDto): SummaryCardViewModel {
  const network = firewall.external.network;
  const port = getPublicPortFromFirewall(firewall);
  const copyValue = network.publicIp && port ? `${network.publicIp}:${port}` : undefined;
  const probeNetwork = latestPublicNetwork && latestPublicNetworkPort === port
    ? {
        ...latestPublicNetwork,
        ...(network.externalAccessEvidence
          ? { externalAccessEvidence: network.externalAccessEvidence }
          : {})
      }
    : network;
  const probeSummary = createPublicPortProbeSummary(probeNetwork, copyValue);

  if (probeSummary) {
    return probeSummary;
  }

  if (network.cgnatStatus === 'LIKELY') {
    return {
      value: copyValue ?? network.publicIp ?? 'No confirmado',
      detail: 'IP publica detectada. El acceso externo no bloquea el inicio del servidor.',
      state: createSummaryCardState('warning'),
      copyValue
    };
  }

  if (network.cgnatStatus === 'UNLIKELY') {
    return {
      value: copyValue ?? 'Posible',
      detail: copyValue ? 'IP publica detectada. Verificando puerto externo.' : 'Sin indicios fuertes de CGNAT; falta probar el puerto desde otra red.',
      state: createSummaryCardState(copyValue ? 'warning' : 'ok'),
      copyValue
    };
  }

  if (network.cgnatStatus === 'NEEDS_ROUTER_CHECK') {
    return {
      value: copyValue ?? network.publicIp ?? 'No confirmado',
      detail: 'IP publica detectada. Falta confirmar si el puerto responde desde Internet.',
      state: createSummaryCardState(copyValue ? 'warning' : 'loading'),
      copyValue
    };
  }

  return {
    value: 'No verificado',
    detail: 'No se pudo consultar la IP publica para evaluar acceso externo.',
    state: createSummaryCardState('error')
  };
}

function renderDiagnosticStep(
  index: number,
  state: FirewallDiagnosticStepState,
  title: string,
  detail: string
): string {
  return `
    <li class="diagnostic-step diagnostic-step--${state}" data-step="${String(index)}">
      <span class="diagnostic-step__icon"></span>
      <span class="diagnostic-step__body">
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml(detail)}</small>
      </span>
    </li>
  `;
}

function updateFirewallDiagnosticProgress(progress: FirewallDiagnosticProgressDto): void {
  if (progress.requestId !== activeFirewallRequestId) {
    return;
  }

  firewallDiagnosticProgress.set(progress.step, progress);
  if (!navigationState.is('network')) {
    return;
  }

  const currentDetail = document.querySelector<HTMLElement>('#firewall-diagnostic-current');
  const stepList = document.querySelector<HTMLElement>('#firewall-diagnostic-steps');

  if (currentDetail) {
    currentDetail.textContent = getCurrentFirewallDiagnosticProgress()?.detail ?? progress.detail;
  }

  if (stepList) {
    stepList.innerHTML = renderFirewallDiagnosticProgress();
  }
}

function renderFirewallDiagnosticProgress(): string {
  return FIREWALL_DIAGNOSTIC_ORDER
    .map((step) => firewallDiagnosticProgress.get(step))
    .filter((step): step is FirewallDiagnosticProgressDto => Boolean(step))
    .map((step, index) => renderDiagnosticStep(index, step.state, step.title, step.detail))
    .join('');
}

function getCurrentFirewallDiagnosticProgress(): FirewallDiagnosticProgressDto | undefined {
  const progress = Array.from(firewallDiagnosticProgress.values());
  return progress.filter((step) => step.state === 'active').at(-1) ?? progress.at(-1);
}

function createQueryPortDiagnosticDetail(status: PalworldQueryPortStatusDto | null): string {
  if (!status) {
    return 'No se recibio informacion del puerto Steam Query.';
  }

  if (status.state === 'AVAILABLE') {
    return `UDP ${String(status.port)} esta libre para iniciar el servidor.`;
  }

  if (status.state === 'IN_USE' && status.pid) {
    return `UDP ${String(status.port)} esta en uso por PID ${String(status.pid)} (${status.processName ?? 'proceso sin nombre'}).`;
  }

  return status.message;
}

function renderExternalPortRecommendations(ports: FirewallPortCheckDto[]): string {
  const configuredPorts = ports.filter((port) => port.enabled);
  const recommendations = configuredPorts.map((port) => ({
      label: port.label,
      value: `${port.protocol} ${String(port.port)}`,
      detail: 'Configurado en el INI activo.',
      checked: true
    }));
  const unique = recommendations.filter(
    (item, index, list) => list.findIndex((candidate) => candidate.value === item.value) === index
  );

  return `
    <div class="external-recommendations">
      <div>
        <h5>Prueba recomendada de puertos</h5>
        <p>Usa esta lista para probar conectividad externa desde otra red o con una herramienta online. Este resultado no bloquea el juego local.</p>
      </div>
      <div class="external-port-list">
        ${unique
          .map(
            (item) => `
              <article class="external-port-item ${item.checked ? 'external-port-item--checked' : ''}">
                <span>${renderIcon(item.checked ? 'check' : 'warning')}</span>
                <strong>${escapeHtml(item.value)}</strong>
                <small>${escapeHtml(item.label)} - ${escapeHtml(item.detail)}</small>
              </article>
            `
          )
          .join('')}
      </div>
    </div>
  `;
}

function renderNetworkDiagnostics(network: FirewallStatusDto['external']['network']): string {
  const state = mapNetworkState(network.cgnatStatus);

  return `
    <section class="firewall-section network-diagnostics">
      <div class="firewall-section__header">
        <h4>Acceso publico</h4>
        <p>Diagnostico informativo de IP publica. No bloquea el inicio del servidor.</p>
      </div>
      <div class="network-diagnostics__grid">
        <article class="network-diagnostics__item">
          <span>IP publica detectada</span>
          <strong>${escapeHtml(network.publicIp ?? 'No disponible')}</strong>
        </article>
        <article class="network-diagnostics__item">
          <span>IP local del equipo</span>
          <strong>${escapeHtml(network.localIpv4.join(', ') || 'No disponible')}</strong>
        </article>
        <article class="network-diagnostics__item network-diagnostics__item--${state.tone}">
          <span>Diagnostico</span>
          <strong>${escapeHtml(state.label)}</strong>
        </article>
      </div>
      <div class="network-diagnostics__recommendation">
        <span class="summary-card__icon" aria-label="${escapeHtml(state.label)}">${renderIcon(state.icon)}</span>
        <p>${escapeHtml(createPublicAccessRecommendation(network.cgnatStatus, network.publicIp))}</p>
      </div>
    </section>
  `;
}

function mapNetworkState(status: FirewallStatusDto['external']['network']['cgnatStatus']): {
  icon: string;
  tone: string;
  label: string;
} {
  if (status === 'LIKELY') {
    return { icon: 'warning', tone: 'warning', label: 'Probable CGNAT' };
  }

  if (status === 'UNLIKELY') {
    return { icon: 'check', tone: 'ok', label: 'Sin indicios fuertes' };
  }

  if (status === 'NEEDS_ROUTER_CHECK') {
    return { icon: 'help', tone: 'optional', label: 'No confirmado' };
  }

  return { icon: 'warning', tone: 'warning', label: 'No evaluado' };
}

function createPublicAccessRecommendation(
  status: FirewallStatusDto['external']['network']['cgnatStatus'],
  publicIp: string | null
): string {
  if (status === 'UNLIKELY') {
    return 'IP publica detectada. Si el puerto figura abierto, puedes compartir IP:puerto para jugar por Internet.';
  }

  if (status === 'LIKELY') {
    return 'IP publica detectada, pero el acceso directo puede depender del proveedor. El servidor igual puede iniciar y usarse en LAN.';
  }

  if (status === 'NEEDS_ROUTER_CHECK') {
    return publicIp
      ? 'IP publica detectada. Falta confirmar si el puerto responde desde Internet.'
      : 'No se pudo obtener IP publica. El servidor igual puede iniciar si Windows local esta correcto.';
  }

  return 'Sin verificacion externa disponible. El servidor igual puede iniciar si Windows local esta correcto.';
}

function renderFirewallPortCard(port: FirewallPortCheckDto): string {
  const state = mapFirewallState(port.state);

  return `
    <article class="summary-card summary-card--${state.tone} firewall-port">
      <span class="summary-card__body">
        <span class="summary-card__title">${escapeHtml(port.label)}</span>
        <strong>${port.protocol} ${String(port.port)}</strong>
        <small>${escapeHtml(port.message)}</small>
        <span class="firewall-port__source">${escapeHtml(port.source)}</span>
      </span>
      <span class="summary-card__icon" aria-label="${escapeHtml(state.label)}">${renderIcon(state.icon)}</span>
    </article>
  `;
}

function mapQueryPortState(state: PalworldQueryPortStatusDto['state']): {
  icon: string;
  tone: string;
  label: string;
} {
  if (state === 'AVAILABLE') {
    return createSummaryCardState('ok');
  }

  if (state === 'IN_USE') {
    return createSummaryCardState('warning');
  }

  if (state === 'UNSUPPORTED') {
    return createSummaryCardState('optional');
  }

  return createSummaryCardState('warning');
}

function mapFirewallState(state: FirewallStatusDto['local']['state']): {
  icon: string;
  tone: string;
  label: string;
} {
  if (state === 'READY') {
    return createSummaryCardState('ok');
  }

  if (state === 'MISSING' || state === 'ERROR') {
    return createSummaryCardState('error');
  }

  if (state === 'UNKNOWN') {
    return createSummaryCardState('warning');
  }

  return createSummaryCardState('optional');
}

function showFirewallConfirmation(): void {
  showInlineConfirmation('firewall-confirmation');
}

function hideFirewallConfirmation(): void {
  hideInlineConfirmation('firewall-confirmation');
}

function showQueryPortStopConfirmation(): void {
  showInlineConfirmation('query-port-confirmation');
}

function hideQueryPortStopConfirmation(): void {
  hideInlineConfirmation('query-port-confirmation');
}

function showInlineConfirmation(id: string): void {
  const confirmation = document.querySelector<HTMLElement>(`#${id}`);
  if (!confirmation) {
    return;
  }
  inlineConfirmationReturnFocus =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  confirmation.classList.remove('hidden');
  window.requestAnimationFrame(() => {
    confirmation.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  });
}

function hideInlineConfirmation(id: string): void {
  const confirmation = document.querySelector<HTMLElement>(`#${id}`);
  if (!confirmation || confirmation.classList.contains('hidden')) {
    return;
  }
  confirmation.classList.add('hidden');
  inlineConfirmationReturnFocus?.focus({ preventScroll: true });
  inlineConfirmationReturnFocus = null;
}

async function applyFirewallRules(): Promise<void> {
  if (!palcmApi) {
    return;
  }

  appendConsoleLine('Confirmado: configurar reglas de Firewall de Windows.');
  navigationState.set('logs');
  renderActiveView();
  const accepted = await palcmApi.firewall.applyRules({ confirmed: true });
  if (!(await pollOperation(accepted.operationId))) {
    return;
  }
  latestFirewallStatus = null;
  latestFirewallCheckedAt = null;
  latestPublicNetwork = null;
  latestPublicNetworkPort = null;
  publicNetworkRequestPort = null;
  latestPublicNetworkError = null;
  showToast('Reglas de Firewall actualizadas');
  navigationState.set('network');
  await refreshState();
}

async function stopQueryPortOwner(): Promise<void> {
  if (!palcmApi) {
    return;
  }

  appendConsoleLine('Confirmado: detener proceso que usa UDP 27015.');
  navigationState.set('logs');
  renderActiveView();
  const accepted = await palcmApi.server.stopQueryPortOwner({ confirmed: true });
  if (!(await pollOperation(accepted.operationId))) {
    return;
  }
  showToast('Verificacion de Steam Query actualizada');
  navigationState.set('network');
  await refreshState();
}

function replaceSummaryCard(id: string, html: string): void {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  const nextCard = template.content.firstElementChild;
  const currentCard = document.querySelector(`#${cssEscape(id)}`);

  if (currentCard instanceof HTMLElement && nextCard instanceof HTMLElement) {
    syncLiveElement(currentCard, nextCard);
  }
}

function bindSummaryCards(): void {
  document.querySelectorAll<HTMLButtonElement>('.summary-card[data-target]').forEach((card) => {
    if (card.dataset['summaryBound'] === 'true') {
      return;
    }

    card.dataset['summaryBound'] = 'true';
    card.addEventListener('click', (event) => {
      if (card.dataset['summaryAction'] === 'server-update') {
        showForceServerUpdateConfirmation();
        return;
      }

      const copyValue = card.dataset['copyValue'];
      const clickedElement = event.target instanceof Element ? event.target : null;
      const clickedTargetIcon = clickedElement
        ?.closest<HTMLElement>('.summary-card__icon[data-summary-icon="target"]');

      if (clickedTargetIcon) {
        const adminTab = card.dataset['adminTab'];
        if (isAdminTab(adminTab)) {
          adminViewState.setTab(adminTab);
        }
        const settingsTab = card.dataset['settingsTab'];
        if (isSettingsTab(settingsTab)) {
          settingsViewState.setTab(settingsTab);
          settingsViewState.setMenuOpen(true);
        }

        navigationState.set(card.dataset['target']);
        renderActiveView();
        return;
      }

      if (copyValue) {
        void copyToClipboard(copyValue, card);
        return;
      }

      const adminTab = card.dataset['adminTab'];
      if (isAdminTab(adminTab)) {
        adminViewState.setTab(adminTab);
      }
      const settingsTab = card.dataset['settingsTab'];
      if (isSettingsTab(settingsTab)) {
        settingsViewState.setTab(settingsTab);
        settingsViewState.setMenuOpen(true);
      }

      navigationState.set(card.dataset['target']);
      renderActiveView();
    });
  });
}

async function copyToClipboard(value: string, element: HTMLElement): Promise<void> {
  const now = Date.now();
  if (lastCopyToast?.value === value && now - lastCopyToast.copiedAt < 350) {
    return;
  }

  lastCopyToast = { value, copiedAt: now };

  try {
    await navigator.clipboard.writeText(value);
    element.classList.add('summary-card--copied');
    showToast(`Copiado: ${value}`);
    window.setTimeout(() => {
      element.classList.remove('summary-card--copied');
    }, 1400);
  } catch (error) {
    appendConsoleLine(`No se pudo copiar al portapapeles. Valor: ${value}. ${error instanceof Error ? error.message : String(error)}`);
    showToast('No se pudo copiar al portapapeles', 'error');
  }
}

async function readConfiguredPort(): Promise<string | null> {
  if (!palcmApi) {
    return null;
  }

  try {
    const file = await palcmApi.config.read();
    return file.content.match(/PublicPort=(\d+)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

function readSettingsFormValues(parsed: ParsedPalworldSettings): Map<string, string> {
  const values = new Map<string, string>();

  parsed.settings.forEach((setting) => {
    const definition = getSettingDefinition(setting.key, setting.value);
    const input = document.querySelector<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>(
      `[data-setting-key="${cssEscape(setting.key)}"]`
    );

    if (!input) {
      values.set(setting.key, setting.value);
      return;
    }

    if (definition.kind === 'boolean') {
      values.set(setting.key, input.getAttribute('aria-checked') === 'true' ? 'True' : 'False');
      return;
    }

    if (input instanceof HTMLButtonElement) {
      values.set(setting.key, setting.value);
      return;
    }

    values.set(setting.key, formatSettingValue(definition, input.value, setting.value));
  });

  return values;
}

function bindSettingsControls(parsed: ParsedPalworldSettings): void {
  bindSettingsFilters(parsed);

  document.querySelectorAll<HTMLButtonElement>('.setting-info').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();

      document.querySelectorAll<HTMLButtonElement>('.setting-info--open').forEach((openButton) => {
        if (openButton !== button) {
          openButton.classList.remove('setting-info--open');
        }
      });
      button.classList.toggle('setting-info--open');
    });
  });

  document.querySelectorAll<HTMLElement>('.setting-field input, .setting-field select').forEach((control) => {
    control.addEventListener('click', () => {
      closeSettingInfoPanels();
    });
  });

  if (!settingInfoDismissBound) {
    document.addEventListener('click', () => {
      closeSettingInfoPanels();
    });
    settingInfoDismissBound = true;
  }

  document.querySelectorAll<HTMLButtonElement>('.setting-toggle').forEach((button) => {
    const state = button.querySelector<HTMLElement>('.setting-toggle__state');
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeSettingInfoPanels();
      const nextChecked = button.getAttribute('aria-checked') !== 'true';
      button.setAttribute('aria-checked', nextChecked ? 'true' : 'false');
      if (state) {
        state.textContent = nextChecked ? 'Activo' : 'Inactivo';
      }
      updateAdvancedIniPreview(parsed);
    });
  });

  document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input[data-setting-key], select[data-setting-key]').forEach((input) => {
    input.addEventListener('input', () => {
      updateAdvancedIniPreview(parsed);
    });
    input.addEventListener('change', () => {
      updateAdvancedIniPreview(parsed);
    });
  });

  document.querySelectorAll<HTMLInputElement>('input[data-range-key]').forEach((rangeInput) => {
    const key = rangeInput.dataset['rangeKey'];
    const numberInput = key
      ? document.querySelector<HTMLInputElement>(`input[data-setting-key="${cssEscape(key)}"]`)
      : null;

    if (!numberInput) {
      return;
    }

    rangeInput.addEventListener('input', () => {
      numberInput.value = rangeInput.value;
      updateAdvancedIniPreview(parsed);
    });
    numberInput.addEventListener('input', () => {
      if (numberInput.value.length > 0) {
        rangeInput.value = numberInput.value;
      }
      updateAdvancedIniPreview(parsed);
    });
  });

  document.querySelectorAll<HTMLButtonElement>('.preset-button[data-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      const preset = CONFIGURATION_PRESETS.find((candidate) => candidate.id === button.dataset['preset']);

      if (!preset) {
        return;
      }

      applyConfigurationPreset(preset, parsed);
    });
  });

  document.querySelector<HTMLTextAreaElement>('#config-editor')?.addEventListener('input', () => {
    updateServerDirtyState(parsed);
  });

  updateAdvancedIniPreview(parsed);
}

function bindSettingsFilters(parsed: ParsedPalworldSettings): void {
  const searchInput = document.querySelector<HTMLInputElement>('#settings-search');
  const categorySelect = document.querySelector<HTMLSelectElement>('#settings-category');

  if (!searchInput || !categorySelect) {
    return;
  }

  const apply = (): void => {
    applySettingsFilter(parsed, searchInput.value, categorySelect.value);
  };

  searchInput.addEventListener('input', apply);
  categorySelect.addEventListener('change', apply);
  apply();
}

function applySettingsFilter(parsed: ParsedPalworldSettings, searchValue: string, categoryValue: string): void {
  const query = normalizeSearchText(searchValue);
  const selectedCategory = categoryValue === 'all' ? null : categoryValue;
  const hasActiveFilter = query.length > 0 || selectedCategory !== null;
  let visibleCount = 0;

  document.querySelectorAll<HTMLElement>('[data-setting-card]').forEach((card) => {
    const cardGroup = card.dataset['settingGroup'] ?? '';
    const searchText = card.dataset['search'] ?? '';
    const matchesCategory = !selectedCategory || cardGroup === selectedCategory;
    const matchesSearch = query.length === 0 || searchText.includes(query);
    const isVisible = matchesCategory && matchesSearch;

    card.classList.toggle('hidden', !isVisible);

    if (isVisible) {
      visibleCount += 1;
    }
  });

  document.querySelectorAll<HTMLDetailsElement>('.settings-group').forEach((group) => {
    const visibleInGroup = group.querySelectorAll('[data-setting-card]:not(.hidden)').length;
    const count = group.querySelector<HTMLElement>('[data-group-count]');
    group.classList.toggle('hidden', visibleInGroup === 0);

    if (hasActiveFilter) {
      if (group.dataset['openBeforeFilter'] === undefined) {
        group.dataset['openBeforeFilter'] = group.open ? 'true' : 'false';
      }
      group.open = visibleInGroup > 0;
    } else if (group.dataset['openBeforeFilter'] !== undefined) {
      group.open = group.dataset['openBeforeFilter'] === 'true';
      delete group.dataset['openBeforeFilter'];
    }

    if (count) {
      count.textContent = String(visibleInGroup);
    }
  });

  const countElement = document.querySelector<HTMLElement>('#settings-filter-count');
  if (countElement) {
    countElement.textContent = `${String(visibleCount)} de ${String(parsed.settings.length)} parametros`;
  }

  document.querySelector('#settings-empty-filter')?.remove();
  if (visibleCount === 0) {
    const empty = document.createElement('p');
    empty.id = 'settings-empty-filter';
    empty.className = 'settings-empty-filter';
    empty.textContent = 'No hay parametros que coincidan con el filtro actual.';
    document.querySelector('#settings-form')?.append(empty);
  }
}

function applyConfigurationPreset(
  preset: {
    label: string;
    values: Record<string, string>;
  },
  parsed: ParsedPalworldSettings
): void {
  Object.entries(preset.values).forEach(([key, value]) => {
    const definition = getSettingDefinition(key, value);

    if (definition.kind === 'boolean') {
      const button = document.querySelector<HTMLButtonElement>(`button[data-setting-key="${cssEscape(key)}"]`);
      const nextChecked = value.toLowerCase() === 'true';
      const state = button?.querySelector<HTMLElement>('.setting-toggle__state');

      if (!button) {
        return;
      }

      button.setAttribute('aria-checked', nextChecked ? 'true' : 'false');
      if (state) {
        state.textContent = nextChecked ? 'Activo' : 'Inactivo';
      }
      return;
    }

    const control = document.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-setting-key="${cssEscape(key)}"]`);
    const range = document.querySelector<HTMLInputElement>(`input[data-range-key="${cssEscape(key)}"]`);

    if (control) {
      control.value = value;
    }

    if (range) {
      range.value = value;
    }
  });

  appendConsoleLine(`Perfil aplicado en vista: ${preset.label}. Guarda para escribirlo en el INI.`);
  showToast(`Perfil aplicado: ${preset.label}`);
  updateAdvancedIniPreview(parsed);
}

function closeSettingInfoPanels(): void {
  document.querySelectorAll<HTMLButtonElement>('.setting-info--open').forEach((button) => {
    button.classList.remove('setting-info--open');
  });
}

function updateAdvancedIniPreview(parsed: ParsedPalworldSettings): void {
  const editor = document.querySelector<HTMLTextAreaElement>('#config-editor');

  if (!editor) {
    return;
  }

  editor.value = serializePalworldSettings(parsed, readSettingsFormValues(parsed));
  updateServerDirtyState(parsed);
}

function getServerDirtyState(parsed: ParsedPalworldSettings): {
  dirtyKeys: Set<string>;
  editorChanged: boolean;
  hasChanges: boolean;
} {
  const values = readSettingsFormValues(parsed);
  const dirtyKeys = new Set<string>();
  const editor = document.querySelector<HTMLTextAreaElement>('#config-editor');

  parsed.settings.forEach((setting) => {
    if ((values.get(setting.key) ?? setting.value) !== setting.value) {
      dirtyKeys.add(setting.key);
    }
  });

  const editorChanged = editor ? editor.value !== parsed.originalContent : dirtyKeys.size > 0;

  return {
    dirtyKeys,
    editorChanged,
    hasChanges: dirtyKeys.size > 0 || editorChanged
  };
}

function hasServerPendingChanges(parsed = latestServerSettings): boolean {
  if (!parsed || !navigationState.is('server')) {
    return false;
  }

  return getServerDirtyState(parsed).hasChanges;
}

function updateServerDirtyState(parsed: ParsedPalworldSettings): void {
  const state = getServerDirtyState(parsed);
  const saveButton = document.querySelector<HTMLButtonElement>('#save-config');
  const discardButton = document.querySelector<HTMLButtonElement>('#discard-config');
  const footerMessage = document.querySelector<HTMLElement>('#server-footer-message');

  document.querySelectorAll<HTMLElement>('[data-setting-card-key]').forEach((card) => {
    const key = card.dataset['settingCardKey'];
    card.classList.toggle('setting-field--dirty', Boolean(key && state.dirtyKeys.has(key)));
  });

  if (saveButton) {
    saveButton.disabled = !state.hasChanges;
  }

  if (discardButton) {
    discardButton.disabled = !state.hasChanges;
  }

  rememberServerConfigurationDraft(parsed, state);

  if (!footerMessage) {
    return;
  }

  if (state.dirtyKeys.size > 0) {
    footerMessage.textContent = `${String(state.dirtyKeys.size)} cambios pendientes: guarda para aplicar el INI activo del servidor.`;
    return;
  }

  footerMessage.textContent = state.editorChanged
    ? 'INI avanzado modificado manualmente: guarda para aplicar el archivo.'
    : 'Sin cambios pendientes.';
}

function rememberServerConfigurationDraft(
  parsed = latestServerSettings,
  state?: { hasChanges: boolean }
): void {
  if (!parsed) {
    return;
  }

  const path = latestServerSettingsPath ?? latestSummary?.configurationPath;
  const editor = document.querySelector<HTMLTextAreaElement>('#config-editor');

  if (!path || !editor) {
    return;
  }

  const dirtyState = state ?? getServerDirtyState(parsed);

  if (!dirtyState.hasChanges) {
    return;
  }

  serverConfigurationDraft = {
    path,
    content: editor.value
  };
}

function clearServerConfigurationDraft(): void {
  serverConfigurationDraft = null;
}

function restoreServerConfigurationDraft(parsed: ParsedPalworldSettings, path: string): void {
  if (!serverConfigurationDraft || serverConfigurationDraft.path !== path) {
    return;
  }

  const editor = document.querySelector<HTMLTextAreaElement>('#config-editor');

  if (!editor) {
    return;
  }

  editor.value = serverConfigurationDraft.content;

  try {
    const draft = parsePalworldSettings(serverConfigurationDraft.content);
    draft.settings.forEach((setting) => {
      applySettingControlValue(setting.key, setting.value);
    });
  } catch {
    // Si el usuario edito manualmente un INI invalido, conservamos el texto avanzado
    // para que pueda corregirlo sin perder el borrador.
  }

  updateServerDirtyState(parsed);
}

function applySettingControlValue(key: string, value: string): void {
  const definition = getSettingDefinition(key, value);
  const unquotedValue = unquoteSettingValue(value);

  if (definition.kind === 'boolean') {
    const button = document.querySelector<HTMLButtonElement>(`button[data-setting-key="${cssEscape(key)}"]`);
    const state = button?.querySelector<HTMLElement>('.setting-toggle__state');
    const isChecked = unquotedValue.toLowerCase() === 'true';

    if (!button) {
      return;
    }

    button.setAttribute('aria-checked', isChecked ? 'true' : 'false');
    if (state) {
      state.textContent = isChecked ? 'Activo' : 'Inactivo';
    }
    return;
  }

  const control = document.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-setting-key="${cssEscape(key)}"]`);
  const range = document.querySelector<HTMLInputElement>(`input[data-range-key="${cssEscape(key)}"]`);

  if (control) {
    control.value = unquotedValue;
  }

  if (range) {
    range.value = unquotedValue;
  }
}

function discardServerChanges(parsed: ParsedPalworldSettings): void {
  parsed.settings.forEach((setting) => {
    const definition = getSettingDefinition(setting.key, setting.value);
    const value = unquoteSettingValue(setting.value);

    if (definition.kind === 'boolean') {
      const button = document.querySelector<HTMLButtonElement>(`button[data-setting-key="${cssEscape(setting.key)}"]`);
      const state = button?.querySelector<HTMLElement>('.setting-toggle__state');
      const isChecked = value.toLowerCase() === 'true';

      if (!button) {
        return;
      }

      button.setAttribute('aria-checked', isChecked ? 'true' : 'false');
      if (state) {
        state.textContent = isChecked ? 'Activo' : 'Inactivo';
      }
      return;
    }

    const control = document.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-setting-key="${cssEscape(setting.key)}"]`);
    const range = document.querySelector<HTMLInputElement>(`input[data-range-key="${cssEscape(setting.key)}"]`);

    if (control) {
      control.value = value;
    }

    if (range) {
      range.value = value;
    }
  });

  const editor = document.querySelector<HTMLTextAreaElement>('#config-editor');
  if (editor) {
    editor.value = parsed.originalContent;
  }

  closeSettingInfoPanels();
  clearServerConfigurationDraft();
  updateServerDirtyState(parsed);
  showToast('Cambios descartados');
}

function runUiAction(label: string, action: () => Promise<void>): void {
  void action().catch(async (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    appendConsoleLine(`${label}: ${message}`);
    showToast(label, 'error');
    await refreshState();
  });
}

function showToast(message: string, tone: 'info' | 'error' = 'info'): void {
  if (!toastRegion) {
    return;
  }

  const toast = document.createElement('div');
  toast.className = `toast toast--${tone}`;
  toast.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  toast.textContent = message;
  toastRegion.replaceChildren(toast);

  window.setTimeout(() => {
    toast.classList.add('toast--leaving');
    window.setTimeout(() => {
      toast.remove();
    }, 180);
  }, 2400);
}

function setContent(html: string): void {
  if (contentView) {
    contentView.removeAttribute('aria-busy');
    contentView.innerHTML = html;
  }
}

function exportConsole(): void {
  const lines = historicalLogLines ?? consoleLines;
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = selectedHistoricalLog
    ? selectedHistoricalLog.relativePath.replace('logs/', '')
    : `palcm-console-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
  link.click();
  URL.revokeObjectURL(url);
}

function setText(element: Element | null, value: string): void {
  if (element) {
    element.textContent = value;
  }
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function announceAndFocusView(): void {
  const labels: Record<string, string> = {
    home: 'General',
    server: 'Servidor',
    admin: `Administracion, ${adminViewState.getTab() === 'general' ? 'Servidor' : adminViewState.getTab() === 'players' ? 'Jugadores' : 'Mapa'}`,
    network: 'Red y Firewall',
    backups: 'Backups',
    logs: 'Logs',
    settings: `Configuracion, ${settingsViewState.getTab() === 'summary'
      ? 'Resumen'
      : settingsViewState.getTab() === 'application'
        ? 'Aplicacion'
        : settingsViewState.getTab() === 'automation'
          ? 'Automatizaciones'
          : 'API web'}`
  };
  const label = labels[navigationState.current] ?? 'Contenido';
  setText(viewAnnouncer, `Vista ${label}`);
  window.requestAnimationFrame(() => {
    contentView?.focus({ preventScroll: true });
  });
}

function observeConfirmationFocus(): void {
  if (!appFooter) {
    return;
  }
  const observer = new MutationObserver(() => {
    const isActive = appFooter.classList.contains('app-footer--confirm') && !appFooter.classList.contains('hidden');
    if (isActive && !confirmationFocusActive) {
      confirmationFocusActive = true;
      confirmationReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      appFooter.setAttribute('role', 'alertdialog');
      appFooter.setAttribute('aria-label', 'Confirmar accion');
      window.requestAnimationFrame(() => {
        appFooter.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
      });
      return;
    }
    if (!isActive && confirmationFocusActive) {
      confirmationFocusActive = false;
      appFooter.removeAttribute('role');
      appFooter.removeAttribute('aria-label');
      confirmationReturnFocus?.focus({ preventScroll: true });
      confirmationReturnFocus = null;
    }
  });
  observer.observe(appFooter, { attributes: true, childList: true });
}
