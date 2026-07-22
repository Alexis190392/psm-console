import './styles.css';
import { APP_INFO, APP_VERSION_LABEL } from '../shared/constants/app-info';
import { formatLocalLogTimestamp } from '../shared/utils/local-time';
import { ApplicationStatus } from '../shared/enums/application-status';
import type { AllowedActionsDto } from '../shared/dto/allowed-actions.dto';
import type { AppProcessMetricDto, AppProcessMetricsDto } from '../shared/dto/app-process-metrics.dto';
import type { BackupSummaryDto } from '../shared/dto/backup-status.dto';
import type { FirewallPortCheckDto, FirewallStatusDto } from '../shared/dto/firewall-status.dto';
import type { NetworkDiagnosticsDto } from '../shared/dto/network-diagnostics.dto';
import type { LogModule } from '../shared/dto/log-status.dto';
import type { OperationProgressDto } from '../shared/dto/operation-progress.dto';
import type { PalworldAdminAction, PalworldAdminStatusDto } from '../shared/dto/palworld-admin.dto';
import type { PalworldPlayersStatusDto } from '../shared/dto/palworld-players-status.dto';
import type { PalworldRuntimeStatusDto } from '../shared/dto/palworld-runtime-status.dto';
import {
  createSummaryCardState,
  renderSummaryCard,
  type SummaryCardViewModel
} from './components/summary-card';
import { renderInlineConfirm } from './components/inline-confirm';
import { bindWindowControls } from './components/window-controls';
import { type PalworldSettingDefinition } from './config/palworld-settings-catalog';
import { CONFIGURATION_PRESETS } from './config/configuration-presets';
import { hasConfigurationChangedExternally } from './config/configuration-change-guard';
import { formatSelectOptionLabel, getSettingDefinition } from './config/setting-definition-resolver';
import {
  formatSettingValue,
  parsePalworldSettings,
  serializePalworldSettings,
  unquoteSettingValue,
  type ParsedPalworldSetting,
  type ParsedPalworldSettings
} from './config/palworld-settings-parser';
import { formatBytes, formatDateTime, formatLastVerification } from './utils/format';
import { cssEscape, escapeHtml, normalizeSearchText } from './utils/text';
import { renderBackupsView as renderBackupsViewHtml } from './views/backups-view';
import { renderGeneralView as renderGeneralViewHtml } from './views/general-view';
import { renderPreflightSummaryView, renderSimpleView as renderSimpleViewHtml } from './views/status-views';
import { NavigationState } from './state/navigation-state';

const palcmLogoUrl = new URL('./assets/palcm-logo.png', import.meta.url).href;

const appRoot = document.querySelector<HTMLDivElement>('#app');

if (!appRoot) {
  throw new Error('Renderer root element was not found.');
}

function renderIcon(name: string, extraClass = ''): string {
  const className = `ui-icon ui-icon--${name}${extraClass ? ` ${extraClass}` : ''}`;

  return `<span class="${className}" aria-hidden="true"></span>`;
}

const rootElement = appRoot;

rootElement.innerHTML = `
  <header class="titlebar">
    <div class="titlebar__brand">
      <img class="titlebar__logo" src="${palcmLogoUrl}" alt="" />
      <span>${escapeHtml(APP_INFO.displayName)}</span>
    </div>
    <div class="titlebar__spacer"></div>
    <button id="window-minimize" class="window-button" aria-label="Minimizar">${renderIcon('minus')}</button>
    <button id="window-maximize" class="window-button" aria-label="Maximizar">${renderIcon('maximize')}</button>
    <button id="window-close" class="window-button window-button--close" aria-label="Cerrar">${renderIcon('x')}</button>
  </header>
  <aside class="sidebar">
    <section class="sidebar__identity">
      <img class="sidebar__logo" src="${palcmLogoUrl}" alt="" />
      <div>
        <h1>${escapeHtml(APP_INFO.shortName)}</h1>
        <p>${escapeHtml(APP_VERSION_LABEL)}</p>
        <p class="sidebar__credit">by <strong>${escapeHtml(APP_INFO.authorAlias)}</strong></p>
      </div>
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
            <span>Servidor</span>
          </a>
          <a class="sidebar__sublink sidebar__link--locked" data-nav="admin" data-admin-sidebar-tab="players" href="#">
            <span>Jugadores</span>
          </a>
          <a class="sidebar__sublink sidebar__link--locked" data-nav="admin" data-admin-sidebar-tab="map" href="#">
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
      <section id="process-metrics-panel" class="process-metrics hidden" aria-live="polite">
        <div class="process-metrics__header">
          <div>
            <span class="view-kicker">PROCESOS DE LA APP</span>
            <strong>Identificacion rapida</strong>
          </div>
          <button id="refresh-process-metrics" class="secondary-button icon-button" type="button" aria-label="Actualizar procesos" title="Actualizar procesos">
            ${renderIcon('refresh')}
          </button>
        </div>
        <div id="process-metrics-list" class="process-metrics__grid">
          <p class="empty-state empty-state--compact">Abre Logs para revisar los subprocesos de PSM Console.</p>
        </div>
      </section>
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
        </div>
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
          <span id="operation-message" class="operation-message">Sin operacion activa.</span>
        </div>
      </div>
      <div id="content-view" class="content-view hidden"></div>
    </section>
  </main>
  <footer id="app-footer" class="app-footer hidden"></footer>
  <div id="toast-region" class="toast-region" aria-live="polite" aria-atomic="true"></div>
`;

const palcmApi = window.palcm;

bindWindowControls();

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
const toastRegion = document.querySelector<HTMLElement>('#toast-region');
const sidebarRuntimeStatus = document.querySelector<HTMLElement>('#sidebar-runtime-status');
const startServerAction = document.querySelector<HTMLButtonElement>('#start-server-action');
const navLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-nav]'));
const adminNavGroup = document.querySelector<HTMLElement>('[data-nav-group="admin"]');
const consoleLines: string[] = [];
const operationLogOffsets = new Map<string, number>();
let firewallLoadingTimers: number[] = [];
let latestFirewallStatus: FirewallStatusDto | null = null;
let firewallStatusRequest: Promise<FirewallStatusDto> | null = null;
let latestFirewallError: string | null = null;
let firewallRequestStartedAt = 0;
let latestFirewallCheckedAt: Date | null = null;
let latestLocalAddresses: string[] = [];
let latestPublicNetwork: NetworkDiagnosticsDto | null = null;
let latestPublicNetworkError: string | null = null;
let publicNetworkRequest: Promise<NetworkDiagnosticsDto> | null = null;
let latestPublicNetworkPort: string | null = null;
let publicNetworkRequestPort: string | null = null;
let latestConfiguredPort: string | null = null;
let latestBackupSummary: BackupSummaryDto | null = null;
let adminRefreshTimer: number | null = null;
let adminRefreshInFlight = false;
let adminActiveTab: 'general' | 'players' | 'map' = 'general';
let adminMenuOpen = false;
let consoleSearchTerm = '';
let consoleSelectedModule: LogModule | 'all' = 'all';
let consolePaused = false;
let latestPersistentLogsSignature = '';
let settingInfoDismissBound = false;
let latestServerSettings: ParsedPalworldSettings | null = null;
let configurationAutoCreateAttempted = false;
let pendingAction: 'steamcmd' | 'server' | 'config' | null = null;
const navigationState = new NavigationState();
let latestStatus: ApplicationStatus = ApplicationStatus.BOOTSTRAPPING;
let latestActions: AllowedActionsDto | null = null;
let lastCopyToast: { value: string; copiedAt: number } | null = null;
let latestSummary: {
  steamCmdStatus: string;
  serverStatus: string;
  configurationStatus: string;
  configurationPath: string;
  serverPath: string;
} | null = null;

