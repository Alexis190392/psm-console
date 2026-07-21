const { app, BrowserWindow, ipcMain } = require('electron');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const { createNestContext } = require('../dist/main/bootstrap/nest-bootstrap');
const { registerIpcHandlers } = require('../dist/main/ipc/register-ipc-handlers');
const { createMainWindowOptions } = require('../dist/main/electron/window-options');

const outputDir = join(process.cwd(), 'docs', 'implementation', 'current-screenshots');

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
    await wait(250);
  }
  throw new Error(`Selector not found: ${selector}`);
}

async function waitForReady(window) {
  await waitForSelector(window, '.sidebar__link[data-nav="home"]');
  await wait(1500);
}

async function capture(window, name) {
  await wait(600);
  const image = await window.webContents.capturePage();
  writeFileSync(join(outputDir, `${name}.png`), image.toPNG());
}

async function clickNav(window, nav) {
  await window.webContents.executeJavaScript(`
    (() => {
      const link = document.querySelector('.sidebar__link[data-nav="${nav}"]');
      if (!link) return false;
      link.click();
      return true;
    })()
  `);
  await wait(1200);
}

async function waitForEnabledNav(window, nav, timeoutMs = 20000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const enabled = await window.webContents.executeJavaScript(`
      (() => {
        const link = document.querySelector('.sidebar__link[data-nav="${nav}"]');
        return Boolean(link && !link.classList.contains('hidden') && link.getAttribute('aria-disabled') !== 'true');
      })()
    `);
    if (enabled) {
      return true;
    }
    await wait(500);
  }

  return false;
}

async function clickAdminTab(window, tab) {
  await window.webContents.executeJavaScript(`
    (() => {
      const button = document.querySelector('[data-admin-tab-button="${tab}"]');
      if (!button) return false;
      button.click();
      return true;
    })()
  `);
  await wait(1200);
}

async function ensureServerStopped(window) {
  await window.webContents.executeJavaScript(`
    window.palcm?.server?.stop?.({ confirmed: true }).catch(() => undefined)
  `);
  await wait(2500);
}

async function ensureServerRunning(window) {
  const runtime = await window.webContents.executeJavaScript(`
    window.palcm?.server?.getRuntimeStatus?.().catch(() => null)
  `);
  if (runtime?.state === 'RUNNING') {
    return true;
  }

  const accepted = await window.webContents.executeJavaScript(`
    window.palcm?.server?.start?.({ confirmed: true }).catch((error) => ({ error: String(error?.message ?? error) }))
  `);

  if (accepted?.error) {
    return false;
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < 30000) {
    const current = await window.webContents.executeJavaScript(`
      window.palcm?.server?.getRuntimeStatus?.().catch(() => null)
    `);
    if (current?.state === 'RUNNING') {
      return true;
    }
    await wait(1000);
  }

  return false;
}

async function main() {
  mkdirSync(outputDir, { recursive: true });
  process.env.PALCM_RUNTIME_ENV = process.env.PALCM_RUNTIME_ENV || 'development';
  process.env.PALCM_ELECTRON_IS_PACKAGED = 'false';
  process.env.PALCM_ELECTRON_EXE_PATH = app.getPath('exe');

  const nestContext = await createNestContext();
  registerIpcHandlers(ipcMain, nestContext);

  await app.whenReady();
  const window = new BrowserWindow(createMainWindowOptions({ width: 1440, height: 900 }));
  await window.loadFile(join(process.cwd(), 'dist', 'renderer', 'index.html'));
  await waitForReady(window);

  await capture(window, '01-general');

  await clickNav(window, 'server');
  await capture(window, '02-servidor');

  await clickNav(window, 'network');
  await capture(window, '03-red-firewall');

  await clickNav(window, 'backups');
  await capture(window, '04-backups');

  await clickNav(window, 'logs');
  await capture(window, '05-logs');

  const serverRunning = await ensureServerRunning(window);
  if (serverRunning) {
    window.webContents.reload();
    await waitForReady(window);
    await waitForEnabledNav(window, 'admin');
  }
  await clickNav(window, 'home');
  await capture(window, serverRunning ? '06-general-servidor-activo' : '06-general-sin-servidor-activo');

  if (serverRunning) {
    await waitForEnabledNav(window, 'admin');
    await clickNav(window, 'admin');
    await capture(window, '07-administracion-general');
    await clickAdminTab(window, 'players');
    await capture(window, '08-administracion-jugadores');
    await ensureServerStopped(window);
    await clickNav(window, 'logs');
    await capture(window, '09-logs-final');
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
