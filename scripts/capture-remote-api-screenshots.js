const { app, BrowserWindow } = require('electron');
const { createServer } = require('node:http');
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { join, extname } = require('node:path');

const apiRoot = '/api/v1';
const outputDir = join(process.cwd(), 'resources', 'screenshots');
const webRoot = join(process.cwd(), 'resources', 'remote-api-web');
const logoPath = join(process.cwd(), 'src', 'renderer', 'assets', 'palcm-logo.png');
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const sessions = new Map();
let serverRunning = true;

function sendJson(response, status, value) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  response.end(JSON.stringify(value));
}

function sendAsset(response, path) {
  const extension = extname(path);
  const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.png': 'image/png'
  };
  response.writeHead(200, {
    'content-type': contentTypes[extension] || 'application/octet-stream',
    'cache-control': 'no-store'
  });
  response.end(readFileSync(path));
}

async function readBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += String(chunk);
  }
  return body ? JSON.parse(body) : {};
}

function getSession(request) {
  const header = request.headers.authorization || '';
  return sessions.get(header.replace(/^Bearer\s+/i, ''));
}

function createStatus() {
  return {
    application: {
      status: 'READY',
      portableRoot: 'D:\\PSM Console'
    },
    server: {
      state: serverRunning ? 'RUNNING' : 'STOPPED',
      message: serverRunning ? 'Servidor activo y disponible.' : 'Servidor listo para iniciar.'
    },
    actions: {
      canStartServer: !serverRunning,
      canStopServer: serverRunning
    }
  };
}

function createFixtureServer() {
  return createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');

    if (url.pathname === apiRoot) {
      response.writeHead(302, { location: `${apiRoot}/` });
      response.end();
      return;
    }
    if (url.pathname === `${apiRoot}/`) {
      sendAsset(response, join(webRoot, 'index.html'));
      return;
    }
    if (url.pathname === `${apiRoot}/ui.css`) {
      sendAsset(response, join(webRoot, 'ui.css'));
      return;
    }
    if (url.pathname === `${apiRoot}/ui.js`) {
      sendAsset(response, join(webRoot, 'ui.js'));
      return;
    }
    if (url.pathname === `${apiRoot}/logo.png`) {
      sendAsset(response, logoPath);
      return;
    }
    if (url.pathname === `${apiRoot}/auth/login` && request.method === 'POST') {
      const body = await readBody(request);
      const profile = body.username === 'cliente' ? 'CLIENT' : 'ADMIN';
      const token = `documentation-${profile.toLowerCase()}`;
      const permissions = profile === 'ADMIN'
        ? ['GENERAL', 'SERVER_START', 'SERVER_RESTART', 'SERVER_STOP', 'PLAYERS_VIEW', 'PLAYERS_KICK', 'PLAYERS_BAN', 'LOGS']
        : ['GENERAL', 'SERVER_START', 'SERVER_STOP', 'PLAYERS_VIEW', 'LOGS'];
      const session = { token, profile, permissions, expiresAt: null };
      sessions.set(token, session);
      sendJson(response, 200, session);
      return;
    }

    const session = getSession(request);
    if (!session) {
      sendJson(response, 401, { error: 'REMOTE_API_AUTHENTICATION_REQUIRED' });
      return;
    }
    if (url.pathname === `${apiRoot}/session`) {
      sendJson(response, 200, session);
      return;
    }
    if (url.pathname === `${apiRoot}/status`) {
      sendJson(response, 200, createStatus());
      return;
    }
    if (url.pathname === `${apiRoot}/players`) {
      sendJson(response, 200, {
        currentPlayers: 1,
        maxPlayers: 32,
        players: [{
          name: 'Jugador de ejemplo',
          steamId: 'steam_00000000000000001',
          userId: 'steam_00000000000000001',
          playerId: '00000000000000000000000000000001',
          ping: 24.3,
          locationX: 305821,
          locationY: 230422
        }]
      });
      return;
    }
    if (url.pathname === `${apiRoot}/logs`) {
      sendJson(response, 200, {
        entries: [{
          name: 'Actividad actual',
          lines: [
            '[2026-07-30 12:10:02] [INFO] [app] PSM Console iniciado.',
            '[2026-07-30 12:10:03] [INFO] [server] Servidor en ejecución. PID 12345.',
            '[2026-07-30 12:10:04] [INFO] [network] LAN disponible: 192.0.2.100:8211.',
            '[2026-07-30 12:10:05] [INFO] [network] IP pública detectada: 203.0.113.25.'
          ]
        }]
      });
      return;
    }
    if (url.pathname.startsWith(`${apiRoot}/server/`) && request.method === 'POST') {
      serverRunning = !url.pathname.endsWith('/stop');
      sendJson(response, 202, { accepted: true });
      return;
    }
    if (url.pathname === `${apiRoot}/admin/actions` && request.method === 'POST') {
      sendJson(response, 200, { success: true });
      return;
    }

    sendJson(response, 404, { error: 'NOT_FOUND' });
  });
}

async function waitForSelector(window, selector, timeoutMs = 15_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const found = await window.webContents.executeJavaScript(
      `Boolean(document.querySelector(${JSON.stringify(selector)}))`
    );
    if (found) {
      return;
    }
    await wait(150);
  }
  throw new Error(`Selector not found: ${selector}`);
}

async function capture(window, filename) {
  await wait(350);
  const image = await window.webContents.capturePage();
  writeFileSync(join(outputDir, filename), image.toPNG());
}

async function login(window, username) {
  await window.webContents.executeJavaScript(`
    (() => {
      document.querySelector('#username').value = ${JSON.stringify(username)};
      document.querySelector('#password').value = 'ejemplo-seguro';
      document.querySelector('#login-form').requestSubmit();
    })()
  `);
  await waitForSelector(window, '#dashboard-view:not([hidden])');
  await wait(650);
}

async function logout(window) {
  await window.webContents.executeJavaScript(`document.querySelector('#logout-button')?.click()`);
  await waitForSelector(window, '#login-view:not([hidden])');
}

async function main() {
  app.disableHardwareAcceleration();
  mkdirSync(outputDir, { recursive: true });
  const fixtureServer = createFixtureServer();
  await new Promise((resolve) => fixtureServer.listen(0, '127.0.0.1', resolve));
  const address = fixtureServer.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${String(port)}${apiRoot}/`;

  await app.whenReady();
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true
    }
  });

  try {
    await window.loadURL(baseUrl);
    await waitForSelector(window, '#login-form');
    await capture(window, 'api-web-login.png');

    await login(window, 'admin');
    await capture(window, 'api-web-administrativa.png');

    await logout(window);
    await login(window, 'cliente');
    await capture(window, 'api-web-cliente.png');

    window.setSize(390, 844);
    await wait(500);
    await window.webContents.executeJavaScript(`
      document.querySelector('[data-view="players"]')?.click()
    `);
    await wait(450);
    await capture(window, 'api-web-cliente-movil.png');
  } finally {
    window.destroy();
    await new Promise((resolve) => fixtureServer.close(resolve));
    app.quit();
  }
}

main().catch((error) => {
  console.error(error);
  app.quit();
  process.exitCode = 1;
});
