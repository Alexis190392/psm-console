import './styles.css';
import { ApplicationStatus } from '../shared/enums/application-status';
import type { AllowedActionsDto } from '../shared/dto/allowed-actions.dto';
import type { OperationProgressDto } from '../shared/dto/operation-progress.dto';
import { bindWindowControls } from './components/window-controls';
import {
  DEFAULT_SETTING_HELP,
  PALWORLD_SETTING_DEFINITIONS,
  type PalworldSettingDefinition
} from './config/palworld-settings-catalog';

const appRoot = document.querySelector<HTMLDivElement>('#app');

if (!appRoot) {
  throw new Error('Renderer root element was not found.');
}

appRoot.innerHTML = `
  <header class="titlebar">
    <div class="titlebar__brand">Palworld Server Manager</div>
    <div class="titlebar__badge">INITIALIZING</div>
    <div class="titlebar__spacer"></div>
    <button id="window-minimize" class="window-button" aria-label="Minimizar">-</button>
    <button id="window-maximize" class="window-button" aria-label="Maximizar">[]</button>
    <button id="window-close" class="window-button window-button--close" aria-label="Cerrar">x</button>
  </header>
  <aside class="sidebar">
    <section class="sidebar__identity">
      <div class="sidebar__logo">P</div>
      <div>
        <h1>PSM Console</h1>
        <p>v0.1.0 Dev</p>
      </div>
    </section>
    <nav class="sidebar__nav" aria-label="Navegacion principal">
      <a class="sidebar__link sidebar__link--active" data-nav="home" href="#">General</a>
      <a class="sidebar__link sidebar__link--locked" data-nav="server" href="#">Server</a>
      <a class="sidebar__link sidebar__link--locked" data-nav="configuration" href="#">Configuration</a>
      <a class="sidebar__link sidebar__link--locked" data-nav="network" href="#">Network & Firewall</a>
      <a class="sidebar__link sidebar__link--locked" data-nav="backups" href="#">Backups</a>
      <a class="sidebar__link sidebar__link--locked" data-nav="logs" href="#">Logs</a>
    </nav>
    <button id="start-server-action" class="primary-action" type="button" disabled>Start Server</button>
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
  <footer class="statusbar">
    <span id="portable-root">Portable Path: pendiente</span>
    <span id="steamcmd-footer">SteamCMD: Pending</span>
    <span>Firewall: Pending</span>
  </footer>
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
const titlebarBadge = document.querySelector('.titlebar__badge');
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
const startServerAction = document.querySelector<HTMLButtonElement>('#start-server-action');
const navLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('.sidebar__link[data-nav]'));
const consoleLines: string[] = [];
const operationLogOffsets = new Map<string, number>();
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

  navLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();

      if (link.getAttribute('aria-disabled') === 'true') {
        return;
      }

      activeView = link.dataset['nav'] ?? 'home';
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
    setText(titlebarBadge, status.status);
    setText(portableRoot, `Portable Path: ${status.portableRoot}`);
    setText(steamCmdFooter, `SteamCMD: ${steamCmd.status}`);
    renderHero(status.status);
    setProgressForStatus(status.status);
    appendConsoleLine(`Estado: ${status.status}`);
    appendConsoleLine(`Raiz de ejecucion: ${status.portableRoot}`);
    appendConsoleLine(`SteamCMD: ${steamCmd.status} - ${steamCmd.executablePath}`);
    appendConsoleLine(`Servidor Palworld: ${server.status} - ${server.executablePath}`);
    appendConsoleLine(`Configuracion: ${config.status} - ${config.activePath}`);
    updateNavigation(status.status, actions);
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

function showPreflight(): void {
  panelStatusHeader?.classList.remove('hidden');
  progressBar?.parentElement?.classList.remove('hidden');
  contentView?.classList.add('hidden');
  document.querySelector('.console-shell')?.classList.remove('hidden');
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

async function createDefaultConfiguration(): Promise<void> {
  if (!palcmApi) {
    return;
  }

  disableConfirmationButtons();
  appendConsoleLine('Confirmado: crear configuracion inicial.');
  const accepted = await palcmApi.config.createDefault({ confirmed: true });
  await pollOperation(accepted.operationId);
  await refreshState();
}

async function pollOperation(operationId: string): Promise<void> {
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

    await wait(500);
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
  setText(titlebarBadge, ApplicationStatus.ERROR);

  if (consoleOutput) {
    consoleOutput.textContent = message;
    consoleOutput.classList.add('log--error');
  }
}

function renderHero(status: ApplicationStatus): void {
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
    [ApplicationStatus.READY]: 100
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

  if (consoleOutput) {
    consoleOutput.textContent = consoleLines.join('\n');
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
  }
}

function updateNavigation(status: ApplicationStatus, actions: AllowedActionsDto): void {
  const serverAvailable = ![
    ApplicationStatus.STEAMCMD_MISSING,
    ApplicationStatus.SERVER_MISSING
  ].includes(status);
  const configurationAvailable = actions.canEditConfiguration;
  const logsAvailable = serverAvailable;

  navLinks.forEach((link) => {
    const nav = link.dataset['nav'];
    const enabled =
      nav === 'home' ||
      (nav === 'server' && serverAvailable) ||
      (nav === 'configuration' && configurationAvailable) ||
      (nav === 'logs' && logsAvailable) ||
      (nav === 'backups' && actions.canCreateBackup) ||
      (nav === 'network' && actions.canManageFirewall);

    link.classList.toggle('sidebar__link--locked', !enabled);
    link.classList.toggle('sidebar__link--active', nav === activeView);
    link.setAttribute('aria-disabled', enabled ? 'false' : 'true');
  });
}

function updateStartServerButton(actions: AllowedActionsDto): void {
  if (!startServerAction) {
    return;
  }

  startServerAction.disabled = !actions.canStartServer;
  startServerAction.textContent = actions.canStartServer ? 'Start Server' : 'Server bloqueado';
}

function renderActiveView(): void {
  if (!latestActions) {
    return;
  }

  hideConfirmation();
  updateReadyChrome();
  document.querySelector('.console-shell')?.classList.toggle('hidden', activeView !== 'logs');
  contentView?.classList.toggle('hidden', activeView === 'logs');
  navLinks.forEach((link) => {
    link.classList.toggle('sidebar__link--active', link.dataset['nav'] === activeView);
  });

  if (activeView === 'home') {
    void renderGeneralView();
    return;
  }

  if (activeView === 'configuration') {
    renderSimpleView(
      'Configuration',
      'La configuracion editable del servidor ahora esta en la pestaÃ±a Server. Esta seccion queda reservada para opciones avanzadas de la app.'
    );
    return;
  }

  if (activeView === 'server') {
    void renderServerConfigurationView();
    return;
  }

  if (activeView === 'network') {
    renderSimpleView('Network & Firewall', 'Modulo pendiente. La app todavia no modifica firewall ni red desde esta pantalla.');
    return;
  }

  if (activeView === 'backups') {
    renderSimpleView('Backups', 'Modulo pendiente. La app ya reserva carpetas de backup y los guardados de configuracion crean copia previa.');
  }
}

async function renderGeneralView(): Promise<void> {
  updateReadyChrome();

  if (latestStatus !== ApplicationStatus.READY) {
    renderPreflightSummary();
    return;
  }

  const port = await readConfiguredPort();
  const portState = port ? createHealthCardState('ok') : createHealthCardState('warning');

  setContent(`
    <div class="view-stack">
      <section class="summary-grid summary-grid--ready">
        ${renderHealthCard({
          title: 'SteamCMD',
          value: 'Instalado',
          detail: 'Cliente listo para actualizar y validar archivos.',
          target: 'logs',
          ...createHealthCardState('ok')
        })}
        ${renderHealthCard({
          title: 'Servidor',
          value: 'Instalado',
          detail: latestSummary?.serverPath ?? 'PalServer.exe detectado.',
          target: 'server',
          ...createHealthCardState('ok')
        })}
        ${renderHealthCard({
          title: 'Configuracion',
          value: 'Activa',
          detail: latestSummary?.configurationPath ?? 'PalWorldSettings.ini disponible.',
          target: 'configuration',
          ...createHealthCardState('ok')
        })}
        ${renderHealthCard({
          title: 'Puerto',
          value: port ? `UDP ${port}` : 'Sin validar',
          detail: port ? 'Puerto leido desde la configuracion activa.' : 'No se encontro PublicPort en el INI activo.',
          target: 'network',
          ...portState
        })}
        ${renderHealthCard({
          title: 'Firewall',
          value: 'Pendiente',
          detail: 'La verificacion y regla de Windows se implementa en la fase de red.',
          target: 'network',
          ...createHealthCardState('warning')
        })}
        ${renderHealthCard({
          title: 'Backups',
          value: 'Configuracion',
          detail: 'Los guardados del INI ya generan backup previo.',
          target: 'backups',
          ...createHealthCardState('optional')
        })}
      </section>
    </div>
  `);
  bindSummaryCards();
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
    setContent(`
      <div class="view-stack">
        <div class="view-header">
          <div>
            <span class="view-kicker">SERVER</span>
            <h3>Configuracion del servidor</h3>
            <p>${escapeHtml(file.path)}</p>
          </div>
          <div class="view-actions">
            <button id="restore-default-config" class="secondary-button" type="button">Volver a default</button>
            <button id="save-config" class="primary-button" type="button">Guardar</button>
          </div>
        </div>
        <div id="default-confirmation" class="inline-confirm hidden">
          <span>Se creara un backup y se reemplazara la configuracion activa por los valores default instalados.</span>
          <button id="confirm-restore-default" class="primary-button" type="button">Confirmar</button>
          <button id="cancel-restore-default" class="secondary-button" type="button">Cancelar</button>
        </div>
        <form id="settings-form" class="settings-form">
          ${renderSettingsForm(parsed)}
        </form>
        <details class="advanced-config">
          <summary>Ver INI avanzado</summary>
          <textarea id="config-editor" class="config-editor" spellcheck="false">${escapeHtml(file.content)}</textarea>
        </details>
      </div>
    `);
    document.querySelector<HTMLButtonElement>('#save-config')?.addEventListener('click', () => {
      void saveConfiguration(parsed);
    });
    document.querySelector<HTMLButtonElement>('#restore-default-config')?.addEventListener(
      'click',
      showRestoreDefaultConfirmation
    );
    document.querySelector<HTMLButtonElement>('#confirm-restore-default')?.addEventListener('click', () => {
      void restoreDefaultConfiguration();
    });
    document.querySelector<HTMLButtonElement>('#cancel-restore-default')?.addEventListener(
      'click',
      hideRestoreDefaultConfirmation
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    renderSimpleView('Server', `No se pudo leer la configuracion activa. ${message}`);
  }
}

async function saveConfiguration(parsed?: ParsedPalworldSettings): Promise<void> {
  if (!palcmApi) {
    return;
  }

  const editor = document.querySelector<HTMLTextAreaElement>('#config-editor');
  const content = parsed ? serializePalworldSettings(parsed, readSettingsFormValues(parsed)) : editor?.value;

  if (!content) {
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
  activeView = 'server';
  await refreshState();
}

function showRestoreDefaultConfirmation(): void {
  document.querySelector('#default-confirmation')?.classList.remove('hidden');
}

function hideRestoreDefaultConfirmation(): void {
  document.querySelector('#default-confirmation')?.classList.add('hidden');
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
  const shouldHidePreflightChrome = latestStatus === ApplicationStatus.READY && activeView === 'home';
  panelStatusHeader?.classList.toggle('hidden', shouldHidePreflightChrome);
  progressBar?.parentElement?.classList.toggle('hidden', shouldHidePreflightChrome);
}

function renderHealthCard(details: {
  title: string;
  value: string;
  detail: string;
  target: string;
  icon: string;
  tone: string;
  label: string;
}): string {
  return `
    <button class="summary-card summary-card--${details.tone}" data-target="${details.target}" type="button">
      <span class="summary-card__body">
        <span class="summary-card__title">${escapeHtml(details.title)}</span>
        <strong>${escapeHtml(details.value)}</strong>
        <small>${escapeHtml(details.detail)}</small>
      </span>
      <span class="summary-card__icon" aria-label="${escapeHtml(details.label)}">${details.icon}</span>
    </button>
  `;
}

function createHealthCardState(state: 'ok' | 'error' | 'warning' | 'optional'): {
  icon: string;
  tone: string;
  label: string;
} {
  if (state === 'ok') {
    return { icon: '&#10003;', tone: 'ok', label: 'Correcto' };
  }

  if (state === 'error') {
    return { icon: '&times;', tone: 'error', label: 'Incorrecto' };
  }

  if (state === 'warning') {
    return { icon: '!', tone: 'warning', label: 'Revisar' };
  }

  return { icon: '&#9881;', tone: 'optional', label: 'Configuracion opcional' };
}

function bindSummaryCards(): void {
  document.querySelectorAll<HTMLButtonElement>('.summary-card[data-target]').forEach((card) => {
    card.addEventListener('click', () => {
      activeView = card.dataset['target'] ?? 'home';
      renderActiveView();
    });
  });
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

interface ParsedPalworldSetting {
  key: string;
  value: string;
}

interface ParsedPalworldSettings {
  originalContent: string;
  prefix: string;
  suffix: string;
  settings: ParsedPalworldSetting[];
}

function parsePalworldSettings(content: string): ParsedPalworldSettings {
  const marker = 'OptionSettings=(';
  const start = content.indexOf(marker);

  if (start < 0) {
    return {
      originalContent: content,
      prefix: content,
      suffix: '',
      settings: []
    };
  }

  const valueStart = start + marker.length;
  const valueEnd = findOptionSettingsEnd(content, valueStart);
  const body = content.slice(valueStart, valueEnd);

  return {
    originalContent: content,
    prefix: content.slice(0, valueStart),
    suffix: content.slice(valueEnd),
    settings: splitTopLevel(body).map((entry) => {
      const separator = entry.indexOf('=');
      return {
        key: entry.slice(0, separator).trim(),
        value: entry.slice(separator + 1).trim()
      };
    })
  };
}

function findOptionSettingsEnd(content: string, valueStart: number): number {
  let isQuoted = false;
  let depth = 0;

  for (let index = valueStart; index < content.length; index += 1) {
    const char = content[index];

    if (char === '"' && content[index - 1] !== '\\') {
      isQuoted = !isQuoted;
      continue;
    }

    if (!isQuoted && char === '(') {
      depth += 1;
      continue;
    }

    if (!isQuoted && char === ')' && depth > 0) {
      depth -= 1;
      continue;
    }

    if (!isQuoted && char === ')') {
      return index;
    }
  }

  return content.length;
}

function splitTopLevel(value: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  let isQuoted = false;

  for (const char of value) {
    if (char === '"') {
      isQuoted = !isQuoted;
    }

    if (!isQuoted && char === '(') {
      depth += 1;
    }

    if (!isQuoted && char === ')') {
      depth -= 1;
    }

    if (!isQuoted && depth === 0 && char === ',') {
      parts.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim().length > 0) {
    parts.push(current);
  }

  return parts;
}

function serializePalworldSettings(parsed: ParsedPalworldSettings, values: Map<string, string>): string {
  const nextBody = parsed.settings
    .map((setting) => `${setting.key}=${values.get(setting.key) ?? setting.value}`)
    .join(',');

  return `${parsed.prefix}${nextBody}${parsed.suffix}`;
}

function readSettingsFormValues(parsed: ParsedPalworldSettings): Map<string, string> {
  const values = new Map<string, string>();

  parsed.settings.forEach((setting) => {
    const definition = getSettingDefinition(setting.key, setting.value);
    const input = document.querySelector<HTMLInputElement | HTMLSelectElement>(
      `[data-setting-key="${cssEscape(setting.key)}"]`
    );

    if (!input) {
      values.set(setting.key, setting.value);
      return;
    }

    if (definition.kind === 'boolean') {
      values.set(setting.key, input instanceof HTMLInputElement && input.checked ? 'True' : 'False');
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
          <h4>${escapeHtml(group)}</h4>
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

  return `
    <label class="setting-field">
      <span class="setting-field__top">
        <span>
          <strong>${escapeHtml(definition.label)}</strong>
          <small>${escapeHtml(setting.key)}</small>
        </span>
        <button class="setting-info" type="button" aria-label="${escapeHtml(info)}" title="${escapeHtml(info)}">i</button>
      </span>
      ${renderSettingInput(definition, setting.key, rawValue)}
    </label>
  `;
}

function renderSettingInput(definition: PalworldSettingDefinition, key: string, value: string): string {
  if (definition.kind === 'boolean') {
    return `
      <span class="setting-toggle">
        <input data-setting-key="${escapeHtml(key)}" type="checkbox" ${value.toLowerCase() === 'true' ? 'checked' : ''} />
        <span>Activo</span>
      </span>
    `;
  }

  if (definition.kind === 'select' && definition.options) {
    return `
      <select data-setting-key="${escapeHtml(key)}">
        ${definition.options
          .map((option) => `<option value="${escapeHtml(option)}" ${option === value ? 'selected' : ''}>${escapeHtml(option)}</option>`)
          .join('')}
      </select>
    `;
  }

  if (definition.kind === 'number') {
    return `<input data-setting-key="${escapeHtml(key)}" type="number" step="any" value="${escapeHtml(value)}" />`;
  }

  return `<input data-setting-key="${escapeHtml(key)}" type="text" value="${escapeHtml(value)}" />`;
}

function getSettingDefinition(key: string, value: string): PalworldSettingDefinition {
  const known = PALWORLD_SETTING_DEFINITIONS[key];

  if (known) {
    return known;
  }

  return {
    key,
    label: splitSettingKey(key),
    group: 'Avanzado',
    kind: inferSettingKind(value),
    help: DEFAULT_SETTING_HELP
  };
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

function formatSettingValue(definition: PalworldSettingDefinition, value: string, originalValue: string): string {
  if (definition.kind === 'text' && shouldQuoteTextValue(value, originalValue)) {
    return `"${value.replaceAll('"', '\\"')}"`;
  }

  return value;
}

function shouldQuoteTextValue(value: string, originalValue: string): boolean {
  if (value.startsWith('(') && value.endsWith(')')) {
    return false;
  }

  return originalValue.startsWith('"') || value.length === 0 || /[\s:/\\]/.test(value);
}

function unquoteSettingValue(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replaceAll('\\"', '"');
  }

  return value;
}

function splitSettingKey(key: string): string {
  return key
    .replace(/^b(?=[A-Z])/, '')
    .replaceAll('_', ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2');
}

function cssEscape(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function setContent(html: string): void {
  if (contentView) {
    contentView.innerHTML = html;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
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
