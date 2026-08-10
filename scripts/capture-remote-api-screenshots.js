const { app, BrowserWindow } = require('electron');
const { createServer } = require('node:http');
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { join, extname } = require('node:path');

const apiRoot = '/api/v1';
const outputDir = join(process.cwd(), 'resources', 'screenshots');
const webRoot = join(process.cwd(), 'resources', 'remote-api-web');
const logoPath = join(process.cwd(), 'src', 'renderer', 'assets', 'palcm-logo.png');
const worldMapPath = join(process.cwd(), 'src', 'renderer', 'assets', 'palworld-world-map-1.0.webp');
const treeMapPath = join(process.cwd(), 'src', 'renderer', 'assets', 'palworld-tree-map-1.0.webp');
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
    '.png': 'image/png',
    '.webp': 'image/webp'
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
    if (url.pathname === `${apiRoot}/map/world.webp`) {
      sendAsset(response, worldMapPath);
      return;
    }
    if (url.pathname === `${apiRoot}/map/tree.webp`) {
      sendAsset(response, treeMapPath);
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
    if (url.pathname === `${apiRoot}/steamcmd`) {
      sendJson(response, 200, {
        status: 'READY',
        message: 'SteamCMD instalado y listo.',
        executablePath: 'D:\\PSM Console\\tools\\steamcmd\\steamcmd.exe'
      });
      return;
    }
    if (url.pathname === `${apiRoot}/installation`) {
      sendJson(response, 200, {
        status: 'READY',
        message: 'Palworld Dedicated Server instalado.',
        executablePath: 'D:\\PSM Console\\server\\palworld\\PalServer.exe'
      });
      return;
    }
    if (url.pathname === `${apiRoot}/installation/update`) {
      sendJson(response, 200, {
        status: 'UP_TO_DATE',
        message: 'El servidor esta actualizado.',
        localBuildId: '2466863'
      });
      return;
    }
    if (url.pathname === `${apiRoot}/configuration`) {
      sendJson(response, 200, {
        content: '[/Script/Pal.PalGameWorldSettings]\nOptionSettings=(ServerName="Servidor de ejemplo",ServerPlayerMaxNum=12,PublicPort=8211)'
      });
      return;
    }
    if (url.pathname === `${apiRoot}/admin`) {
      sendJson(response, 200, {
        status: 'READY',
        message: 'Administracion REST disponible.',
        info: { version: 'v1.0.2', servername: 'Servidor de ejemplo', worldguid: 'EXAMPLE-WORLD' },
        metrics: { currentplayernum: 1, serverfps: 60, serverfpsaverage: 59.8 },
        settings: { Difficulty: 'Normal', ServerPlayerMaxNum: 12 }
      });
      return;
    }
    if (url.pathname === `${apiRoot}/firewall`) {
      sendJson(response, 200, {
        local: {
          ports: [{ label: 'Jugadores', protocol: 'UDP', port: 8211, state: 'READY', message: 'Regla de Windows disponible.' }]
        }
      });
      return;
    }
    if (url.pathname === `${apiRoot}/network/addresses`) {
      sendJson(response, 200, { addresses: ['192.0.2.100'] });
      return;
    }
    if (url.pathname === `${apiRoot}/network/public`) {
      sendJson(response, 200, { publicIp: '203.0.113.25', message: 'IP publica de ejemplo.' });
      return;
    }
    if (url.pathname === `${apiRoot}/backups`) {
      sendJson(response, 200, {
        configurationBackups: [], worldBackups: [], message: 'Sin backups de ejemplo.',
        policy: { automaticEnabled: true, automaticIntervalHours: 6, automaticRetentionPerType: 5, compressWorldBackups: true }
      });
      return;
    }
    if (url.pathname === `${apiRoot}/app/settings`) {
      sendJson(response, 200, { portableRoot: 'D:\\PSM Console', settingsRelativePath: 'config/app-settings.json' });
      return;
    }
    if (url.pathname === `${apiRoot}/app/updates`) {
      sendJson(response, 200, { state: 'UP_TO_DATE', message: 'PSM Console esta actualizado.' });
      return;
    }
    if (url.pathname === `${apiRoot}/app/remote-api`) {
      sendJson(response, 200, {
        state: 'RUNNING', endpoint: 'http://192.0.2.100:8213/api/v1',
        settings: { enabled: true, bindMode: 'LOCAL_NETWORK', port: 8213, username: 'admin', client: { enabled: true, username: 'cliente', permissions: ['GENERAL', 'PLAYERS_VIEW', 'LOGS'] } }
      });
      return;
    }
    if (url.pathname === `${apiRoot}/automation/idle`) {
      sendJson(response, 200, { policy: { enabled: false, emptySeconds: 600 } });
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
    if (url.pathname === `${apiRoot}/map`) {
      sendJson(response, 200, {
        status: 'READY',
        message: 'Un jugador conectado.',
        updatedAt: new Date().toISOString(),
        layers: [
          {
            id: 'world',
            label: 'Palpagos',
            imageUrl: `${apiRoot}/map/world.webp`,
            imageWidth: 8192,
            imageHeight: 8192,
            imageToWorld: { a: 0.375711236, b: -0.0156508073, c: -1823.80271, d: -0.00463658188, e: -0.385279301, f: 1056.84169 },
            bounds: { minX: -1952.01, maxX: 1253.83, minY: -2137.25, maxY: 1056.84 }
          },
          {
            id: 'tree',
            label: 'Arbol del Mundo',
            imageUrl: `${apiRoot}/map/tree.webp`,
            imageWidth: 8192,
            imageHeight: 8192,
            imageToWorld: { a: 0.0862548982233, b: 0.00221230612851, c: -2123.2121, d: -0.0005399869936045, e: -0.08862828935115, f: 1769.06075 },
            bounds: { minX: -2123.21, maxX: -1398.52, minY: 1038.64, maxY: 1769.06 }
          }
        ],
        players: [{
          key: 'steam_00000000000000001',
          name: 'Jugador de ejemplo',
          mapId: 'world',
          left: '59.25',
          top: '43.80'
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
    if (url.pathname === `${apiRoot}/logs/files`) {
      sendJson(response, 200, { files: [] });
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

async function capture(window, filename, expectedView) {
  await wait(350);
  if (expectedView) {
    await assertWebView(window, expectedView);
  }
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

async function selectWebView(window, view) {
  const state = await window.webContents.executeJavaScript(`
    (() => {
      const button = document.querySelector('.nav-button[data-view="${view}"]');
      button?.click();
      return {
        active: document.querySelector('.nav-button.active')?.dataset.view,
        visible: document.querySelector('[data-content-view]:not([hidden])')?.dataset.contentView
      };
    })()
  `);
  if (state.active !== view || state.visible !== view) {
    throw new Error(`No se pudo abrir la vista ${view}: ${JSON.stringify(state)}`);
  }
}

async function assertWebView(window, view) {
  const state = await window.webContents.executeJavaScript(`
    (() => ({
      active: document.querySelector('.nav-button.active')?.dataset.view,
      displayed: Array.from(document.querySelectorAll('[data-content-view]'))
        .filter((element) => getComputedStyle(element).display !== 'none')
        .map((element) => element.dataset.contentView)
    }))()
  `);
  if (state.active !== view || state.displayed.length !== 1 || state.displayed[0] !== view) {
    throw new Error(`Vista inconsistente ${view}: ${JSON.stringify(state)}`);
  }
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

    await selectWebView(window, 'server');
    await wait(500);
    await capture(window, 'api-web-administrativa-servidor.png', 'server');

    await logout(window);
    await login(window, 'cliente');
    await capture(window, 'api-web-cliente.png');

    await selectWebView(window, 'map');
    await waitForSelector(window, '#map-view:not([hidden])');
    await wait(700);
    await assertWebView(window, 'map');
    await capture(window, 'api-web-mapa.png', 'map');

    window.setSize(390, 844);
    await wait(500);
    await assertWebView(window, 'map');
    await capture(window, 'api-web-mapa-movil.png', 'map');

    await selectWebView(window, 'players');
    await wait(450);
    await assertWebView(window, 'players');
    await capture(window, 'api-web-cliente-movil.png', 'players');
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