type DiagnosticStepState = 'done' | 'active' | 'pending' | 'error';

interface DiagnosticStepDefinition {
  title: string;
  detail: string;
  activeDetail: string;
}

const FIREWALL_DIAGNOSTIC_STEPS: DiagnosticStepDefinition[] = [
  {
    title: 'Leyendo configuracion del servidor',
    detail: 'Se leyo PalWorldSettings.ini y se ubicaron los puertos activos.',
    activeDetail: 'Abriendo PalWorldSettings.ini para leer PublicPort, RCON y REST API.'
  },
  {
    title: 'Detectando direcciones y puertos',
    detail: 'Se detectaron las IP LAN disponibles y los puertos que debe usar el servidor.',
    activeDetail: 'Buscando IP LAN disponible y preparando la validacion de UDP/TCP configurada.'
  },
  {
    title: 'Revisando Firewall de Windows',
    detail: 'Se consultaron reglas de entrada asociadas a PalServer.exe y a los puertos activos.',
    activeDetail: 'Consultando reglas locales de entrada para saber si Windows permite conexiones al servidor.'
  },
  {
    title: 'Comprobando acceso externo',
    detail: 'Se consulto IP publica, posible NAT/CGNAT y respuesta externa del puerto.',
    activeDetail: 'Consultando IP publica y probando el puerto desde fuera para diferenciar router, NAT o CGNAT.'
  }
];
const DEFAULT_FIREWALL_DIAGNOSTIC_STEP: DiagnosticStepDefinition = FIREWALL_DIAGNOSTIC_STEPS[0] ?? {
  title: 'Preparando diagnostico',
  detail: 'Diagnostico inicializado.',
  activeDetail: 'Preparando lectura de red y firewall.'
};

if (!palcmApi) {
  showIpcError('El preload seguro no expuso window.palcm. Revisar preload, sandbox y build.');
} else {
  await refreshState();

  confirmActionButton?.addEventListener('click', () => {
    void runPendingAction();
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
    consoleLines.splice(0, consoleLines.length);
    operationLogOffsets.clear();
    latestPersistentLogsSignature = '';
    renderConsoleOutput();
  });
  refreshProcessMetricsButton?.addEventListener('click', () => {
    void loadAppProcessMetrics();
  });
  startServerAction?.addEventListener('click', () => {
    if (latestStatus === ApplicationStatus.SERVER_RUNNING) {
      void stopPalworldServer();
      return;
    }

    void startPalworldServer();
  });

  navLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();

      if (link.getAttribute('aria-disabled') === 'true') {
        return;
      }

      const nextView = link.dataset['nav'] ?? 'home';
      if (nextView === 'admin') {
        adminMenuOpen = true;
        const requestedAdminTab = link.dataset['adminSidebarTab'];
        if (isAdminTab(requestedAdminTab)) {
          adminActiveTab = requestedAdminTab;
        }
      }

      if (navigationState.is('server') && nextView !== 'server' && hasServerPendingChanges()) {
        showLeaveServerConfirmation(nextView);
        return;
      }

      navigationState.set(nextView);
      renderActiveView();
      updateNavigation(latestStatus);
    });
  });
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
        void createDefaultConfiguration({ automatic: true });
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
  await pollOperation(accepted.operationId);
  await refreshState();
}

async function installServer(): Promise<void> {
  if (!palcmApi) {
    return;
  }

  disableConfirmationButtons();
  appendConsoleLine('Confirmado: instalar Palworld Dedicated Server.');
  const accepted = await palcmApi.server.install({ confirmed: true });
  await pollOperation(accepted.operationId);
  await refreshState();
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
  await pollOperation(accepted.operationId);
  await refreshState();
}

async function startPalworldServer(): Promise<void> {
  if (!palcmApi || !latestActions?.canStartServer || !isLanReadyForServerStart()) {
    appendConsoleLine('No se inicio el servidor: falta confirmar el puerto UDP de jugadores en Windows.');
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
): Promise<void> {
  if (!palcmApi) {
    return;
  }

  let operation: OperationProgressDto;

  let shouldContinuePolling = true;

  while (shouldContinuePolling) {
    operation = await palcmApi.operation.get(operationId);
    renderOperation(operation);

    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(operation.status)) {
      shouldContinuePolling = false;
      continue;
    }

    if (options.refreshStatusWhileRunning) {
      await refreshStatusChrome();
    }

    await wait(500);
  }

  if (options.refreshStatusWhileRunning) {
    await refreshStatusChrome();
  }
}

function renderOperation(operation: OperationProgressDto): void {
  setText(operationMessage, `${String(operation.percent)}% - ${operation.message}`);
  appendOperationLogs(operation);

  if (progressBar) {
    progressBar.style.width = `${String(operation.percent)}%`;
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

  const visibleLines = consoleSearchTerm
    ? consoleLines.filter((line) => line.toLowerCase().includes(consoleSearchTerm))
    : consoleLines;

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
    adminMenuOpen = false;
  }

  navLinks.forEach((link) => {
    const nav = link.dataset['nav'];
    const enabled =
      nav === 'home' ||
      (nav === 'server' && serverAvailable) ||
      (nav === 'admin' && serverRunning) ||
      (nav === 'logs' && logsAvailable) ||
      (nav === 'backups' && serverAvailable) ||
      (nav === 'network' && serverAvailable);

    link.classList.toggle('sidebar__link--locked', !enabled);
    link.classList.toggle('sidebar__link--active', isSidebarNavActive(link));
    link.setAttribute('aria-disabled', enabled ? 'false' : 'true');
  });

  if (adminNavGroup) {
    adminNavGroup.classList.toggle('hidden', !serverRunning);
    adminNavGroup.classList.toggle('sidebar__group--open', serverRunning && (adminMenuOpen || navigationState.is('admin')));
    adminNavGroup.classList.toggle('sidebar__group--collapsed', !serverRunning || (!adminMenuOpen && !navigationState.is('admin')));
  }
}

function isSidebarNavActive(link: HTMLAnchorElement): boolean {
  const nav = link.dataset['nav'];
  if (nav !== navigationState.current) {
    return false;
  }

  if (nav !== 'admin') {
    return true;
  }

  if (link.dataset['adminGroupToggle'] === 'true') {
    return false;
  }

  const requestedAdminTab = link.dataset['adminSidebarTab'];
  if (!requestedAdminTab) {
    return true;
  }

  return isAdminTab(requestedAdminTab) && requestedAdminTab === adminActiveTab;
}

