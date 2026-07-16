import './styles.css';
import { ApplicationStatus } from '../shared/enums/application-status';
import type { AllowedActionsDto } from '../shared/dto/allowed-actions.dto';
import type { OperationProgressDto } from '../shared/dto/operation-progress.dto';
import { bindWindowControls } from './components/window-controls';

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
      <a class="sidebar__link sidebar__link--active" data-nav="home" href="#">Home</a>
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
const heroTitle = document.querySelector('#hero-title');
const heroSubtitle = document.querySelector('#hero-subtitle');
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
const navLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('.sidebar__link[data-nav]'));
const consoleLines: string[] = [];
const operationLogOffsets = new Map<string, number>();
let pendingAction: 'steamcmd' | 'server' | 'config' | null = null;

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

    if (actions.canInstallSteamCmd) {
      showSteamCmdConfirmation(steamCmd.officialDownloadUrl, steamCmd.installDirectory);
      return;
    }

    if (actions.canInstallServer) {
      showServerConfirmation(server.appId, server.installDirectory);
      return;
    }

    if (status.status === ApplicationStatus.CONFIGURATION_MISSING) {
      showConfigConfirmation(config.templatePath, config.activePath);
      return;
    }

    hideConfirmation();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showIpcError(`No se pudo consultar IPC seguro: ${message}`);
  }
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
    setText(heroTitle, 'Entorno listo');
    setText(heroSubtitle, 'SteamCMD, servidor, configuracion y acciones principales estan disponibles.');
    return;
  }

  if (status === ApplicationStatus.CONFIGURATION_MISSING) {
    setText(heroTitle, 'Entorno base listo');
    setText(heroSubtitle, 'SteamCMD y el servidor estan instalados. Falta preparar la configuracion inicial.');
    return;
  }

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
    link.setAttribute('aria-disabled', enabled ? 'false' : 'true');
  });
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
