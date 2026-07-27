const { app, BrowserWindow, ipcMain } = require('electron');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const { createNestContext } = require('../dist/main/bootstrap/nest-bootstrap');
const { registerIpcHandlers } = require('../dist/main/ipc/register-ipc-handlers');
const { createMainWindowOptions } = require('../dist/main/electron/window-options');

const outputDir = join(process.cwd(), 'docs', 'implementation', 'visual-comparison');
const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'minimum', width: 1100, height: 700 },
  { name: 'vertical', width: 1100, height: 1200 }
];
const views = [
  { name: 'general', nav: 'home' },
  { name: 'servidor', nav: 'server' },
  { name: 'red-firewall', nav: 'network' },
  { name: 'backups', nav: 'backups' },
  { name: 'logs', nav: 'logs' },
  { name: 'configuracion-resumen', nav: 'settings' },
  {
    name: 'configuracion-api-web',
    nav: 'settings',
    selector: '[data-settings-sidebar-tab="remote-api"]'
  }
];
const manualViews = [
  { name: 'general', selector: '.sidebar__link[data-nav="home"]', waitMs: 1200 },
  { name: 'servidor', selector: '.sidebar__link[data-nav="server"]', waitMs: 1200 },
  { name: 'red-firewall', selector: '.sidebar__link[data-nav="network"]', waitMs: 5500 },
  { name: 'backups', selector: '.sidebar__link[data-nav="backups"]', waitMs: 1200 },
  { name: 'logs', selector: '.sidebar__link[data-nav="logs"]', waitMs: 900, fixtureLogs: true },
  { name: 'configuracion-resumen', selector: '[data-settings-sidebar-tab="summary"]', waitMs: 1200 },
  { name: 'configuracion-aplicacion', selector: '[data-settings-sidebar-tab="application"]', waitMs: 1200 },
  { name: 'configuracion-automatizaciones', selector: '[data-settings-sidebar-tab="automation"]', waitMs: 1200 },
  { name: 'configuracion-api-web', selector: '[data-settings-sidebar-tab="remote-api"]', waitMs: 1200 }
];
const manualRuntimeViews = [
  { name: 'administracion-servidor', selector: '[data-admin-sidebar-tab="general"]', waitMs: 5000 },
  { name: 'administracion-jugadores', selector: '[data-admin-sidebar-tab="players"]', waitMs: 2500 },
  { name: 'administracion-mapa', selector: '[data-admin-sidebar-tab="map"]', waitMs: 1500 },
  { name: 'general-servidor-activo', selector: '.sidebar__link[data-nav="home"]', waitMs: 1500 }
];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForSelector(window, selector, timeoutMs = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const exists = await window.webContents.executeJavaScript(
      `Boolean(document.querySelector(${JSON.stringify(selector)}))`
    );
    if (exists) {
      return;
    }
    await wait(200);
  }
  throw new Error(`Selector not found: ${selector}`);
}

async function clickNav(window, nav) {
  const selector = `.sidebar__link[data-nav="${nav}"]`;
  await waitForSelector(window, `${selector}[aria-disabled="false"]`);
  const clicked = await window.webContents.executeJavaScript(`
    (() => {
      const link = document.querySelector(${JSON.stringify(selector)});
      if (!link) return false;
      link.click();
      return true;
    })()
  `);
  if (!clicked) {
    throw new Error(`Navigation link could not be clicked: ${nav}`);
  }
  if (nav === 'settings') {
    const summarySelector = '.sidebar__sublink[data-settings-sidebar-tab="summary"]';
    await waitForSelector(window, summarySelector);
    await window.webContents.executeJavaScript(`
      document.querySelector(${JSON.stringify(summarySelector)})?.click()
    `);
    await waitForSelector(window, `${summarySelector}.sidebar__link--active`);
  } else {
    await waitForSelector(window, `${selector}.sidebar__link--active`);
  }
  await wait(nav === 'network' ? 4500 : 800);
}

async function capture(window, viewport, view) {
  window.setSize(viewport.width, viewport.height);
  await wait(400);
  await clickNav(window, view.nav);
  if (view.selector) {
    await waitForSelector(window, view.selector);
    await window.webContents.executeJavaScript(`
      document.querySelector(${JSON.stringify(view.selector)})?.click()
    `);
    await waitForSelector(window, `${view.selector}.sidebar__link--active`);
    await wait(500);
  }
  const image = await window.webContents.capturePage();
  writeFileSync(
    join(outputDir, `${viewport.name}-${String(viewport.width)}x${String(viewport.height)}-${view.name}.png`),
    image.toPNG()
  );
}

