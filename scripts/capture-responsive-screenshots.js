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
  { name: 'logs', nav: 'logs' }
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
  await window.webContents.executeJavaScript(`
    (() => {
      const link = document.querySelector('.sidebar__link[data-nav="${nav}"]');
      if (!link || link.getAttribute('aria-disabled') === 'true') return false;
      link.click();
      return true;
    })()
  `);
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

async function main() {
  mkdirSync(outputDir, { recursive: true });
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

  for (const viewport of viewports) {
    for (const view of views) {
      await capture(window, viewport, view);
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
