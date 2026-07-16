import './styles.css';
import { ApplicationStatus } from '../shared/enums/application-status';
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
        <p>v0.1.0 Base</p>
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
      <p class="eyebrow">FASE 1</p>
      <h2>Base tecnica inicial</h2>
      <p>Electron, NestJS, preload seguro y renderer base estan listos para conectar los estados reales.</p>
    </section>
    <section class="panel">
      <div class="panel__header">
        <span>Estado de aplicacion</span>
        <strong id="status-label">${ApplicationStatus.BOOTSTRAPPING}</strong>
      </div>
      <div class="progress"><div class="progress__bar"></div></div>
      <pre id="status-json" class="log">Consultando IPC seguro...</pre>
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
    <span>SteamCMD: Pending</span>
    <span>Firewall: Pending</span>
  </footer>
`;

const palcmApi = window.palcm;

bindWindowControls();

const statusLabel = document.querySelector('#status-label');
const portableRoot = document.querySelector('#portable-root');
const statusJson = document.querySelector('#status-json');
const titlebarBadge = document.querySelector('.titlebar__badge');

if (!palcmApi) {
  showIpcError('El preload seguro no expuso window.palcm. Revisar preload, sandbox y build.');
} else {
  try {
    const status = await palcmApi.app.getStatus();
    const actions = await palcmApi.app.getActions();

    if (statusLabel) {
      statusLabel.textContent = status.status;
    }

    if (titlebarBadge) {
      titlebarBadge.textContent = status.status;
    }

    if (portableRoot) {
      portableRoot.textContent = `Portable Path: ${status.portableRoot}`;
    }

    if (statusJson) {
      statusJson.textContent = JSON.stringify({ status, actions }, null, 2);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showIpcError(`No se pudo consultar IPC seguro: ${message}`);
  }
}

function showIpcError(message: string): void {
  if (statusLabel) {
    statusLabel.textContent = ApplicationStatus.ERROR;
  }

  if (titlebarBadge) {
    titlebarBadge.textContent = ApplicationStatus.ERROR;
  }

  if (statusJson) {
    statusJson.textContent = message;
    statusJson.classList.add('log--error');
  }
}
