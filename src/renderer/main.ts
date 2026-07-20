import './styles.css';
import { ApplicationStatus } from '../shared/enums/application-status';
import type { AllowedActionsDto } from '../shared/dto/allowed-actions.dto';
import type { BackupSummaryDto } from '../shared/dto/backup-status.dto';
import type { FirewallPortCheckDto, FirewallStatusDto } from '../shared/dto/firewall-status.dto';
import type { OperationProgressDto } from '../shared/dto/operation-progress.dto';
import {
  createSummaryCardState,
  renderSummaryCard,
  type SummaryCardViewModel
} from './components/summary-card';
import { bindWindowControls } from './components/window-controls';
import {
  DEFAULT_SETTING_HELP,
  PALWORLD_SETTING_DEFINITIONS,
  type PalworldSettingDefinition
} from './config/palworld-settings-catalog';
import { PALWORLD_SETTING_COPY } from './config/palworld-settings-copy';
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

const palcmLogoUrl = new URL('./assets/palcm-logo.png', import.meta.url).href;

const appRoot = document.querySelector<HTMLDivElement>('#app');

if (!appRoot) {
  throw new Error('Renderer root element was not found.');
}

const rootElement = appRoot;

rootElement.innerHTML = `
  <header class="titlebar">
    <div class="titlebar__brand">
      <img class="titlebar__logo" src="${palcmLogoUrl}" alt="" />
      <span>PSM Console by &gt;GR477&lt;</span>
    </div>
    <div class="titlebar__spacer"></div>
    <button id="window-minimize" class="window-button" aria-label="Minimizar"><span aria-hidden="true">&minus;</span></button>
    <button id="window-maximize" class="window-button" aria-label="Maximizar"><span aria-hidden="true">&#9633;</span></button>
    <button id="window-close" class="window-button window-button--close" aria-label="Cerrar"><span aria-hidden="true">&times;</span></button>
  </header>
  <aside class="sidebar">
    <section class="sidebar__identity">
      <img class="sidebar__logo" src="${palcmLogoUrl}" alt="" />
      <div>
        <h1>PSM Console</h1>
        <p>v0.1.0 Dev</p>
        <p class="sidebar__credit">by <strong>&gt;GR477&lt;</strong></p>
      </div>
    </section>
    <nav class="sidebar__nav" aria-label="Navegacion principal">
      <a class="sidebar__link sidebar__link--active" data-nav="home" href="#">General</a>
      <a class="sidebar__link sidebar__link--locked" data-nav="server" href="#">Servidor</a>
      <a class="sidebar__link sidebar__link--locked" data-nav="network" href="#">Red y Firewall</a>
      <a class="sidebar__link sidebar__link--locked" data-nav="backups" href="#">Backups</a>
      <a class="sidebar__link sidebar__link--locked" data-nav="logs" href="#">Logs</a>
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
      <div class="console-shell">
        <button id="export-console" class="console-export" type="button" aria-label="Exportar consola">Exportar</button>
        <div class="console-tools">
          <input id="console-search" type="search" placeholder="Buscar en logs" aria-label="Buscar en logs" />
          <button id="pause-console" class="console-tool-button" type="button" aria-pressed="false">Pausar</button>
          <button id="clear-console" class="console-tool-button" type="button">Limpiar vista</button>
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
const pauseConsoleButton = document.querySelector<HTMLButtonElement>('#pause-console');
const clearConsoleButton = document.querySelector<HTMLButtonElement>('#clear-console');
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
const navLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('.sidebar__link[data-nav]'));
const consoleLines: string[] = [];
const operationLogOffsets = new Map<string, number>();
let firewallLoadingTimers: number[] = [];
let latestFirewallStatus: FirewallStatusDto | null = null;
let firewallStatusRequest: Promise<FirewallStatusDto> | null = null;
let latestFirewallError: string | null = null;
let firewallRequestStartedAt = 0;
let latestFirewallCheckedAt: Date | null = null;
let latestLocalAddresses: string[] = [];
let latestConfiguredPort: string | null = null;
let latestBackupSummary: BackupSummaryDto | null = null;
let consoleSearchTerm = '';
let consolePaused = false;
let settingInfoDismissBound = false;
let latestServerSettings: ParsedPalworldSettings | null = null;
let configurationAutoCreateAttempted = false;
let pendingAction: 'steamcmd' | 'server' | 'config' | null = null;
let activeView = 'home';
let latestStatus: ApplicationStatus = ApplicationStatus.BOOTSTRAPPING;
let latestActions: AllowedActionsDto | null = null;
let latestSummary: {
  steamCmdStatus: string;
  serverStatus: string;
  configurationStatus: string;
  configurationPath: string;
  serverPath: string;
} | null = null;

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
  pauseConsoleButton?.addEventListener('click', () => {
    consolePaused = !consolePaused;
    pauseConsoleButton.setAttribute('aria-pressed', consolePaused ? 'true' : 'false');
    pauseConsoleButton.textContent = consolePaused ? 'Reanudar' : 'Pausar';
    renderConsoleOutput();
  });
  clearConsoleButton?.addEventListener('click', () => {
    consoleLines.splice(0, consoleLines.length);
    operationLogOffsets.clear();
    renderConsoleOutput();
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
      if (activeView === 'server' && nextView !== 'server' && hasServerPendingChanges()) {
        showLeaveServerConfirmation(nextView);
        return;
      }

      activeView = nextView;
      renderActiveView();
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
    appendConsoleLine('No se inicio el servidor: falta confirmar IP LAN, puerto o reglas locales.');
    return;
  }

  appendConsoleLine('Confirmado: iniciar Palworld Dedicated Server.');
  activeView = 'logs';
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
  activeView = 'logs';
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
  const text = includeTimestamp ? `[${new Date().toISOString()}] ${line}` : line;
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

  navLinks.forEach((link) => {
    const nav = link.dataset['nav'];
    const enabled =
      nav === 'home' ||
      (nav === 'server' && serverAvailable) ||
      (nav === 'logs' && logsAvailable) ||
      (nav === 'backups' && serverAvailable) ||
      (nav === 'network' && serverAvailable);

    link.classList.toggle('sidebar__link--locked', !enabled);
    link.classList.toggle('sidebar__link--active', nav === activeView);
    link.setAttribute('aria-disabled', enabled ? 'false' : 'true');
  });
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
    return latestFirewallStatus.local.state === 'READY';
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

  rootElement.dataset['view'] = activeView;
  hideConfirmation();
  updateReadyChrome();
  updateFooterChrome();
  updateHeroChrome();
  const isLogsView = activeView === 'logs';
  document.querySelector('.console-shell')?.classList.toggle('hidden', !isLogsView);
  document.querySelector('.console-tools')?.classList.toggle('hidden', !isLogsView);
  contentView?.classList.toggle('hidden', activeView === 'logs');
  navLinks.forEach((link) => {
    link.classList.toggle('sidebar__link--active', link.dataset['nav'] === activeView);
  });

  if (activeView === 'home') {
    void renderGeneralView();
    return;
  }

  if (activeView === 'server') {
    void renderServerConfigurationView();
    return;
  }

  if (activeView === 'network') {
    void renderFirewallView();
    return;
  }

  if (activeView === 'backups') {
    void renderBackupsView();
    return;
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
  const publicPlay = createPublicPlaySummary(latestFirewallStatus, isNetworkLoading);
  const backupSummary = await readBackupSummaryForGeneral();
  const backupState = createBackupSummaryCard(backupSummary);
  const networkFreshness = formatLastVerification(latestFirewallCheckedAt);

  setContent(`
    <div class="view-stack">
      <section class="summary-grid summary-grid--ready">
        ${renderSummaryCard({
          title: 'SteamCMD',
          value: 'Instalado',
          detail: 'Cliente listo para actualizar y validar archivos.',
          target: 'logs',
          ...createSummaryCardState('ok')
        })}
        ${renderSummaryCard({
          title: 'Servidor',
          value: 'Instalado',
          detail: latestSummary?.serverPath ?? 'PalServer.exe detectado.',
          target: 'server',
          ...createSummaryCardState('ok')
        })}
        ${renderSummaryCard({
          title: 'Configuracion',
          value: 'Activa',
          detail: latestSummary?.configurationPath ?? 'PalWorldSettings.ini disponible.',
          target: 'server',
          ...createSummaryCardState('ok')
        })}
        ${renderSummaryCard({
          title: 'Puerto',
          value: port ? `UDP ${port}` : 'Sin validar',
          detail: port ? 'Puerto leido desde la configuracion activa.' : 'No se encontro PublicPort en el INI activo.',
          target: 'network',
          ...portState
        })}
        ${renderSummaryCard({
          id: 'general-local-play-card',
          title: 'Juego local',
          value: localPlay.value,
          detail: localPlay.detail,
          copyValue: localPlay.copyValue,
          target: 'network',
          ...localPlay.state
        })}
        ${renderSummaryCard({
          id: 'general-public-play-card',
          title: 'Juego publico',
          value: publicPlay.value,
          detail: publicPlay.detail,
          copyValue: publicPlay.copyValue,
          target: 'network',
          ...publicPlay.state
        })}
        ${renderSummaryCard({
          title: 'Backups',
          value: backupState.value,
          detail: backupState.detail,
          target: 'backups',
          ...backupState.state
        })}
      </section>
      <p class="view-note">Red y firewall: ${escapeHtml(networkFreshness)}.</p>
    </div>
  `);
  bindSummaryCards();
  void hydrateGeneralLocalPreview(port);
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

  if (activeView !== 'home' || !isOperationalStatus(latestStatus) || latestFirewallStatus) {
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

  if (activeView !== 'home' || !isOperationalStatus(latestStatus)) {
    return;
  }

  const localPlay = createLocalPlaySummary(firewall, port, false, latestLocalAddresses);
  const publicPlay = createPublicPlaySummary(firewall, false);
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

  if (firewall.local.state === 'READY') {
    const localIp = firewall.external.network.localIpv4[0];

    return {
      value: localIp ? `${localIp}:${port}` : `UDP ${port}`,
      detail: 'Listo para probar desde otra PC de la misma red.',
      state: createSummaryCardState('ok'),
      copyValue: localIp ? `${localIp}:${port}` : undefined
    };
  }

  if (firewall.local.state === 'MISSING') {
    return {
      value: 'Revisar firewall',
      detail: 'Windows todavia necesita reglas locales para aceptar jugadores en LAN.',
      state: createSummaryCardState('warning')
    };
  }

  return {
    value: 'No confirmado',
    detail: 'No se pudo validar completamente el firewall local de Windows.',
    state: createSummaryCardState('optional')
  };
}

function createPublicPlaySummary(firewall: FirewallStatusDto | null, isLoading: boolean): SummaryCardViewModel {
  if (isLoading) {
    return {
      value: 'Analizando',
      detail: 'Consultando IP publica y separando router, NAT y CGNAT.',
      state: createSummaryCardState('loading')
    };
  }

  if (!firewall) {
    return {
      value: latestFirewallError ? 'Error' : 'Pendiente',
      detail: 'Abre Red y Firewall para diagnosticar IP publica, router y CGNAT.',
      state: latestFirewallError ? createSummaryCardState('error') : createSummaryCardState('configuration')
    };
  }

  const network = firewall.external.network;

  if (network.cgnatStatus === 'LIKELY') {
    return {
      value: 'No directo',
      detail: 'Probable CGNAT. Para acceso publico directo haria falta IP publica real o alternativa externa.',
      state: createSummaryCardState('warning')
    };
  }

  if (network.cgnatStatus === 'UNLIKELY') {
    const port = getPublicPortFromFirewall(firewall);
    const copyValue = network.publicIp && port ? `${network.publicIp}:${port}` : undefined;

    return {
      value: copyValue ?? network.publicIp ?? 'Posible',
      detail: 'Sin indicios fuertes de CGNAT; falta validar router y puerto desde otra red.',
      state: createSummaryCardState('ok'),
      copyValue
    };
  }

  if (network.cgnatStatus === 'NEEDS_ROUTER_CHECK') {
    return {
      value: 'Requiere prueba',
      detail: 'Compara la WAN del router con la IP publica. Si difieren, no hay acceso directo por IPv4.',
      state: createSummaryCardState('warning')
    };
  }

  return {
    value: 'Sin Internet',
    detail: 'No se pudo consultar la IP publica para evaluar acceso externo.',
    state: createSummaryCardState('optional')
  };
}

function renderPreflightSummary(): void {
  panelStatusHeader?.classList.remove('hidden');
  progressBar?.parentElement?.classList.remove('hidden');
  setContent(`
    <div class="view-stack">
      <section class="summary-grid">
        <article class="summary-item">
          <span>Estado</span>
          <strong>${latestStatus}</strong>
        </article>
        <article class="summary-item">
          <span>Configuracion</span>
          <strong>${latestActions?.canEditConfiguration ? 'Disponible' : 'Bloqueada'}</strong>
        </article>
        <article class="summary-item">
          <span>Servidor</span>
          <strong>${latestActions?.canStartServer ? 'Listo para iniciar' : 'Pendiente'}</strong>
        </article>
      </section>
    </div>
  `);
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
        <div class="view-header">
          <div>
            <span class="view-kicker">SERVER</span>
            <h3>Configuracion del servidor</h3>
            <p>${escapeHtml(file.path)}</p>
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

  appendConsoleLine('Confirmado: guardar configuracion activa.');
  activeView = 'logs';
  renderActiveView();
  const accepted = await palcmApi.config.save({
    confirmed: true,
    content
  });
  await pollOperation(accepted.operationId);
  showToast('Configuracion guardada');
  activeView = 'server';
  await refreshState();
}

async function restoreDefaultConfiguration(): Promise<void> {
  if (!palcmApi) {
    return;
  }

  appendConsoleLine('Confirmado: restaurar configuracion default.');
  activeView = 'logs';
  renderActiveView();
  const accepted = await palcmApi.config.restoreDefault({ confirmed: true });
  await pollOperation(accepted.operationId);
  showToast('Configuracion default restaurada');
  activeView = 'server';
  await refreshState();
}

function showRestoreDefaultConfirmation(): void {
  if (!appFooter) {
    return;
  }

  appFooter.classList.remove('hidden');
  appFooter.classList.remove('app-footer--confirm');
  appFooter.innerHTML = `
    <span class="app-footer__message">Se creara un backup y se reemplazara la configuracion activa por los valores default instalados.</span>
    <button id="confirm-restore-default" class="primary-button primary-button--warning" type="button">Restaurar default</button>
    <button id="cancel-restore-default" class="secondary-button" type="button">Cancelar</button>
  `;
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

    setContent(`
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
        <div id="backup-confirmation" class="inline-confirm hidden">
          <span id="backup-confirmation-message">La accion requiere confirmacion.</span>
          <button id="confirm-backup" class="primary-button" type="button">Confirmar</button>
          <button id="cancel-backup" class="secondary-button" type="button">Cancelar</button>
        </div>
      </div>
    `);
    document.querySelector<HTMLButtonElement>('#create-config-backup')?.addEventListener('click', () => {
      showBackupConfirmation('configuration');
    });
    document.querySelector<HTMLButtonElement>('#create-world-backup')?.addEventListener('click', () => {
      showBackupConfirmation('world');
    });
    document.querySelector<HTMLButtonElement>('#cancel-backup')?.addEventListener('click', hideBackupConfirmation);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    renderSimpleView('Backups', `No se pudo leer el estado de backups. ${message}`);
  }
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
    </article>
  `;
}