function isAdminTab(value: string | undefined): value is 'general' | 'players' | 'map' {
  return value === 'general' || value === 'players' || value === 'map';
}

function updateStartServerButton(actions: AllowedActionsDto): void {
  if (!startServerAction) {
    return;
  }

  if (latestStatus === ApplicationStatus.SERVER_STARTING) {
    startServerAction.disabled = true;
    startServerAction.textContent = 'Iniciando servidor';
    updateSidebarRuntimeStatus('starting', 'Iniciando');
    return;
  }

  if (latestStatus === ApplicationStatus.SERVER_RUNNING) {
    startServerAction.disabled = !actions.canStopServer;
    startServerAction.textContent = actions.canStopServer ? 'Detener servidor' : 'Servidor activo';
    updateSidebarRuntimeStatus('running', 'Ejecutandose');
    return;
  }

  if (latestStatus === ApplicationStatus.ERROR) {
    startServerAction.disabled = true;
    startServerAction.textContent = 'Servidor bloqueado';
    updateSidebarRuntimeStatus('error', 'Revisar logs');
    return;
  }

  const canStart = actions.canStartServer && isLanReadyForServerStart();
  startServerAction.disabled = !canStart;
  startServerAction.textContent = canStart ? 'Iniciar servidor' : 'Servidor bloqueado';
  updateSidebarRuntimeStatus(canStart ? 'ready' : 'blocked', canStart ? 'Listo para iniciar' : 'Bloqueado');
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

function isLanReadyForServerStart(): boolean {
  if (!latestConfiguredPort) {
    return false;
  }

  if (latestFirewallStatus) {
    const playerPort = getPlayerLocalPortCheck(latestFirewallStatus);
    return playerPort?.state === 'READY';
  }

  return latestLocalAddresses.length > 0;
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
    void renderGeneralView();
    return;
  }

  if (navigationState.is('server')) {
    void renderServerConfigurationView();
    return;
  }

  if (navigationState.is('admin')) {
    void renderAdminView();
    return;
  }

  if (navigationState.is('network')) {
    void renderFirewallView();
    return;
  }

  if (navigationState.is('backups')) {
    void renderBackupsView();
    return;
  }

  if (navigationState.is('logs')) {
    void loadAppProcessMetrics();
    void loadPersistentLogs();
  }

}

