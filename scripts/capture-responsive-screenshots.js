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
  { name: 'configuracion-resumen', nav: 'settings' }
];
const manualViews = [
  { name: 'general', selector: '.sidebar__link[data-nav="home"]', waitMs: 1200 },
  { name: 'servidor', selector: '.sidebar__link[data-nav="server"]', waitMs: 1200 },
  { name: 'red-firewall', selector: '.sidebar__link[data-nav="network"]', waitMs: 5500 },
  { name: 'backups', selector: '.sidebar__link[data-nav="backups"]', waitMs: 1200 },
  { name: 'logs', selector: '.sidebar__link[data-nav="logs"]', waitMs: 900, fixtureLogs: true },
  { name: 'configuracion-resumen', selector: '[data-settings-sidebar-tab="summary"]', waitMs: 1200 },
  { name: 'configuracion-aplicacion', selector: '[data-settings-sidebar-tab="application"]', waitMs: 1200 },
  { name: 'configuracion-automatizaciones', selector: '[data-settings-sidebar-tab="automation"]', waitMs: 1200 }
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

async function captureManualScreenshots(window) {
  const manualOutputDir = join(process.cwd(), 'resources', 'screenshots');
  mkdirSync(manualOutputDir, { recursive: true });
  window.setSize(1440, 900);
  await wait(400);

  for (const view of manualViews) {
    await openManualView(window, view);
    await applySafeDocumentationData(window, Boolean(view.fixtureLogs));
    await wait(250);
    const image = await window.webContents.capturePage();
    writeFileSync(join(manualOutputDir, `${view.name}.png`), image.toPNG());
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