function showBackupConfirmation(kind: 'configuration' | 'world'): void {
  const confirmation = document.querySelector<HTMLDivElement>('#backup-confirmation');
  const message = document.querySelector<HTMLElement>('#backup-confirmation-message');
  const confirm = document.querySelector<HTMLButtonElement>('#confirm-backup');

  if (!confirmation || !message || !confirm) {
    return;
  }

  message.textContent =
    kind === 'configuration'
      ? 'Se copiara el PalWorldSettings.ini activo a backups/configuration. No se modifica la configuracion actual.'
      : 'Se copiara la carpeta SaveGames del servidor a backups/world. El servidor no se modifica.';
  confirmation.classList.remove('hidden');
  confirm.onclick = () => {
    void createBackup(kind);
  };
}

function hideBackupConfirmation(): void {
  document.querySelector('#backup-confirmation')?.classList.add('hidden');
}

async function createBackup(kind: 'configuration' | 'world'): Promise<void> {
  if (!palcmApi) {
    return;
  }

  appendConsoleLine(kind === 'configuration' ? 'Confirmado: crear backup de configuracion.' : 'Confirmado: crear backup del mundo.');
  activeView = 'logs';
  renderActiveView();

  const accepted =
    kind === 'configuration'
      ? await palcmApi.backup.createConfiguration({ confirmed: true })
      : await palcmApi.backup.createWorld({ confirmed: true });

  await pollOperation(accepted.operationId);
  latestBackupSummary = null;
  activeView = 'backups';
  await refreshState();
}