async function openManualView(window, view) {
  if (view.selector.includes('data-settings-sidebar-tab')) {
    await window.webContents.executeJavaScript(`
      document.querySelector('[data-settings-group-toggle]')?.click()
    `);
    await waitForSelector(window, view.selector);
  }
  if (view.selector.includes('data-admin-sidebar-tab')) {
    await window.webContents.executeJavaScript(`
      document.querySelector('[data-admin-group-toggle]')?.click()
    `);
    await waitForSelector(window, view.selector);
  }

  const clicked = await window.webContents.executeJavaScript(`
    (() => {
      const element = document.querySelector(${JSON.stringify(view.selector)});
      if (!element || element.getAttribute('aria-disabled') === 'true') return false;
      element.click();
      return true;
    })()
  `);
  if (!clicked) {
    throw new Error(`Manual view is not available: ${view.name}`);
  }
  await wait(view.waitMs);
}

async function applySafeDocumentationData(window, fixtureLogs) {
  await window.webContents.executeJavaScript(`
    (() => {
      const isPrivateIpv4 = (value) => {
        const parts = value.split('.').map(Number);
        return parts[0] === 10 ||
          parts[0] === 127 ||
          (parts[0] === 169 && parts[1] === 254) ||
          (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
          (parts[0] === 192 && parts[1] === 168);
      };
      const sanitize = (value) => value
        .replace(/D:\\\\MyAPIS\\\\PalCM\\\\ejecucionPruebas/gi, 'D:\\\\PSM Console')
        .replace(/D:\\\\MyAPIS\\\\PalCM/gi, 'D:\\\\PSM Console')
        .replace(/C:\\\\Users\\\\alexi/gi, 'C:\\\\Users\\\\Usuario')
        .replace(/\\balexi\\b/gi, 'Usuario')
        .replace(/\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b/g, (ip) => isPrivateIpv4(ip) ? '192.0.2.100' : '203.0.113.25')
        .replace(/\\bPID\\s+\\d+\\b/g, 'PID 12345')
        .replace(/steam_\\d{10,}/gi, 'steam_00000000000000000')
        .replace(/\\b\\d{17}\\b/g, '00000000000000000')
        .replace(/\\b[A-F\\d]{24,}\\b/gi, '00000000000000000000000000000000');

      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        node.nodeValue = sanitize(node.nodeValue ?? '');
        node = walker.nextNode();
      }
      document.querySelectorAll('[title], [aria-label]').forEach((element) => {
        for (const attribute of ['title', 'aria-label']) {
          const value = element.getAttribute(attribute);
          if (value) element.setAttribute(attribute, sanitize(value));
        }
      });
      document.querySelectorAll('.player-row').forEach((row, index) => {
        const exampleNumber = String(index + 1);
        const name = row.querySelector('.player-row__identity strong');
        const identity = row.querySelector('.player-row__identity span');
        const details = row.querySelector('.player-row__details');
        if (name) name.textContent = 'Jugador de ejemplo ' + exampleNumber;
        if (identity) identity.textContent = 'steam_0000000000000000' + exampleNumber;
        if (details) details.textContent = 'PlayerUID 00000000000000000000000000000000 - UserID steam_0000000000000000' + exampleNumber;
        row.querySelectorAll('input[type="hidden"]').forEach((input) => {
          input.value = 'steam_0000000000000000' + exampleNumber;
        });
      });
      document.querySelectorAll('.admin-map-marker__label, .admin-map-player strong').forEach((element, index) => {
        element.textContent = 'Jugador de ejemplo ' + String(index + 1);
      });

      if (${fixtureLogs ? 'true' : 'false'}) {
        const output = document.querySelector('#console-output');
        if (output) {
          output.textContent = [
            '[2026-07-27 13:20:04] [INFO] [app] PSM Console iniciado.',
            '[2026-07-27 13:20:04] [INFO] [app] Raiz portable: D:\\\\PSM Console',
            '[2026-07-27 13:20:05] [INFO] [server] Servidor listo para iniciar.',
            '[2026-07-27 13:20:05] [INFO] [network] LAN disponible: 192.0.2.100:8211',
            '[2026-07-27 13:20:06] [INFO] [network] IP publica detectada: 203.0.113.25'
          ].join('\\n');
        }
      }
    })()
  `);
}

async function getServerRuntime(window) {
  return window.webContents.executeJavaScript(`
    window.palcm?.server?.getRuntimeStatus?.().catch(() => null)
  `);
}