async function renderGeneralView(): Promise<void> {
  updateReadyChrome();

  if (!isOperationalStatus(latestStatus)) {
    renderPreflightSummary();
    return;
  }

  const port = await readConfiguredPort();
  latestConfiguredPort = port;
  const portState = port ? createSummaryCardState('ok') : createSummaryCardState('warning');
  const isNetworkLoading = !latestFirewallStatus && !latestFirewallError;
  const localPlay = createLocalPlaySummary(latestFirewallStatus, port, isNetworkLoading, latestLocalAddresses);
  const isPublicNetworkLoading = !latestFirewallStatus && !latestFirewallError && !latestPublicNetwork && !latestPublicNetworkError;
  const publicPlay = createPublicPlaySummary(latestFirewallStatus, isPublicNetworkLoading, latestPublicNetwork, port);
  const backupSummary = await readBackupSummaryForGeneral();
  const backupState = createBackupSummaryCard(backupSummary);
  const serverRuntime = await readServerRuntimeForGeneral();
  const serverState = createServerRuntimeSummary(serverRuntime);
  const playersSummary = await readPlayersStatusForGeneral();
  const playersState = createPlayersSummaryCard(playersSummary);
  const networkFreshness = formatLastVerification(latestFirewallCheckedAt);

  setContent(renderGeneralViewHtml({
    networkFreshness,
    cards: [
      {
          title: 'SteamCMD',
          value: 'Instalado',
          detail: 'Cliente listo para actualizar y validar archivos.',
          target: 'logs',
          ...createSummaryCardState('ok')
      },
      {
          title: 'Servidor',
          value: serverState.value,
          detail: serverState.detail,
          target: serverState.state.tone === 'error' ? 'logs' : 'server',
          ...serverState.state
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
      {
          title: 'Jugadores',
          value: playersState.value,
          detail: playersState.detail,
          target: 'admin',
          adminTab: 'players',
          ...playersState.state
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
  void hydrateGeneralLocalPreview(port);
  void hydrateGeneralPublicPreview(port);
  void hydrateGeneralNetworkSummary(port);
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

async function hydrateGeneralLocalPreview(port: string | null): Promise<void> {
  const addresses = await readLocalAddressesForGeneral();

  if (addresses.length > 0) {
    latestLocalAddresses = addresses;
  }
  refreshStartButtonState();

  if (!navigationState.is('home') || !isOperationalStatus(latestStatus) || latestFirewallStatus) {
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

async function hydrateGeneralNetworkSummary(port: string | null): Promise<void> {
  const firewall = await readFirewallStatusForGeneral();

  refreshStartButtonState();

  if (!navigationState.is('home') || !isOperationalStatus(latestStatus)) {
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

async function hydrateGeneralPublicPreview(port: string | null): Promise<void> {
  const publicNetwork = await readPublicNetworkForGeneral(port);

  if (!navigationState.is('home') || !isOperationalStatus(latestStatus) || latestFirewallStatus) {
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

async function renderServerConfigurationView(): Promise<void> {
  if (!palcmApi) {
    return;
  }

  updateReadyChrome();

  try {
    const file = await palcmApi.config.read();
    const parsed = parsePalworldSettings(file.content);
    latestServerSettings = parsed;
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
  } catch (error) {
    latestServerSettings = null;
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
  await pollOperation(accepted.operationId);
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
  await pollOperation(accepted.operationId);
  showToast('Configuracion default restaurada');
  navigationState.set('server');
  await refreshState();
}

function showRestoreDefaultConfirmation(): void {
  if (!appFooter) {
    return;
  }

  appFooter.classList.remove('hidden');
  appFooter.classList.remove('app-footer--confirm');
  appFooter.innerHTML = renderInlineConfirm({
    message: 'Se creara un backup y se reemplazara la configuracion activa por los valores default instalados.',
    actions: [
      { id: 'confirm-restore-default', label: 'Restaurar default', tone: 'warning' },
      { id: 'cancel-restore-default', label: 'Cancelar', tone: 'secondary' }
    ]
  });
  document.querySelector<HTMLButtonElement>('#confirm-restore-default')?.addEventListener('click', () => {
    void restoreDefaultConfiguration();
  });
  document.querySelector<HTMLButtonElement>('#cancel-restore-default')?.addEventListener(
    'click',
    hideRestoreDefaultConfirmation
  );
}

async function renderBackupsView(): Promise<void> {
  if (!palcmApi) {
    return;
  }

  updateReadyChrome();

  try {
    latestBackupSummary = await palcmApi.backup.getSummary();
    const summary = latestBackupSummary;

    setContent(renderBackupsViewHtml(summary));
    renderBackupsFooter();
    document.querySelectorAll<HTMLInputElement>('[data-backup-select]').forEach((checkbox) => {
      checkbox.addEventListener('change', updateSelectedBackupsState);
    });
    updateSelectedBackupsState();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    renderSimpleView('Backups', `No se pudo leer el estado de backups. ${message}`);
  }
}

function stopRuntimeViewRefreshers(): void {
  if (adminRefreshTimer !== null) {
    window.clearInterval(adminRefreshTimer);
    adminRefreshTimer = null;
  }
}

async function renderAdminView(): Promise<void> {
  if (!palcmApi) {
    return;
  }

  renderAdminLoading();
  await refreshAdminView();
  startAdminAutoRefresh();
}

function renderAdminLoading(): void {
  setContent(`
    <div class="view-stack admin-view">
      <section class="content-card players-loading">
        <span class="inline-loader" aria-hidden="true"></span>
        <div>
          <p class="eyebrow">ADMINISTRACION</p>
          <h3>Panel del servidor</h3>
          <p>Verificando REST API local y jugadores activos.</p>
        </div>
      </section>
    </div>
  `);
}

async function refreshAdminView(options: { force?: boolean } = {}): Promise<void> {
  if (!palcmApi || adminRefreshInFlight || !navigationState.is('admin')) {
    return;
  }

  adminRefreshInFlight = true;
  try {
    const [adminStatus, playersStatus] = await Promise.all([
      palcmApi.admin.getStatus(),
      palcmApi.players.getStatus()
    ]);

    if (navigationState.is('admin') && (options.force || !isEditingAdminForm())) {
      setContent(renderAdminStatus(adminStatus, playersStatus));
      bindAdminControls();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (navigationState.is('admin')) {
      renderSimpleView('Administracion', `No se pudo cargar el panel administrativo. ${message}`);
    }
  } finally {
    adminRefreshInFlight = false;
  }
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

function renderAdminStatus(adminStatus: PalworldAdminStatusDto, playersStatus: PalworldPlayersStatusDto): string {
  const isReady = adminStatus.status === 'READY';

  return `
    <div class="view-stack admin-view">
      <section class="content-card admin-panel">
        ${
          isReady
            ? renderAdminTabs(adminStatus, playersStatus)
            : `<div class="admin-toolbar"><span class="view-kicker">ADMINISTRACION</span><span class="view-meta-pill">${escapeHtml(adminStatus.message)}</span></div><p class="empty-state">${escapeHtml(adminStatus.message)}</p>`
        }
      </section>
    </div>
  `;
}

function renderAdminTabs(adminStatus: PalworldAdminStatusDto, playersStatus: PalworldPlayersStatusDto): string {
  const tabLabel: Record<typeof adminActiveTab, string> = {
    general: 'SERVIDOR',
    players: 'JUGADORES',
    map: 'MAPA'
  };

  return `
    <div class="admin-toolbar">
      <span class="view-kicker">ADMINISTRACION / ${tabLabel[adminActiveTab]}</span>
      <span class="view-meta-pill">${escapeHtml(adminStatus.message)}</span>
    </div>
    ${renderAdminActiveTab(adminStatus, playersStatus)}
  `;
}

function renderAdminActiveTab(adminStatus: PalworldAdminStatusDto, playersStatus: PalworldPlayersStatusDto): string {
  if (adminActiveTab === 'players') {
    return renderAdminPlayersTab(playersStatus);
  }

  if (adminActiveTab === 'map') {
    return renderAdminMapTab(playersStatus);
  }

  return renderAdminGeneralTab(adminStatus);
}

function renderAdminGeneralTab(adminStatus: PalworldAdminStatusDto): string {
  return `
    <div class="admin-snapshot-grid">
      ${renderAdminSnapshotCard('Servidor', 'Info oficial del servidor', adminStatus.info)}
      ${renderAdminSnapshotCard('Metricas', 'Rendimiento reportado por REST', adminStatus.metrics)}
      ${renderAdminSnapshotCard('Settings', 'Configuracion activa leida del servidor', adminStatus.settings)}
    </div>
    <div class="admin-grid">
      <form class="admin-card" data-admin-form="save">
        <span class="view-kicker">MUNDO</span>
        <h4>Guardar mundo</h4>
        <p>Solicita un guardado manual del estado actual del servidor.</p>
        <button class="secondary-button button-with-icon" type="submit">
          ${renderIcon('save')}
          <span>Guardar ahora</span>
        </button>
      </form>
      <form class="admin-card" data-admin-form="shutdown">
        <span class="view-kicker">APAGADO</span>
        <h4>Apagado programado</h4>
        <input name="seconds" type="number" min="0" max="3600" value="60" />
        <input name="message" type="text" value="Servidor detenido desde PSM Console." />
        <button class="secondary-button button-with-icon" type="submit">
          ${renderIcon('clock')}
          <span>Programar</span>
        </button>
      </form>
      <form class="admin-card admin-card--danger" data-admin-form="stop">
        <span class="view-kicker">EMERGENCIA</span>
        <h4>Detener ahora</h4>
        <p>Fuerza la detencion inmediata del servidor desde REST. Usalo solo si no responde el apagado programado.</p>
        <button class="secondary-button secondary-button--warning button-with-icon" type="submit">
          ${renderIcon('stop')}
          <span>Forzar detencion</span>
        </button>
      </form>
    </div>
  `;
}

function renderAdminPlayersTab(playersStatus: PalworldPlayersStatusDto): string {
  return `
    <form class="admin-broadcast-bar" data-admin-form="announce">
      <span class="view-kicker">ANUNCIO GLOBAL</span>
      <div class="admin-broadcast-bar__row">
        <input name="message" type="text" placeholder="Mensaje para todos los jugadores" required />
        <button class="primary-button icon-button" type="submit" aria-label="Enviar anuncio" title="Enviar anuncio">
          ${renderIcon('send')}
        </button>
      </div>
    </form>
    <div class="admin-players-layout">
      <section class="admin-players-panel admin-players-panel--wide">
        <div class="players-list-card__header">
          <div>
            <p class="eyebrow">JUGADORES</p>
            <h3>Jugadores conectados</h3>
          </div>
          <span>${renderPlayersHeaderMeta(playersStatus)}</span>
        </div>
        ${renderAdminPlayersList(playersStatus)}
      </section>
    </div>
  `;
}

function renderAdminMapTab(playersStatus: PalworldPlayersStatusDto): string {
  if (playersStatus.status !== 'READY') {
    return `
      <section class="admin-map-panel">
        <p class="empty-state">${escapeHtml(playersStatus.message)}</p>
      </section>
    `;
  }

  const locatedPlayers = playersStatus.players.filter(hasPlayerLocation);

  if (locatedPlayers.length === 0) {
    return `
      <section class="admin-map-panel">
        <div class="admin-map__header">
          <div>
            <span class="view-kicker">MAPA</span>
            <h3>Ubicacion de jugadores</h3>
          </div>
          <span class="view-meta-pill">${escapeHtml(formatDateTime(playersStatus.updatedAt))}</span>
        </div>
        <p class="empty-state">No hay jugadores conectados con coordenadas reportadas por la REST API.</p>
      </section>
    `;
  }

  const bounds = getPlayerMapBounds(locatedPlayers);

  return `
    <section class="admin-map-panel">
      <div class="admin-map__header">
        <div>
          <span class="view-kicker">MAPA</span>
          <h3>Ubicacion de jugadores</h3>
        </div>
        <span class="view-meta-pill">${String(locatedPlayers.length)} activos</span>
      </div>
      <div class="admin-map-layout">
        <div class="admin-map-stage" role="img" aria-label="Mapa relativo de jugadores conectados">
          <div class="admin-map-stage__axis admin-map-stage__axis--x">X</div>
          <div class="admin-map-stage__axis admin-map-stage__axis--y">Y</div>
          ${locatedPlayers.map((player, index) => renderPlayerMapMarker(player, bounds, index)).join('')}
        </div>
        <div class="admin-map-list">
          ${locatedPlayers.map(renderPlayerMapListItem).join('')}
        </div>
      </div>
    </section>
  `;
}

function renderAdminSnapshotCard(
  title: string,
  detail: string,
  snapshot: PalworldAdminStatusDto['info']
): string {
  const entries = Object.entries(snapshot ?? {}).slice(0, 6);

  return `
    <article class="admin-snapshot-card">
      <span class="view-kicker">${escapeHtml(title.toUpperCase())}</span>
      <h4>${escapeHtml(title)}</h4>
      <p>${escapeHtml(detail)}</p>
      ${
        entries.length > 0
          ? `<dl>${entries.map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(String(value))}</dd></div>`).join('')}</dl>`
          : '<small>Sin datos disponibles en este momento.</small>'
      }
    </article>
  `;
}

function bindAdminControls(): void {
  document.querySelectorAll<HTMLFormElement>('[data-admin-form]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!form.reportValidity()) {
        return;
      }
      const submitter = event instanceof SubmitEvent && event.submitter instanceof HTMLButtonElement
        ? event.submitter
        : null;
      showAdminConfirmation(form, submitter);
    });
  });
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
    void executeAdminAction(form, action);
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

function renderPlayersHeaderMeta(summary: PalworldPlayersStatusDto): string {
  const capacity = `${String(summary.currentPlayers)}${summary.maxPlayers ? `/${String(summary.maxPlayers)}` : ''}`;
  return summary.status === 'READY'
    ? `${capacity} - ${formatDateTime(summary.updatedAt)}`
    : formatDateTime(summary.updatedAt);
}

function renderAdminPlayersList(summary: PalworldPlayersStatusDto): string {
  if (summary.status !== 'READY') {
    return `<p class="empty-state">${escapeHtml(summary.message)}</p>`;
  }

  const previousPlayers = summary.previousPlayers ?? [];

  if (summary.players.length === 0 && previousPlayers.length === 0) {
    return '<p class="empty-state">No hay jugadores detectados todavia.</p>';
  }

  return `
    <div class="players-sections">
      ${renderPlayersSection('En curso', summary.players, 'No hay jugadores conectados en este momento.', true)}
      ${renderPlayersSection('Vistos anteriormente', previousPlayers, 'Todavia no hay jugadores anteriores.', false)}
    </div>
  `;
}

function renderPlayersSection(
  title: string,
  players: PalworldPlayersStatusDto['players'],
  emptyMessage: string,
  allowKick: boolean
): string {
  return `
    <section class="players-section">
      <div class="players-section__header">
        <h4>${escapeHtml(title)}</h4>
        <span>${String(players.length)}</span>
      </div>
      ${
        players.length > 0
          ? `<div class="players-list">${players.map((player) => renderAdminPlayerRow(player, allowKick)).join('')}</div>`
          : `<p class="empty-state empty-state--compact">${escapeHtml(emptyMessage)}</p>`
      }
    </section>
  `;
}

function renderAdminPlayerRow(player: PalworldPlayersStatusDto['players'][number], allowKick: boolean): string {
  const actionId = player.userId ?? player.steamId ?? player.playerId ?? '';
  const identity = actionId || 'ID no informado';
  const isBanned = player.banState === 'BANNED';
  const banAction: PalworldAdminAction = isBanned ? 'unban' : 'ban';
  const locationText = hasPlayerLocation(player)
    ? `X ${formatCoordinate(player.locationX)}, Y ${formatCoordinate(player.locationY)}`
    : null;
  const secondary = [
    player.playerId ? `PlayerUID ${player.playerId}` : null,
    player.userId ? `UserID ${player.userId}` : null,
    player.steamId ? `SteamID ${player.steamId}` : null,
    locationText
  ].filter((value): value is string => value !== null);
  const statusText = player.online
    ? 'Conectado'
    : player.lastSeenAt
      ? `Visto ${formatDateTime(player.lastSeenAt)}`
      : 'Visto anteriormente';

  return `
    <article class="player-row ${player.online ? 'player-row--online' : 'player-row--previous'}">
      <div>
        <strong>${escapeHtml(player.name)}</strong>
        <span>${escapeHtml(identity)}</span>
      </div>
      <small>${escapeHtml(secondary.join(' - ') || 'Sin identificadores adicionales')}</small>
      <em>${player.online && typeof player.ping === 'number' ? `${formatPing(player.ping)} ms` : escapeHtml(statusText)}</em>
      <form class="player-row__actions" data-admin-form="player">
        <input name="userId" type="hidden" value="${escapeHtml(actionId)}" />
        <input name="message" type="hidden" value="Accion aplicada desde PSM Console." />
        <button class="admin-icon-button secondary-button icon-button" type="submit" data-player-action="kick" ${actionId && allowKick ? '' : 'disabled'} aria-label="Expulsar jugador" title="${allowKick ? 'Expulsar jugador' : 'Solo disponible para jugadores conectados'}">
          ${renderIcon('send')}
        </button>
        <button class="ban-toggle ${isBanned ? 'ban-toggle--active' : ''}" type="submit" data-player-action="${banAction}" ${actionId ? '' : 'disabled'} aria-pressed="${isBanned ? 'true' : 'false'}" aria-label="${isBanned ? 'Desbanear jugador' : 'Banear jugador'}" title="${isBanned ? 'Desbanear jugador' : 'Banear jugador'}">
          <span class="ban-toggle__track" aria-hidden="true"><span class="ban-toggle__thumb"></span></span>
          <span>${isBanned ? 'Baneado' : 'Permitido'}</span>
        </button>
      </form>
    </article>
  `;
}

interface PlayerMapBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function hasPlayerLocation(
  player: PalworldPlayersStatusDto['players'][number]
): player is PalworldPlayersStatusDto['players'][number] & { locationX: number; locationY: number } {
  return typeof player.locationX === 'number' &&
    Number.isFinite(player.locationX) &&
    typeof player.locationY === 'number' &&
    Number.isFinite(player.locationY);
}

function getPlayerMapBounds(players: Array<PalworldPlayersStatusDto['players'][number] & { locationX: number; locationY: number }>): PlayerMapBounds {
  const xs = players.map((player) => player.locationX);
  const ys = players.map((player) => player.locationY);

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  };
}

function renderPlayerMapMarker(
  player: PalworldPlayersStatusDto['players'][number] & { locationX: number; locationY: number },
  bounds: PlayerMapBounds,
  index: number
): string {
  const position = getPlayerMapPosition(player, bounds);
  const initials = getPlayerInitials(player.name);

  return `
    <article class="admin-map-marker" style="left: ${position.left}%; top: ${position.top}%;" title="${escapeHtml(player.name)}">
      <span class="admin-map-marker__pin">${escapeHtml(initials)}</span>
      <span class="admin-map-marker__label">${escapeHtml(player.name || `Jugador ${String(index + 1)}`)}</span>
    </article>
  `;
}

function renderPlayerMapListItem(
  player: PalworldPlayersStatusDto['players'][number] & { locationX: number; locationY: number }
): string {
  const details = [
    typeof player.level === 'number' ? `Nivel ${String(player.level)}` : null,
    typeof player.ping === 'number' ? `${formatPing(player.ping)} ms` : null,
    typeof player.locationZ === 'number' ? `Z ${formatCoordinate(player.locationZ)}` : null
  ].filter((value): value is string => value !== null);

  return `
    <article class="admin-map-player">
      <strong>${escapeHtml(player.name)}</strong>
      <span>X ${formatCoordinate(player.locationX)} / Y ${formatCoordinate(player.locationY)}</span>
      <small>${escapeHtml(details.join(' - ') || 'Sin datos adicionales')}</small>
    </article>
  `;
}

function getPlayerMapPosition(
  player: PalworldPlayersStatusDto['players'][number] & { locationX: number; locationY: number },
  bounds: PlayerMapBounds
): { left: string; top: string } {
  const left = normalizeMapAxis(player.locationX, bounds.minX, bounds.maxX);
  const top = 100 - normalizeMapAxis(player.locationY, bounds.minY, bounds.maxY);

  return {
    left: left.toFixed(2),
    top: top.toFixed(2)
  };
}

function normalizeMapAxis(value: number, min: number, max: number): number {
  if (min === max) {
    return 50;
  }

  const padding = 8;
  const normalized = ((value - min) / (max - min)) * (100 - padding * 2) + padding;
  return Math.min(100 - padding, Math.max(padding, normalized));
}

function getPlayerInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = words.slice(0, 2).map((word) => word[0]?.toUpperCase() ?? '').join('');
  return initials || 'J';
}

function formatCoordinate(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatPing(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function renderBackupsFooter(): void {
  if (!appFooter) {
    return;
  }

  appFooter.classList.remove('hidden', 'app-footer--confirm');
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
    void createBackup(kind);
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
  const selectedCount = getSelectedBackupIds().length;

  if (!deleteButton || !restoreButton) {
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
  restoreButton.disabled = selectedCount !== 1;
  setText(
    document.querySelector('#backup-footer-message'),
    selectedCount === 0
      ? 'Selecciona backups para enviarlos a la papelera de Windows.'
      : selectedCount === 1
        ? '1 backup seleccionado. Puedes restaurarlo o enviarlo a la papelera.'
      : `${String(selectedCount)} backup(s) seleccionados.`
  );
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
    void restoreBackup(backupId);
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
    void deleteBackups(backupIds);
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

  await pollOperation(accepted.operationId);
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
    await pollOperation(accepted.operationId);
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

  await pollOperation(accepted.operationId);
  latestBackupSummary = null;
  showToast('Backup restaurado');
  navigationState.set('backups');
  await refreshState();
}

async function loadPersistentLogs(): Promise<void> {
  if (!palcmApi) {
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
  return `
    <article class="process-card process-card--${escapeHtml(process.kind)}">
      <div>
        <strong>PSMc ${escapeHtml(process.label)}</strong>
        <span>PID ${String(process.pid)}</span>
      </div>
      <p>${escapeHtml(process.detail)}</p>
      <dl>
        <div><dt>CPU</dt><dd>${formatProcessCpu(process.cpuPercent)}</dd></div>
        <div><dt>Memoria</dt><dd>${escapeHtml(formatBytes(process.memoryBytes))}</dd></div>
      </dl>
    </article>
  `;
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
  const shouldHidePreflightChrome = isOperationalStatus(latestStatus) && !navigationState.is('logs');
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
    appFooter.innerHTML = '';
  }
}

function renderServerFooter(parsed: ParsedPalworldSettings): void {
  if (!appFooter) {
    return;
  }

  appFooter.classList.remove('hidden');
  appFooter.innerHTML = `
    <span id="server-footer-message" class="app-footer__message">Sin cambios pendientes.</span>
    <button id="restore-default-config" class="secondary-button secondary-button--warning button-with-icon" type="button">
      ${renderIcon('reset')}
      <span>Default</span>
    </button>
    <button id="update-server" class="secondary-button button-with-icon" type="button" ${isServerUpdateBlocked() ? 'disabled' : ''}>
      ${renderIcon('refresh')}
      <span>Actualizar</span>
    </button>
    <button id="discard-config" class="secondary-button button-with-icon" type="button" disabled>
      ${renderIcon('undo')}
      <span>Descartar</span>
    </button>
    <button id="save-config" class="primary-button button-with-icon" type="button">
      ${renderIcon('check')}
      <span>Guardar</span>
    </button>
  `;
  document.querySelector<HTMLButtonElement>('#save-config')?.addEventListener('click', () => {
    void saveConfiguration(parsed);
  });
  document.querySelector<HTMLButtonElement>('#discard-config')?.addEventListener('click', () => {
    discardServerChanges(parsed);
  });
  document.querySelector<HTMLButtonElement>('#restore-default-config')?.addEventListener(
    'click',
    showRestoreDefaultConfirmation
  );
  document.querySelector<HTMLButtonElement>('#update-server')?.addEventListener('click', showServerUpdateConfirmation);
  updateServerDirtyState(parsed);
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
    void updateServerInstallation();
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
  await pollOperation(accepted.operationId);
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
  firewallRequestStartedAt = Date.now();
  firewallStatusRequest = palcmApi.firewall
    .getStatus()
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

async function renderFirewallView(forceRefresh = false): Promise<void> {
  if (!palcmApi) {
    return;
  }

  if (!forceRefresh && latestFirewallStatus) {
    clearFirewallLoadingTimers();
    renderFirewallStatusView(latestFirewallStatus);
    return;
  }

  updateReadyChrome();
  clearFirewallLoadingTimers();
  const activeStep = getFirewallLoadingStep();
  const activeDiagnostic = getFirewallDiagnosticStep(activeStep);
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
            <p id="firewall-diagnostic-current">${escapeHtml(activeDiagnostic.activeDetail)}</p>
          </div>
        </div>
        <ol id="firewall-diagnostic-steps" class="diagnostic-steps" aria-label="Pasos de verificacion">
          ${renderFirewallLoadingSteps(activeStep)}
        </ol>
      </section>
    </div>
  `);
  startFirewallLoadingTimeline(activeStep);

  try {
    const firewall = await getFirewallStatus(forceRefresh);
    clearFirewallLoadingTimers();

    if (!navigationState.is('network')) {
      return;
    }

    renderFirewallStatusView(firewall);
  } catch (error) {
    clearFirewallLoadingTimers();
    if (!navigationState.is('network')) {
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    renderFirewallErrorView(message);
  }
}

function renderFirewallStatusView(firewall: FirewallStatusDto): void {
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
            <button id="apply-firewall" class="primary-button primary-button--warning button-with-icon" type="button" ${firewall.local.state === 'READY' ? 'disabled' : ''}>
              ${renderIcon('server')}
              <span>Configurar Windows</span>
            </button>
          </div>
        </div>
        <section class="summary-grid summary-grid--ready network-state-grid">
          ${renderNetworkStateCard('Windows local', createWindowsLocalSummary(firewall))}
          ${renderNetworkStateCard('Acceso externo', createExternalAccessSummary(firewall))}
        </section>
        <section class="firewall-layout">
          ${renderFirewallSection('PC local', firewall.local.message, firewall.local.ports)}
          ${renderFirewallSection('Acceso externo', firewall.external.message, firewall.external.ports)}
          ${renderNetworkDiagnostics(firewall.external.network)}
        </section>
        <div id="firewall-confirmation" class="inline-confirm hidden">
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
      </div>
    `);
  document.querySelector<HTMLButtonElement>('#refresh-firewall')?.addEventListener('click', () => {
    void renderFirewallView(true);
  });
  document.querySelector<HTMLButtonElement>('#apply-firewall')?.addEventListener('click', showFirewallConfirmation);
  document.querySelector<HTMLButtonElement>('#confirm-firewall')?.addEventListener('click', () => {
    void applyFirewallRules();
  });
  document.querySelector<HTMLButtonElement>('#cancel-firewall')?.addEventListener('click', hideFirewallConfirmation);
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
          ${renderDiagnosticStep(0, 'done', getFirewallDiagnosticStep(0).title, getFirewallDiagnosticStep(0).detail)}
          ${renderDiagnosticStep(1, 'done', getFirewallDiagnosticStep(1).title, getFirewallDiagnosticStep(1).detail)}
          ${renderDiagnosticStep(2, 'error', 'Diagnostico interrumpido', 'No se pudo completar la consulta local. Reintenta para continuar con acceso externo.')}
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
  const probeNetwork = latestPublicNetwork && latestPublicNetworkPort === port ? latestPublicNetwork : network;
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
  state: DiagnosticStepState,
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

function getFirewallDiagnosticStep(index: number): DiagnosticStepDefinition {
  return FIREWALL_DIAGNOSTIC_STEPS[index] ?? DEFAULT_FIREWALL_DIAGNOSTIC_STEP;
}

function renderFirewallLoadingSteps(activeIndex: number): string {
  const visibleSteps = FIREWALL_DIAGNOSTIC_STEPS.slice(0, Math.min(activeIndex + 1, FIREWALL_DIAGNOSTIC_STEPS.length));

  return visibleSteps
    .map((step, index) =>
      renderDiagnosticStep(
        index,
        getDiagnosticStepState(index, activeIndex),
        step.title,
        index === activeIndex ? step.activeDetail : step.detail
      )
    )
    .join('');
}

function getFirewallLoadingStep(): number {
  if (!firewallStatusRequest || firewallRequestStartedAt === 0) {
    return 0;
  }

  return Math.min(3, Math.floor((Date.now() - firewallRequestStartedAt) / 700));
}

function getDiagnosticStepState(index: number, activeIndex: number): DiagnosticStepState {
  if (index < activeIndex) {
    return 'done';
  }

  if (index === activeIndex) {
    return 'active';
  }

  return 'pending';
}

function startFirewallLoadingTimeline(startIndex = 0): void {
  FIREWALL_DIAGNOSTIC_STEPS.forEach((_step, index) => {
    if (index < startIndex) {
      return;
    }

    const timer = window.setTimeout(() => {
      updateDiagnosticSteps(index);
    }, (index - startIndex) * 700);
    firewallLoadingTimers.push(timer);
  });
}

function updateDiagnosticSteps(activeIndex: number): void {
  const clampedIndex = Math.min(activeIndex, FIREWALL_DIAGNOSTIC_STEPS.length - 1);
  const currentStep = getFirewallDiagnosticStep(clampedIndex);
  const currentDetail = document.querySelector<HTMLElement>('#firewall-diagnostic-current');
  const stepList = document.querySelector<HTMLElement>('#firewall-diagnostic-steps');

  if (currentDetail) {
    currentDetail.textContent = currentStep.activeDetail;
  }

  if (stepList) {
    stepList.innerHTML = renderFirewallLoadingSteps(clampedIndex);
  }
}

function clearFirewallLoadingTimers(): void {
  firewallLoadingTimers.forEach((timer) => {
    window.clearTimeout(timer);
  });
  firewallLoadingTimers = [];
}

function renderExternalPortRecommendations(ports: FirewallPortCheckDto[]): string {
  const configuredPorts = ports.filter((port) => port.enabled);
  const recommendations = [
    ...configuredPorts.map((port) => ({
      label: port.label,
      value: `${port.protocol} ${String(port.port)}`,
      detail: 'Configurado en el INI activo.',
      checked: true
    })),
    {
      label: 'Steam Query',
      value: 'UDP 27015',
      detail: 'Puerto comun para consulta/listado si el router lo permite.',
      checked: false
    }
  ];
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
  document.querySelector('#firewall-confirmation')?.classList.remove('hidden');
}

function hideFirewallConfirmation(): void {
  document.querySelector('#firewall-confirmation')?.classList.add('hidden');
}

async function applyFirewallRules(): Promise<void> {
  if (!palcmApi) {
    return;
  }

  appendConsoleLine('Confirmado: configurar reglas de Firewall de Windows.');
  navigationState.set('logs');
  renderActiveView();
  const accepted = await palcmApi.firewall.applyRules({ confirmed: true });
  await pollOperation(accepted.operationId);
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

function replaceSummaryCard(id: string, html: string): void {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  const nextCard = template.content.firstElementChild;
  const currentCard = document.querySelector(`#${cssEscape(id)}`);

  if (currentCard && nextCard) {
    currentCard.replaceWith(nextCard);
  }
}

function renderConfigurationPresets(): string {
  return `
    <section class="preset-bar" aria-label="Perfiles rapidos de configuracion">
      <div>
        <span class="view-kicker">PERFILES</span>
        <p>Aplican valores al formulario. No se guardan hasta presionar Guardar.</p>
      </div>
      <div class="preset-bar__actions">
        ${CONFIGURATION_PRESETS.map((preset) => `<button class="secondary-button preset-button" type="button" data-preset="${escapeHtml(preset.id)}">${escapeHtml(preset.label)}</button>`).join('')}
      </div>
    </section>
  `;
}

function renderSettingsFilterBar(parsed: ParsedPalworldSettings): string {
  const categories = Array.from(groupSettings(parsed.settings).keys());

  return `
    <section class="settings-filter" aria-label="Filtros de parametros del INI">
      <div class="settings-filter__head">
        <span class="view-kicker">FILTROS</span>
        <strong>Encontrar parametro</strong>
      </div>
      <div class="settings-filter__controls">
        <label class="settings-filter__search" for="settings-search">
          ${renderIcon('search')}
          <input id="settings-search" type="search" placeholder="Nombre, clave o descripcion" autocomplete="off" />
        </label>
        <label class="settings-filter__category" for="settings-category">
          <span>Categoria</span>
          <select id="settings-category">
            <option value="all">Todas</option>
            ${categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('')}
          </select>
        </label>
        <span id="settings-filter-count" class="settings-filter__count">${String(parsed.settings.length)} parametros</span>
      </div>
    </section>
  `;
}

function bindSummaryCards(): void {
  document.querySelectorAll<HTMLButtonElement>('.summary-card[data-target]').forEach((card) => {
    if (card.dataset['summaryBound'] === 'true') {
      return;
    }

    card.dataset['summaryBound'] = 'true';
    card.addEventListener('click', (event) => {
      const copyValue = card.dataset['copyValue'];
      const clickedElement = event.target instanceof Element ? event.target : null;
      const clickedTargetIcon = clickedElement
        ?.closest<HTMLElement>('.summary-card__icon[data-summary-icon="target"]');

      if (clickedTargetIcon) {
        const adminTab = card.dataset['adminTab'];
        if (isAdminTab(adminTab)) {
          adminActiveTab = adminTab;
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
        adminActiveTab = adminTab;
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

function renderSettingsForm(parsed: ParsedPalworldSettings): string {
  const grouped = groupSettings(parsed.settings);

  return Array.from(grouped.entries())
    .map(
      ([group, settings]) => `
        <section class="settings-group">
          <h4>${escapeHtml(group)} <span data-group-count>${String(settings.length)}</span></h4>
          <div class="settings-grid">
            ${settings.map((setting) => renderSettingControl(setting)).join('')}
          </div>
        </section>
      `
    )
    .join('');
}

function groupSettings(settings: ParsedPalworldSetting[]): Map<string, ParsedPalworldSetting[]> {
  const grouped = new Map<string, ParsedPalworldSetting[]>();

  settings.forEach((setting) => {
    const definition = getSettingDefinition(setting.key, setting.value);
    const group = definition.group;
    grouped.set(group, [...(grouped.get(group) ?? []), setting]);
  });

  return grouped;
}

function renderSettingControl(setting: ParsedPalworldSetting): string {
  const definition = getSettingDefinition(setting.key, setting.value);
  const rawValue = unquoteSettingValue(setting.value);
  const info = `${definition.help}${definition.range ? ` Rango: ${definition.range}` : ''}`;
  const searchText = [
    definition.group,
    definition.label,
    setting.key,
    definition.help,
    definition.range ?? ''
  ].join(' ');

  return `
    <article class="setting-field" data-setting-card data-setting-card-key="${escapeHtml(setting.key)}" data-setting-group="${escapeHtml(definition.group)}" data-search="${escapeHtml(normalizeSearchText(searchText))}">
      <span class="setting-field__top">
        <span>
          <strong>${escapeHtml(definition.label)}</strong>
          <small>${escapeHtml(setting.key)}</small>
        </span>
        <button class="setting-info" type="button" aria-label="${escapeHtml(info)}" data-info="${escapeHtml(info)}">i</button>
      </span>
      ${renderSettingInput(definition, setting.key, rawValue)}
    </article>
  `;
}

function renderSettingInput(definition: PalworldSettingDefinition, key: string, value: string): string {
  if (definition.kind === 'boolean') {
    const isChecked = value.toLowerCase() === 'true';

    return `
      <button class="setting-toggle" data-setting-key="${escapeHtml(key)}" type="button" role="switch" aria-checked="${isChecked ? 'true' : 'false'}">
        <span class="setting-toggle__track" aria-hidden="true"><span></span></span>
        <span class="setting-toggle__state">${isChecked ? 'Activo' : 'Inactivo'}</span>
      </button>
    `;
  }

  if (definition.kind === 'select' && definition.options) {
    return `
      <select data-setting-key="${escapeHtml(key)}">
        ${definition.options
          .map((option) => `<option value="${escapeHtml(option)}" ${option === value ? 'selected' : ''}>${escapeHtml(formatSelectOptionLabel(option))}</option>`)
          .join('')}
      </select>
    `;
  }

  if (definition.kind === 'number') {
    const numericValue = Number(value);

    if (
      typeof definition.min === 'number' &&
      typeof definition.max === 'number' &&
      Number.isFinite(numericValue)
    ) {
      return `
        <span class="setting-range">
          <input data-range-key="${escapeHtml(key)}" type="range" min="${String(definition.min)}" max="${String(definition.max)}" step="${String(definition.step ?? 'any')}" value="${escapeHtml(value)}" />
          <input class="setting-range__value" data-setting-key="${escapeHtml(key)}" type="number" min="${String(definition.min)}" max="${String(definition.max)}" step="${String(definition.step ?? 'any')}" value="${escapeHtml(value)}" />
        </span>
      `;
    }

    return `<input data-setting-key="${escapeHtml(key)}" type="number" step="any" value="${escapeHtml(value)}" />`;
  }

  return `<input data-setting-key="${escapeHtml(key)}" type="text" value="${escapeHtml(value)}" />`;
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

  document.querySelectorAll<HTMLElement>('.settings-group').forEach((group) => {
    const visibleInGroup = group.querySelectorAll('[data-setting-card]:not(.hidden)').length;
    const count = group.querySelector<HTMLElement>('[data-group-count]');
    group.classList.toggle('hidden', visibleInGroup === 0);

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
  updateServerDirtyState(parsed);
  showToast('Cambios descartados');
}

function showLeaveServerConfirmation(nextView: string): void {
  if (!appFooter) {
    navigationState.set(nextView);
    renderActiveView();
    return;
  }

  appFooter.classList.remove('hidden');
  appFooter.classList.add('app-footer--confirm');
  appFooter.innerHTML = renderInlineConfirm({
    message: 'Hay cambios sin guardar en la configuracion. Si sales ahora no se aplicaran al INI.',
    actions: [
      { id: 'stay-server-config', label: 'Seguir editando', tone: 'secondary' },
      { id: 'leave-server-config', label: 'Salir sin guardar', tone: 'danger' }
    ]
  });

  document.querySelector<HTMLButtonElement>('#stay-server-config')?.addEventListener('click', () => {
    appFooter.classList.remove('app-footer--confirm');
    if (latestServerSettings) {
      renderServerFooter(latestServerSettings);
    }
  });

  document.querySelector<HTMLButtonElement>('#leave-server-config')?.addEventListener('click', () => {
    appFooter.classList.remove('app-footer--confirm');
    latestServerSettings = null;
    navigationState.set(nextView);
    renderActiveView();
  });
}

function showToast(message: string, tone: 'info' | 'error' = 'info'): void {
  if (!toastRegion) {
    return;
  }

  const toast = document.createElement('div');
  toast.className = `toast toast--${tone}`;
  toast.textContent = message;
  toastRegion.append(toast);

  window.setTimeout(() => {
    toast.classList.add('toast--leaving');
    window.setTimeout(() => {
      toast.remove();
    }, 180);
  }, 2400);
}

function setContent(html: string): void {
  if (contentView) {
    contentView.innerHTML = html;
  }
}

function exportConsole(): void {
  const blob = new Blob([consoleLines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `palcm-console-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
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