function hideRestoreDefaultConfirmation(): void {
  if (activeView === 'server') {
    void renderServerConfigurationView();
  }
}

function renderSimpleView(title: string, message: string): void {
  panelStatusHeader?.classList.remove('hidden');
  progressBar?.parentElement?.classList.remove('hidden');
  setContent(`
    <div class="view-stack">
      <div class="view-header">
        <div>
          <span class="view-kicker">${escapeHtml(title.toUpperCase())}</span>
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(message)}</p>
        </div>
      </div>
    </div>
  `);
}

function updateReadyChrome(): void {
  const shouldHidePreflightChrome = isOperationalStatus(latestStatus) && activeView !== 'logs';
  panelStatusHeader?.classList.toggle('hidden', shouldHidePreflightChrome);
  progressBar?.parentElement?.classList.toggle('hidden', shouldHidePreflightChrome);
}

function updateHeroChrome(): void {
  const shouldHideHero = isOperationalStatus(latestStatus) && activeView !== 'home';
  document.querySelector('.hero')?.classList.toggle('hidden', shouldHideHero);
}

function updateFooterChrome(): void {
  const shouldShowFooter = isOperationalStatus(latestStatus) && activeView === 'server';
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
    <button id="restore-default-config" class="secondary-button secondary-button--warning" type="button">Volver a default</button>
    <button id="discard-config" class="secondary-button" type="button" disabled>Descartar cambios</button>
    <button id="save-config" class="primary-button" type="button">Guardar</button>
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
  updateServerDirtyState(parsed);
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
  setContent(`
    <div class="view-stack view-stack--scroll">
      <div class="view-header">
        <div>
          <span class="view-kicker">NETWORK & FIREWALL</span>
          <h3>Firewall y acceso externo</h3>
          <p>Consultando puertos activos y reglas de Windows...</p>
        </div>
      </div>
      <section class="firewall-section firewall-section--loading">
        <div class="loading-diagnostic">
          <span class="loading-diagnostic__spinner" aria-hidden="true"></span>
          <div>
            <h4>Diagnostico en curso</h4>
            <p>Verificando la configuracion, los puertos activos y las reglas locales de Windows.</p>
          </div>
        </div>
        <ol class="diagnostic-steps" aria-label="Pasos de verificacion">
          ${renderDiagnosticStep(0, getDiagnosticStepState(0, activeStep), 'Leyendo PalWorldSettings.ini', 'Abriendo la configuracion activa del servidor.')}
          ${renderDiagnosticStep(1, getDiagnosticStepState(1, activeStep), 'Detectando puertos activos', 'Revisando PublicPort, RCON y REST API.')}
          ${renderDiagnosticStep(2, getDiagnosticStepState(2, activeStep), 'Consultando reglas de Firewall de Windows', 'Buscando reglas entrantes para PalServer.exe.')}
          ${renderDiagnosticStep(3, getDiagnosticStepState(3, activeStep), 'Verificando acceso externo', 'Consultando IP publica y estado de router/NAT/CGNAT.')}
        </ol>
      </section>
    </div>
  `);
  startFirewallLoadingTimeline(activeStep);

  try {
    const firewall = await getFirewallStatus(forceRefresh);
    clearFirewallLoadingTimers();

    if (activeView !== 'network') {
      return;
    }

    renderFirewallStatusView(firewall);
  } catch (error) {
    clearFirewallLoadingTimers();
    if (activeView !== 'network') {
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    renderFirewallErrorView(message);
  }
}

function renderFirewallStatusView(firewall: FirewallStatusDto): void {
  setContent(`
      <div class="view-stack view-stack--scroll">
        <div class="view-header">
          <div>
            <span class="view-kicker">NETWORK & FIREWALL</span>
            <h3>Firewall y acceso externo</h3>
            <p>Puertos leidos desde la configuracion activa del servidor. ${escapeHtml(formatLastVerification(latestFirewallCheckedAt))}.</p>
          </div>
          <div class="view-actions">
            <button id="refresh-firewall" class="secondary-button" type="button">Actualizar</button>
            <button id="apply-firewall" class="primary-button primary-button--warning" type="button" ${firewall.local.state === 'READY' ? 'disabled' : ''}>
              Configurar Windows
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
          <button id="confirm-firewall" class="primary-button primary-button--warning" type="button">Configurar</button>
          <button id="cancel-firewall" class="secondary-button" type="button">Cancelar</button>
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
      <div class="view-header">
        <div>
          <span class="view-kicker">NETWORK & FIREWALL</span>
          <h3>Firewall y acceso externo</h3>
          <p>No se pudo completar el diagnostico.</p>
        </div>
        <div class="view-actions">
          <button id="refresh-firewall" class="secondary-button" type="button">Reintentar</button>
        </div>
      </div>
      <section class="firewall-section firewall-section--loading">
        <div class="loading-diagnostic">
          <span class="summary-card__icon summary-card__icon--error" aria-label="Error">&times;</span>
          <div>
            <h4>Diagnostico interrumpido</h4>
            <p>${escapeHtml(message)}</p>
          </div>
        </div>
        <ol class="diagnostic-steps" aria-label="Pasos de verificacion">
          ${renderDiagnosticStep(0, 'done', 'Leyendo PalWorldSettings.ini', 'Configuracion activa consultada o intento realizado.')}
          ${renderDiagnosticStep(1, 'done', 'Detectando puertos activos', 'Puertos leidos desde la configuracion disponible.')}
          ${renderDiagnosticStep(2, 'error', 'Consultando reglas de Firewall de Windows', 'La verificacion local no pudo finalizar.')}
          ${renderDiagnosticStep(3, 'pending', 'Verificando acceso externo', 'Pendiente hasta resolver el error anterior.')}
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

function createWindowsLocalSummary(firewall: FirewallStatusDto): SummaryCardViewModel {
  if (firewall.local.state === 'READY') {
    const port = getPublicPortFromFirewall(firewall);
    const localIp = firewall.external.network.localIpv4[0];
    const copyValue = localIp && port ? `${localIp}:${port}` : undefined;

    return {
      value: copyValue ?? 'Listo',
      detail: copyValue ? 'Click para copiar la direccion LAN.' : 'Windows permite los puertos locales activos para PalServer.',
      state: createSummaryCardState('ok'),
      copyValue
    };
  }

  if (firewall.local.state === 'MISSING') {
    return {
      value: 'Configurar',
      detail: 'Faltan reglas de entrada en Windows para jugar desde LAN.',
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

  if (network.cgnatStatus === 'LIKELY') {
    return {
      value: 'Bloqueado directo',
      detail: 'Probable CGNAT o NAT del ISP. El puerto publico no sera directo sin alternativa externa.',
      state: createSummaryCardState('warning')
    };
  }

  if (network.cgnatStatus === 'UNLIKELY') {
    const port = getPublicPortFromFirewall(firewall);
    const copyValue = network.publicIp && port ? `${network.publicIp}:${port}` : undefined;

    return {
      value: copyValue ?? 'Posible',
      detail: copyValue ? 'Click para copiar la direccion publica.' : 'Sin indicios fuertes de CGNAT; falta probar el puerto desde otra red.',
      state: createSummaryCardState('ok'),
      copyValue
    };
  }

  if (network.cgnatStatus === 'NEEDS_ROUTER_CHECK') {
    return {
      value: 'Configurar router',
      detail: 'Compara WAN del router con IP publica y crea port forwarding si coinciden.',
      state: createSummaryCardState('configuration')
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
  state: 'done' | 'active' | 'pending' | 'error',
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

function getFirewallLoadingStep(): number {
  if (!firewallStatusRequest || firewallRequestStartedAt === 0) {
    return 0;
  }

  return Math.min(3, Math.floor((Date.now() - firewallRequestStartedAt) / 700));
}

function getDiagnosticStepState(index: number, activeIndex: number): 'done' | 'active' | 'pending' {
  if (index < activeIndex) {
    return 'done';
  }

  if (index === activeIndex) {
    return 'active';
  }

  return 'pending';
}

function startFirewallLoadingTimeline(startIndex = 0): void {
  const steps = [
    'Leyendo PalWorldSettings.ini',
    'Detectando puertos activos',
    'Consultando reglas de Firewall de Windows',
    'Preparando resumen local y externo'
  ];

  steps.forEach((_step, index) => {
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
  document.querySelectorAll<HTMLElement>('.diagnostic-step[data-step]').forEach((step) => {
    const index = Number(step.dataset['step']);
    step.classList.toggle('diagnostic-step--done', index < activeIndex);
    step.classList.toggle('diagnostic-step--active', index === activeIndex);
    step.classList.toggle('diagnostic-step--pending', index > activeIndex);
  });
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
        <p>Si no puedes configurar el router, usa esta lista para verificar desde otra red o con una herramienta externa. Si todos fallan, revisar NAT/CGNAT o usar VPN/tunel.</p>
      </div>
      <div class="external-port-list">
        ${unique
          .map(
            (item) => `
              <article class="external-port-item ${item.checked ? 'external-port-item--checked' : ''}">
                <span>${item.checked ? '&#10003;' : '!'}</span>
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
        <h4>CGNAT / ISP</h4>
        <p>${escapeHtml(network.message)}</p>
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
          <span>Estado</span>
          <strong>${escapeHtml(state.label)}</strong>
        </article>
      </div>
      <div class="network-diagnostics__recommendation">
        <span class="summary-card__icon" aria-label="${escapeHtml(state.label)}">${state.icon}</span>
        <p>${escapeHtml(network.recommendation)}</p>
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
    return { icon: '!', tone: 'warning', label: 'Probable CGNAT' };
  }

  if (status === 'UNLIKELY') {
    return { icon: '&#10003;', tone: 'ok', label: 'Sin indicios fuertes' };
  }

  if (status === 'NEEDS_ROUTER_CHECK') {
    return { icon: '?', tone: 'optional', label: 'Comparar con WAN del router' };
  }

  return { icon: '!', tone: 'warning', label: 'No evaluado' };
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
      <span class="summary-card__icon" aria-label="${escapeHtml(state.label)}">${state.icon}</span>
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
  activeView = 'logs';
  renderActiveView();
  const accepted = await palcmApi.firewall.applyRules({ confirmed: true });
  await pollOperation(accepted.operationId);
  latestFirewallStatus = null;
  latestFirewallCheckedAt = null;
  showToast('Reglas de Firewall actualizadas');
  activeView = 'network';
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
      <div class="settings-filter__search">
        <label for="settings-search">Buscar parametro</label>
        <input id="settings-search" type="search" placeholder="Nombre, clave o descripcion" autocomplete="off" />
      </div>
      <div class="settings-filter__category">
        <label for="settings-category">Categoria</label>
        <select id="settings-category">
          <option value="all">Todas</option>
          ${categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('')}
        </select>
      </div>
      <span id="settings-filter-count" class="settings-filter__count">${String(parsed.settings.length)} parametros</span>
    </section>
  `;
}

function bindSummaryCards(): void {
  document.querySelectorAll<HTMLButtonElement>('.summary-card[data-target]').forEach((card) => {
    card.addEventListener('click', () => {
      const copyValue = card.dataset['copyValue'];

      if (copyValue) {
        void copyToClipboard(copyValue, card);
        return;
      }

      activeView = card.dataset['target'] ?? 'home';
      renderActiveView();
    });
  });
}

async function copyToClipboard(value: string, element: HTMLElement): Promise<void> {
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
  if (!parsed || activeView !== 'server') {
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
    activeView = nextView;
    renderActiveView();
    return;
  }

  appFooter.classList.remove('hidden');
  appFooter.classList.add('app-footer--confirm');
  appFooter.innerHTML = `
    <span class="app-footer__message">Hay cambios sin guardar en la configuracion. Si sales ahora no se aplicaran al INI.</span>
    <button id="stay-server-config" class="secondary-button" type="button">Seguir editando</button>
    <button id="leave-server-config" class="primary-button primary-button--danger" type="button">Salir sin guardar</button>
  `;

  document.querySelector<HTMLButtonElement>('#stay-server-config')?.addEventListener('click', () => {
    appFooter.classList.remove('app-footer--confirm');
    if (latestServerSettings) {
      renderServerFooter(latestServerSettings);
    }
  });

  document.querySelector<HTMLButtonElement>('#leave-server-config')?.addEventListener('click', () => {
    appFooter.classList.remove('app-footer--confirm');
    latestServerSettings = null;
    activeView = nextView;
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

function getSettingDefinition(key: string, value: string): PalworldSettingDefinition {
  const known = PALWORLD_SETTING_DEFINITIONS[key];
  const copy = PALWORLD_SETTING_COPY[key];

  const base: PalworldSettingDefinition = known ?? {
    key,
    label: splitSettingKey(key),
    group: 'Avanzado',
    kind: inferSettingKind(value),
    help: DEFAULT_SETTING_HELP
  };

  return copy ? { ...base, ...copy, key } : base;
}

function inferSettingKind(value: string): 'text' | 'number' | 'boolean' {
  if (['true', 'false'].includes(value.toLowerCase())) {
    return 'boolean';
  }

  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return 'number';
  }

  return 'text';
}

function splitSettingKey(key: string): string {
  const readable = key
    .replace(/^b(?=[A-Z])/, '')
    .replaceAll('_', ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2');

  return readable
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => SETTING_WORD_TRANSLATIONS[word.toLowerCase()] ?? word)
    .join(' ');
}

function formatSelectOptionLabel(option: string): string {
  return SELECT_OPTION_LABELS[option] ?? option;
}

const SELECT_OPTION_LABELS: Record<string, string> = {
  All: 'Todo',
  Easy: 'Facil',
  Hard: 'Dificil',
  Item: 'Items',
  ItemAndEquipment: 'Items y equipo',
  Json: 'JSON',
  None: 'Ninguno',
  Normal: 'Normal',
  Region: 'Por region',
  Text: 'Texto'
};

const CONFIGURATION_PRESETS = [
  {
    id: 'casual',
    label: 'Casual',
    values: {
      DeathPenalty: 'Item',
      ExpRate: '1.500000',
      PalCaptureRate: '1.250000',
      CollectionDropRate: '1.250000',
      WorkSpeedRate: '1.250000'
    }
  },
  {
    id: 'farm',
    label: 'Farm rapido',
    values: {
      ExpRate: '2.000000',
      PalCaptureRate: '1.500000',
      CollectionDropRate: '2.000000',
      CollectionObjectRespawnSpeedRate: '2.000000',
      WorkSpeedRate: '2.000000',
      PalEggDefaultHatchingTime: '0.500000'
    }
  },
  {
    id: 'hard',
    label: 'Dificil',
    values: {
      DeathPenalty: 'All',
      ExpRate: '0.750000',
      PalCaptureRate: '0.750000',
      PlayerDamageRateAttack: '0.850000',
      PlayerDamageRateDefense: '1.250000',
      EnemyDropItemRate: '0.850000'
    }
  },
  {
    id: 'solo-friends',
    label: 'Solo amigos',
    values: {
      ServerPlayerMaxNum: '8',
      RCONEnabled: 'False',
      RESTAPIEnabled: 'False',
      bShowPlayerList: 'False',
      bEnableNonLoginPenalty: 'True'
    }
  }
] as const;

const SETTING_WORD_TRANSLATIONS: Record<string, string> = {
  active: 'Activo',
  aim: 'Apuntado',
  allow: 'Permitir',
  assist: 'Ayuda',
  attack: 'Ataque',
  auto: 'Automatico',
  base: 'Base',
  build: 'Construccion',
  camp: 'Campamento',
  client: 'Cliente',
  collection: 'Recoleccion',
  damage: 'Dano',
  day: 'Dia',
  decreace: 'Consumo',
  decrease: 'Consumo',
  defense: 'Defensa',
  deterioration: 'Deterioro',
  drop: 'Botin',
  enable: 'Activar',
  enemy: 'Enemigos',
  fast: 'Rapido',
  friendly: 'Aliado',
  guild: 'Gremio',
  hp: 'Vida',
  invader: 'Invasion',
  item: 'Item',
  keyboard: 'Teclado',
  level: 'Nivel',
  max: 'Maximo',
  mod: 'Mods',
  night: 'Noche',
  num: 'Cantidad',
  object: 'Objeto',
  pad: 'Control',
  pal: 'Pal',
  player: 'Jugador',
  pvp: 'PvP',
  random: 'Aleatorio',
  randomizer: 'Aleatorizador',
  rate: 'Multiplicador',
  regene: 'Regeneracion',
  respawn: 'Reaparicion',
  seed: 'Semilla',
  show: 'Mostrar',
  sleep: 'Dormir',
  speed: 'Velocidad',
  stamina: 'Estamina',
  stomach: 'Hambre',
  time: 'Tiempo',
  travel: 'Viaje',
  type: 'Tipo',
  voice: 'Voz',
  worker: 'Trabajadores',
  work: 'Trabajo'
};

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
