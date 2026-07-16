import './styles.css';
import { ApplicationStatus } from '../shared/enums/application-status';
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
      <a class="sidebar__link sidebar__link--active" href="#">Home</a>
      <a class="sidebar__link sidebar__link--locked" href="#">Server</a>
      <a class="sidebar__link sidebar__link--locked" href="#">Configuration</a>
      <a class="sidebar__link sidebar__link--locked" href="#">Network & Firewall</a>
      <a class="sidebar__link sidebar__link--locked" href="#">Backups</a>
      <a class="sidebar__link sidebar__link--locked" href="#">Logs</a>
    </nav>
    <button id="start-server-action" class="primary-action" type="button" disabled>Start Server</button>
  </aside>
  <main class="workspace">
    <section class="hero">
      <p class="eyebrow">PREPARACION</p>
      <h2>Preparando entorno portable</h2>
      <p>El modo desarrollo usa una carpeta aislada para pruebas y requiere confirmacion antes de descargar o instalar.</p>
    </section>
    <section class="panel">
      <div class="panel__header">
        <span>Estado de aplicacion</span>
        <strong id="status-label">${ApplicationStatus.BOOTSTRAPPING}</strong>
      </div>
      <div class="progress"><div id="progress-bar" class="progress__bar"></div></div>
      <pre id="status-json" class="log">Consultando IPC seguro...</pre>
    </section>
    <section class="panel panel--notice">
      <div class="panel__header">
        <span>SteamCMD</span>
        <strong id="steamcmd-status">PENDING</strong>
      </div>
      <p id="steamcmd-message">Verificando SteamCMD...</p>
      <div class="action-row">
        <button id="install-steamcmd" class="primary-button" type="button" disabled>
          Descargar SteamCMD
        </button>
        <span id="operation-message" class="operation-message">Sin operacion activa.</span>
      </div>
    </section>
    <section class="panel panel--notice">
      <div class="panel__header">
        <span>Servidor Palworld</span>
        <strong id="server-status">PENDING</strong>
      </div>
      <p id="server-message">Verificando servidor dedicado...</p>
      <div class="action-row">
        <button id="install-server" class="primary-button" type="button" disabled>
          Instalar servidor
        </button>
        <span id="server-operation-message" class="operation-message">Sin operacion activa.</span>
      </div>
    </section>
    <section class="panel panel--notice">
      <div class="panel__header">
        <span>Politica de confirmacion</span>
        <strong>OBLIGATORIA</strong>
      </div>
      <p>
        Crear el servidor, descargar SteamCMD, descargar Palworld Dedicated Server,
        modificar Firewall, restaurar backups o reemplazar configuracion requerira
        una confirmacion explicita antes de ejecutar cualquier accion real.
      </p>
      <ul class="confirmation-list">
        <li>Sin confirmacion: solo lectura, diagnostico y preflight.</li>
        <li>Con confirmacion: descargas, instalaciones, firewall, backups y procesos.</li>
        <li>En tests: siempre mocks y fixtures, sin tocar servicios reales.</li>
      </ul>
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
const statusJson = document.querySelector('#status-json');
const titlebarBadge = document.querySelector('.titlebar__badge');
const progressBar = document.querySelector<HTMLDivElement>('#progress-bar');
const steamCmdStatus = document.querySelector('#steamcmd-status');
const steamCmdMessage = document.querySelector('#steamcmd-message');
const steamCmdFooter = document.querySelector('#steamcmd-footer');
const installSteamCmdButton = document.querySelector<HTMLButtonElement>('#install-steamcmd');
const operationMessage = document.querySelector('#operation-message');
const serverStatus = document.querySelector('#server-status');
const serverMessage = document.querySelector('#server-message');
const installServerButton = document.querySelector<HTMLButtonElement>('#install-server');
const serverOperationMessage = document.querySelector('#server-operation-message');
let serverInstallPromptWasShown = false;

