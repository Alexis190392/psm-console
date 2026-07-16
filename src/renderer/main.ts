import './styles.css';
import { ApplicationStatus } from '../shared/enums/application-status';

const appRoot = document.querySelector<HTMLDivElement>('#app');

if (!appRoot) {
  throw new Error('Renderer root element was not found.');
}

appRoot.innerHTML = `
  <header class="titlebar">
    <div class="titlebar__brand">Palworld Server Manager</div>
    <div class="titlebar__badge">INITIALIZING</div>
    <div class="titlebar__spacer"></div>
    <button class="window-button" aria-label="Minimizar">-</button>
    <button class="window-button" aria-label="Maximizar">□</button>
    <button class="window-button window-button--close" aria-label="Cerrar">×</button>
  </header>
  <aside class="sidebar">
    <section class="sidebar__identity">
      <div class="sidebar__logo">▣</div>
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
    <button class="primary-action" disabled>Start Server</button>
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
  </main>
  <footer class="statusbar">
    <span id="portable-root">Portable Path: pendiente</span>
    <span>SteamCMD: Pending</span>
    <span>Firewall: Pending</span>
  </footer>
`;

const palcmApi = window.palcm;

if (palcmApi) {
  const status = await palcmApi.app.getStatus();
  const statusLabel = document.querySelector('#status-label');
  const portableRoot = document.querySelector('#portable-root');
  const statusJson = document.querySelector('#status-json');

  if (statusLabel) {
    statusLabel.textContent = status.status;
  }

  if (portableRoot) {
    portableRoot.textContent = `Portable Path: ${status.portableRoot}`;
  }

  if (statusJson) {
    statusJson.textContent = JSON.stringify(status, null, 2);
  }
}