async function ensureServerRunning(window) {
  const current = await getServerRuntime(window);
  if (current?.state === 'RUNNING') {
    return true;
  }

  const accepted = await window.webContents.executeJavaScript(`
    window.palcm?.server?.start?.({ confirmed: true }).catch((error) => ({ error: String(error?.message ?? error) }))
  `);
  if (accepted?.error) {
    throw new Error(`Server could not start: ${accepted.error}`);
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < 60000) {
    const runtime = await getServerRuntime(window);
    if (runtime?.state === 'RUNNING') {
      return true;
    }
    if (runtime?.state === 'ERROR') {
      throw new Error(`Server entered an error state: ${runtime.message ?? 'unknown error'}`);
    }
    await wait(1000);
  }
  throw new Error('Server did not reach RUNNING state within 60 seconds.');
}

async function ensureServerStopped(window) {
  const current = await getServerRuntime(window);
  if (!current || current.state === 'STOPPED') {
    return;
  }

  const accepted = await window.webContents.executeJavaScript(`
    window.palcm?.server?.stop?.({ confirmed: true }).catch((error) => ({ error: String(error?.message ?? error) }))
  `);
  if (accepted?.error) {
    throw new Error(`Server could not stop: ${accepted.error}`);
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < 60000) {
    const runtime = await getServerRuntime(window);
    if (!runtime || runtime.state === 'STOPPED') {
      return;
    }
    await wait(1000);
  }
  throw new Error('Server did not reach STOPPED state within 60 seconds.');
}

async function waitForEnabledNavigation(window, nav, timeoutMs = 30000) {
  const selector = `.sidebar__link[data-nav="${nav}"]`;
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const enabled = await window.webContents.executeJavaScript(`
      (() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        return Boolean(element && !element.classList.contains('hidden') && element.getAttribute('aria-disabled') !== 'true');
      })()
    `);
    if (enabled) {
      return;
    }
    await wait(500);
  }
  throw new Error(`Navigation did not become available: ${nav}`);
}

async function writeManualScreenshot(window, outputDir, view) {
  await openManualView(window, view);
  await applySafeDocumentationData(window, Boolean(view.fixtureLogs));
  await wait(250);
  const image = await window.webContents.capturePage();
  writeFileSync(join(outputDir, `${view.name}.png`), image.toPNG());
}

async function captureManualScreenshots(window) {
  const manualOutputDir = join(process.cwd(), 'resources', 'screenshots');
  const requestedView = process.env.PALCM_CAPTURE_VIEW;
  const selectedViews = requestedView
    ? manualViews.filter((view) => view.name === requestedView)
    : manualViews;
  if (requestedView && selectedViews.length === 0) {
    throw new Error(`Unknown manual capture view: ${requestedView}`);
  }
  mkdirSync(manualOutputDir, { recursive: true });
  window.setSize(1440, 900);
  await wait(400);

  for (const view of selectedViews) {
    await writeManualScreenshot(window, manualOutputDir, view);
  }

  if (requestedView) {
    return;
  }

  await ensureServerRunning(window);
  try {
    window.webContents.reload();
    await waitForSelector(window, '.sidebar__link[data-nav="home"]');
    await waitForEnabledNavigation(window, 'admin');
    for (const view of manualRuntimeViews) {
      await writeManualScreenshot(window, manualOutputDir, view);
    }
  } finally {
    await ensureServerStopped(window);
  }
}

async function main() {
  mkdirSync(outputDir, { recursive: true });
  const captureProfile = join(process.cwd(), '.tmp-tests', `electron-capture-${String(process.pid)}-${String(Date.now())}`);
  const captureSession = join(captureProfile, 'session');
  mkdirSync(captureSession, { recursive: true });
  app.setPath('userData', captureProfile);
  app.setPath('sessionData', captureSession);
  app.setPath('cache', join(captureProfile, 'cache'));
  process.env.PALCM_RUNTIME_ENV = process.env.PALCM_RUNTIME_ENV || 'development';
  process.env.PALCM_ELECTRON_IS_PACKAGED = 'false';
  process.env.PALCM_ELECTRON_EXE_PATH = app.getPath('exe');

  const nestContext = await createNestContext();
  registerIpcHandlers(ipcMain, nestContext);

  await app.whenReady();
  const initial = viewports[0];
  const window = new BrowserWindow(createMainWindowOptions(initial));
  await window.loadFile(join(process.cwd(), 'dist', 'renderer', 'index.html'));
  await waitForSelector(window, '.sidebar__link[data-nav="home"]');
  await wait(1000);

  if (process.env.PALCM_CAPTURE_MODE === 'manual') {
    await captureManualScreenshots(window);
  } else {
    for (const viewport of viewports) {
      for (const view of views) {
        await capture(window, viewport, view);
      }
    }
  }

  await nestContext.close();
  window.destroy();
  app.quit();
}

main().catch((error) => {
  console.error(error);
  app.quit();
  process.exitCode = 1;
});