if (!palcmApi) {
  showIpcError('El preload seguro no expuso window.palcm. Revisar preload, sandbox y build.');
} else {
  await refreshState();

  installSteamCmdButton?.addEventListener('click', () => {
    void confirmAndInstallSteamCmd();
  });

  installServerButton?.addEventListener('click', () => {
    void confirmAndInstallServer();
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

    setText(statusLabel, status.status);
    setText(titlebarBadge, status.status);
    setText(portableRoot, `Portable Path: ${status.portableRoot}`);
    setText(steamCmdStatus, steamCmd.status);
    setText(steamCmdMessage, `${steamCmd.message}\nDestino: ${steamCmd.installDirectory}`);
    setText(steamCmdFooter, `SteamCMD: ${steamCmd.status}`);
    setText(serverStatus, server.status);
    setText(serverMessage, `${server.message}\nDestino: ${server.installDirectory}\nAppID: ${server.appId}`);

    if (installSteamCmdButton) {
      installSteamCmdButton.disabled = !actions.canInstallSteamCmd;
    }

    if (installServerButton) {
      installServerButton.disabled = !actions.canInstallServer;
    }

    if (statusJson) {
      statusJson.textContent = JSON.stringify({ status, actions, steamCmd, server }, null, 2);
    }

    if (actions.canInstallServer && !serverInstallPromptWasShown) {
      serverInstallPromptWasShown = true;
      void confirmAndInstallServer();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showIpcError(`No se pudo consultar IPC seguro: ${message}`);
  }
}

async function confirmAndInstallSteamCmd(): Promise<void> {
  if (!palcmApi) {
    return;
  }

  const steamCmd = await palcmApi.steamCmd.getStatus();
  const confirmed = window.confirm(
    `Se descargara SteamCMD desde el sitio oficial de Valve.\n\n` +
      `Origen:\n${steamCmd.officialDownloadUrl}\n\n` +
      `Destino:\n${steamCmd.installDirectory}\n\n` +
      `Continuar?`
  );

  if (!confirmed) {
    setText(operationMessage, 'Instalacion cancelada por el usuario.');
    return;
  }

  installSteamCmdButton?.setAttribute('disabled', 'true');
  const accepted = await palcmApi.steamCmd.install({ confirmed: true });
  await pollOperation(accepted.operationId);
  await refreshState();
}

async function confirmAndInstallServer(): Promise<void> {
  if (!palcmApi) {
    return;
  }

  const server = await palcmApi.server.getInstallationStatus();
  const confirmed = window.confirm(
    `Se instalara Palworld Dedicated Server mediante SteamCMD.\n\n` +
      `AppID:\n${server.appId}\n\n` +
      `Destino:\n${server.installDirectory}\n\n` +
      `SteamCMD descargara archivos del servidor. Continuar?`
  );

  if (!confirmed) {
    setText(serverOperationMessage, 'Instalacion cancelada por el usuario.');
    return;
  }

  installServerButton?.setAttribute('disabled', 'true');
  const accepted = await palcmApi.server.install({ confirmed: true });
  await pollOperation(accepted.operationId, serverOperationMessage);
  await refreshState();
}

async function pollOperation(operationId: string, targetMessage: Element | null = operationMessage): Promise<void> {
  if (!palcmApi) {
    return;
  }

  let operation: OperationProgressDto;

  let shouldContinuePolling = true;

  while (shouldContinuePolling) {
    operation = await palcmApi.operation.get(operationId);
    renderOperation(operation, targetMessage);

    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(operation.status)) {
      shouldContinuePolling = false;
      continue;
    }

    await wait(500);
  }
}

function renderOperation(operation: OperationProgressDto, targetMessage: Element | null): void {
  setText(targetMessage, `${String(operation.percent)}% - ${operation.message}`);

  if (progressBar) {
    progressBar.style.width = `${String(operation.percent)}%`;
  }

  if (statusJson) {
    statusJson.textContent = JSON.stringify({ operation }, null, 2);
  }
}

function showIpcError(message: string): void {
  setText(statusLabel, ApplicationStatus.ERROR);
  setText(titlebarBadge, ApplicationStatus.ERROR);

  if (statusJson) {
    statusJson.textContent = message;
    statusJson.classList.add('log--error');
  }
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
