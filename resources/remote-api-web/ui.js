(function () {
  'use strict';

  var API_ROOT = '/api/v1';
  var TOKEN_KEY = 'psm-console-api-token';
  var refreshTimer = null;
  var toastTimer = null;
  var permissionReloadTimer = null;
  var access = {
    profile: 'ADMIN',
    permissions: [
      'GENERAL',
      'SERVER_START',
      'SERVER_RESTART',
      'SERVER_STOP',
      'PLAYERS_VIEW',
      'PLAYERS_KICK',
      'PLAYERS_BAN',
      'LOGS'
    ]
  };
  var mapData = null;
  var activeMapLayer = 'world';
  var mapZoom = 1;
  var mapDrag = null;
  var mapImageCache = {};
  var mapViewStates = {
    world: { zoom: 1, scrollX: 0, scrollY: 0 },
    tree: { zoom: 1, scrollX: 0, scrollY: 0 }
  };
  var activeView = 'general';
  var configurationSchema = null;
  var configurationDraftValues = {};

  var loginView = document.getElementById('login-view');
  var dashboardView = document.getElementById('dashboard-view');
  var loginForm = document.getElementById('login-form');
  var loginButton = document.getElementById('login-button');
  var loginError = document.getElementById('login-error');
  var passwordInput = document.getElementById('password');
  var connectionState = document.getElementById('connection-state');
  var connectionLabel = document.getElementById('connection-label');
  var operationMessage = document.getElementById('operation-message');
  var toast = document.getElementById('toast');

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY) || '';
  }

  async function apiRequest(path, options) {
    var requestOptions = options || {};
    var headers = new Headers(requestOptions.headers || {});
    var token = getToken();
    if (token) {
      headers.set('authorization', 'Bearer ' + token);
    }
    if (requestOptions.body && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }

    var response = await fetch(API_ROOT + path, {
      method: requestOptions.method || 'GET',
      headers: headers,
      body: requestOptions.body
    });
    var payload = await response.json().catch(function () {
      return {};
    });

    if (response.status === 401 && path !== '/auth/login') {
      showLogin('La sesion finalizo. Ingresa nuevamente.');
      throw new Error('AUTHENTICATION_REQUIRED');
    }
    if (response.status === 403) {
      if (permissionReloadTimer === null) {
        permissionReloadTimer = setTimeout(function () {
          window.location.reload();
        }, 1_000);
      }
      throw new Error('No permitido');
    }
    if (!response.ok) {
      throw new Error(getErrorLabel(payload.message || payload.error));
    }
    return payload;
  }

  function getErrorLabel(code) {
    var labels = {
      REMOTE_API_INVALID_CREDENTIALS: 'Usuario o contraseña incorrectos.',
      REMOTE_API_LOGIN_TEMPORARILY_LOCKED: 'Demasiados intentos. Espera unos segundos.',
      SERVER_ALREADY_RUNNING: 'El servidor ya está ejecutándose.',
      SERVER_ALREADY_STOPPED: 'El servidor ya está detenido.',
      INTERNAL_SERVER_ERROR: 'La operación no pudo completarse.'
    };
    return labels[code] || String(code || 'La operación no pudo completarse.');
  }

  function showLogin(message) {
    sessionStorage.removeItem(TOKEN_KEY);
    clearInterval(refreshTimer);
    refreshTimer = null;
    releaseWebMapImagesExcept(null);
    mapData = null;
    loginView.hidden = false;
    dashboardView.hidden = true;
    connectionState.hidden = true;
    if (message) {
      loginError.textContent = message;
      loginError.hidden = false;
    }
    document.getElementById('username').focus();
  }

  function showDashboard() {
    loginView.hidden = true;
    dashboardView.hidden = false;
    connectionState.hidden = false;
    connectionLabel.textContent = 'Conectado';
    loginError.hidden = true;
    startRefreshTimer();
  }

  function hasPermission(permission) {
    return access.profile === 'ADMIN' || access.permissions.includes(permission);
  }

  function applyAccess(session) {
    access = {
      profile: session.profile || 'CLIENT',
      permissions: Array.isArray(session.permissions) ? session.permissions : []
    };
    document.getElementById('access-profile-label').textContent = access.profile === 'CLIENT'
      ? 'Acceso cliente'
      : 'Administración web';
    document.querySelectorAll('[data-permission]').forEach(function (element) {
      element.hidden = !hasPermission(element.dataset.permission);
    });
    document.querySelectorAll('[data-permission-any]').forEach(function (element) {
      var permissions = (element.dataset.permissionAny || '').split(',');
      element.hidden = !permissions.some(hasPermission);
    });
    document.querySelectorAll('[data-admin-only]').forEach(function (element) {
      if (element.hasAttribute('data-content-view')) {
        return;
      }
      element.hidden = access.profile !== 'ADMIN';
    });
    var visibleNavigation = Array.from(document.querySelectorAll('.nav-button')).filter(function (button) {
      return !button.hidden;
    });
    var activeNavigation = document.querySelector('.nav-button[data-view="' + activeView + '"]');
    if ((!activeNavigation || activeNavigation.hidden) && visibleNavigation[0]) {
      selectView(visibleNavigation[0].dataset.view);
      return true;
    }
    return false;
  }

  function startRefreshTimer() {
    clearInterval(refreshTimer);
    refreshTimer = setInterval(function () {
      void refreshSessionAndVisibleView();
    }, 4000);
  }

  async function refreshSessionAndVisibleView() {
    try {
      var session = await apiRequest('/session');
      var viewChanged = applyAccess(session);
      if (!viewChanged) {
        await refreshVisibleView(false);
      }
    } catch (error) {
      if (error.message !== 'AUTHENTICATION_REQUIRED') {
        showToast(error.message);
      }
    }
  }

  async function login(event) {
    event.preventDefault();
    loginError.hidden = true;
    loginButton.disabled = true;
    loginButton.firstElementChild.textContent = 'Ingresando...';

    try {
      var result = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          username: document.getElementById('username').value,
          password: passwordInput.value
        })
      });
      sessionStorage.setItem(TOKEN_KEY, result.token);
      applyAccess(result);
      passwordInput.value = '';
      showDashboard();
      await refreshAll();
    } catch (error) {
      if (error.message !== 'AUTHENTICATION_REQUIRED') {
        loginError.textContent = error.message;
        loginError.hidden = false;
      }
    } finally {
      loginButton.disabled = false;
      loginButton.firstElementChild.textContent = 'Ingresar';
    }
  }

  async function logout() {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch {
      // La sesion local se elimina aunque el servidor ya no la reconozca.
    }
    showLogin();
  }

  function setText(id, value) {
    document.getElementById(id).textContent = value;
  }

  function formatState(value) {
    var labels = {
      READY: 'Listo',
      RUNNING: 'Ejecutándose',
      STARTING: 'Iniciando',
      STOPPING: 'Deteniendo',
      STOPPED: 'Detenido',
      ERROR: 'Revisar logs',
      BOOTSTRAPPING: 'Preparando entorno'
    };
    return labels[value] || String(value || 'Sin datos').replaceAll('_', ' ');
  }

  async function refreshStatus() {
    var result = await apiRequest('/status');
    setText('application-status', formatState(result.application && result.application.status));
    setText('application-message', result.application && result.application.portableRoot
      ? 'Entorno: ' + result.application.portableRoot
      : 'Estado actualizado.');
    setText('server-status', formatState(result.server && result.server.state));
    setText('server-message', result.server && result.server.message ? result.server.message : 'Sin detalles.');

    var running = result.server && (result.server.state === 'RUNNING' || result.server.state === 'STARTING');
    var stopping = result.server && result.server.state === 'STOPPING';
    document.getElementById('start-button').disabled = running || stopping || !result.actions.canStartServer;
    document.getElementById('restart-button').disabled = !running || stopping;
    document.getElementById('stop-button').disabled = !running || stopping || !result.actions.canStopServer;
    return result;
  }

  async function refreshPlayers() {
    var result = await apiRequest('/players');
    setText('player-count', String(result.currentPlayers || 0) + '/' + String(result.maxPlayers || '--'));
    renderPlayers(result.players || [], result.message);
  }

  async function refreshMap() {
    mapData = await apiRequest('/map');
    renderWebMap();
  }

  function renderWebMap() {
    var viewport = document.getElementById('web-map-viewport');
    var stage = document.getElementById('web-map-stage');
    if (!viewport || !stage || !mapData) {
      return;
    }
    var layer = getActiveMapLayer();
    if (!layer) {
      return;
    }
    var requiresMapLayout = stage.dataset.mapLayer !== layer.id || !stage.dataset.baseWidth;
    stage.dataset.mapLayer = layer.id;
    if (requiresMapLayout) {
      stage.removeAttribute('data-base-width');
      stage.removeAttribute('data-base-height');
      sizeWebMapStage(true);
      drawWebMapCanvas(layer);
      restoreWebMapPosition();
    }
    renderWebMapMarkers();
  }

  function getActiveMapLayer() {
    return mapData && Array.isArray(mapData.layers)
      ? mapData.layers.find(function (layer) { return layer.id === activeMapLayer; })
      : null;
  }

  function sizeWebMapStage(recalculateBase) {
    var viewport = document.getElementById('web-map-viewport');
    var stage = document.getElementById('web-map-stage');
    var layer = getActiveMapLayer();
    if (!viewport || !stage || !layer || viewport.clientWidth <= 0 || viewport.clientHeight <= 0) {
      return;
    }
    var baseWidth = Number(stage.dataset.baseWidth);
    var baseHeight = Number(stage.dataset.baseHeight);
    if (recalculateBase || !Number.isFinite(baseWidth) || !Number.isFinite(baseHeight)) {
      var worldWidth = layer.bounds.maxX - layer.bounds.minX;
      var worldHeight = layer.bounds.maxY - layer.bounds.minY;
      var mapRatio = worldWidth / worldHeight;
      var viewportRatio = viewport.clientWidth / viewport.clientHeight;
      baseWidth = viewportRatio >= mapRatio ? viewport.clientWidth : viewport.clientHeight * mapRatio;
      baseHeight = viewportRatio >= mapRatio ? viewport.clientWidth / mapRatio : viewport.clientHeight;
      stage.dataset.baseWidth = String(baseWidth);
      stage.dataset.baseHeight = String(baseHeight);
    }
    stage.style.width = String(baseWidth * mapZoom) + 'px';
    stage.style.height = String(baseHeight * mapZoom) + 'px';
  }

  function drawWebMapCanvas(layer) {
    var stage = document.getElementById('web-map-stage');
    var canvas = document.getElementById('web-map-canvas');
    if (!stage || !canvas) {
      return;
    }
    var baseWidth = Number(stage.dataset.baseWidth) || 1;
    var baseHeight = Number(stage.dataset.baseHeight) || 1;
    var ratio = Math.min(Math.max(window.devicePixelRatio || 1, 1), 1.25);
    var reduction = Math.min(1, 2048 / (baseWidth * ratio), 2048 / (baseHeight * ratio));
    var width = Math.max(1, Math.round(baseWidth * ratio * reduction));
    var height = Math.max(1, Math.round(baseHeight * ratio * reduction));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    var context = canvas.getContext('2d');
    if (!context) {
      return;
    }
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#071015';
    context.fillRect(0, 0, width, height);
    var image = getWebMapImage(layer.imageUrl, function () {
      if (activeMapLayer === layer.id) {
        drawWebMapCanvas(layer);
      }
    });
    if (!image.complete || image.naturalWidth === 0) {
      return;
    }
    var worldWidth = layer.bounds.maxX - layer.bounds.minX;
    var worldHeight = layer.bounds.maxY - layer.bounds.minY;
    var scaleX = width / worldWidth;
    var scaleY = height / worldHeight;
    var transform = layer.imageToWorld;
    context.save();
    context.setTransform(
      scaleX * transform.a,
      -scaleY * transform.d,
      scaleX * transform.b,
      -scaleY * transform.e,
      scaleX * (transform.c - layer.bounds.minX),
      scaleY * (layer.bounds.maxY - transform.f)
    );
    context.drawImage(image, 0, 0, layer.imageWidth, layer.imageHeight);
    context.restore();
  }

  function getWebMapImage(url, onLoad) {
    if (mapImageCache[url]) {
      return mapImageCache[url];
    }
    var image = new Image();
    image.decoding = 'async';
    image.addEventListener('load', onLoad, { once: true });
    image.src = url;
    mapImageCache[url] = image;
    return image;
  }

  function releaseWebMapImagesExcept(activeUrl) {
    Object.keys(mapImageCache).forEach(function (url) {
      if (url === activeUrl) {
        return;
      }
      mapImageCache[url].src = '';
      delete mapImageCache[url];
    });
  }

  function renderWebMapMarkers() {
    var markerLayer = document.getElementById('web-map-markers');
    var empty = document.getElementById('web-map-empty');
    if (!markerLayer || !empty || !mapData) {
      return;
    }
    var players = (mapData.players || []).filter(function (player) {
      return player.mapId === activeMapLayer;
    });
    markerLayer.replaceChildren();
    players.forEach(function (player) {
      var marker = document.createElement('article');
      marker.className = 'web-map-marker';
      marker.style.left = player.left + '%';
      marker.style.top = player.top + '%';
      marker.title = player.name;
      var pin = document.createElement('span');
      pin.className = 'web-map-marker__pin';
      pin.textContent = getPlayerInitials(player.name);
      var label = document.createElement('span');
      label.className = 'web-map-marker__label';
      label.textContent = player.name || 'Jugador';
      marker.append(pin, label);
      markerLayer.appendChild(marker);
    });
    empty.hidden = players.length > 0;
    empty.textContent = mapData.status === 'READY'
      ? 'No hay jugadores conectados en este mapa.'
      : mapData.message || 'Esperando posiciones de jugadores.';
  }

  function getPlayerInitials(name) {
    var initials = String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(function (word) {
      return word.charAt(0).toUpperCase();
    }).join('');
    return initials || 'J';
  }

  function saveWebMapPosition() {
    var viewport = document.getElementById('web-map-viewport');
    if (!viewport) {
      return;
    }
    var maxX = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    var maxY = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    mapViewStates[activeMapLayer] = {
      zoom: mapZoom,
      scrollX: maxX > 0 ? viewport.scrollLeft / maxX : 0,
      scrollY: maxY > 0 ? viewport.scrollTop / maxY : 0
    };
  }

  function restoreWebMapPosition() {
    var viewport = document.getElementById('web-map-viewport');
    if (!viewport) {
      return;
    }
    var state = mapViewStates[activeMapLayer];
    requestAnimationFrame(function () {
      viewport.scrollLeft = state.scrollX * Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      viewport.scrollTop = state.scrollY * Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    });
  }

  function selectMapLayer(mapId) {
    if (mapId === activeMapLayer) {
      return;
    }
    saveWebMapPosition();
    activeMapLayer = mapId;
    mapZoom = mapViewStates[mapId].zoom;
    var nextLayer = getActiveMapLayer();
    releaseWebMapImagesExcept(nextLayer ? nextLayer.imageUrl : null);
    var stage = document.getElementById('web-map-stage');
    if (stage) {
      stage.removeAttribute('data-base-width');
      stage.removeAttribute('data-base-height');
    }
    document.querySelectorAll('[data-map-layer]').forEach(function (button) {
      var selected = button.dataset.mapLayer === mapId;
      button.classList.toggle('web-map-tab--active', selected);
      button.setAttribute('aria-selected', String(selected));
    });
    renderWebMap();
  }

  function bindWebMapControls() {
    var viewport = document.getElementById('web-map-viewport');
    if (!viewport) {
      return;
    }
    document.querySelectorAll('[data-map-layer]').forEach(function (button) {
      button.addEventListener('click', function () {
        selectMapLayer(button.dataset.mapLayer);
      });
    });
    viewport.addEventListener('wheel', function (event) {
      event.preventDefault();
      var nextZoom = Math.min(4, Math.max(1, mapZoom + (event.deltaY < 0 ? 0.25 : -0.25)));
      if (nextZoom === mapZoom) {
        return;
      }
      var bounds = viewport.getBoundingClientRect();
      var pointerX = event.clientX - bounds.left;
      var pointerY = event.clientY - bounds.top;
      var nextLeft = ((viewport.scrollLeft + pointerX) / mapZoom) * nextZoom - pointerX;
      var nextTop = ((viewport.scrollTop + pointerY) / mapZoom) * nextZoom - pointerY;
      mapZoom = nextZoom;
      mapViewStates[activeMapLayer].zoom = nextZoom;
      sizeWebMapStage(false);
      viewport.scrollLeft = nextLeft;
      viewport.scrollTop = nextTop;
      saveWebMapPosition();
    }, { passive: false });
    viewport.addEventListener('pointerdown', function (event) {
      if (event.button !== 0) {
        return;
      }
      mapDrag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        scrollLeft: viewport.scrollLeft,
        scrollTop: viewport.scrollTop
      };
      viewport.setPointerCapture(event.pointerId);
      viewport.classList.add('web-map-viewport--dragging');
    });
    viewport.addEventListener('pointermove', function (event) {
      if (!mapDrag || mapDrag.pointerId !== event.pointerId) {
        return;
      }
      viewport.scrollLeft = mapDrag.scrollLeft - (event.clientX - mapDrag.startX);
      viewport.scrollTop = mapDrag.scrollTop - (event.clientY - mapDrag.startY);
      saveWebMapPosition();
    });
    function stopMapDrag(event) {
      if (!mapDrag || mapDrag.pointerId !== event.pointerId) {
        return;
      }
      mapDrag = null;
      viewport.classList.remove('web-map-viewport--dragging');
      if (viewport.hasPointerCapture(event.pointerId)) {
        viewport.releasePointerCapture(event.pointerId);
      }
    }
    viewport.addEventListener('pointerup', stopMapDrag);
    viewport.addEventListener('pointercancel', stopMapDrag);
    new ResizeObserver(function () {
      if (!document.getElementById('map-view').hidden && mapData) {
        var layer = getActiveMapLayer();
        sizeWebMapStage(true);
        if (layer) {
          drawWebMapCanvas(layer);
        }
      }
    }).observe(viewport);
  }

  function renderPlayers(players, message) {
    var container = document.getElementById('players-list');
    container.replaceChildren();
    if (!players.length) {
      var empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = message || 'No hay jugadores conectados.';
      container.appendChild(empty);
      return;
    }

    players.forEach(function (player) {
      var row = document.createElement('article');
      row.className = 'player-row';

      var identity = document.createElement('div');
      var name = document.createElement('strong');
      name.textContent = player.name || 'Jugador';
      var steam = document.createElement('small');
      steam.textContent = player.steamId || player.userId || 'Identificador no disponible';
      identity.append(name, steam);

      var details = document.createElement('div');
      var playerId = document.createElement('strong');
      playerId.textContent = player.playerId ? 'PlayerUID ' + player.playerId : 'Sesión activa';
      var location = document.createElement('small');
      location.textContent = player.locationX !== undefined && player.locationY !== undefined
        ? 'X ' + Math.round(player.locationX) + ' / Y ' + Math.round(player.locationY)
        : 'Ubicación no disponible';
      details.append(playerId, location);

      var controls = document.createElement('div');
      controls.className = 'player-controls';
      var ping = document.createElement('span');
      ping.className = 'player-ping';
      ping.textContent = player.ping !== undefined ? Math.round(player.ping) + ' ms' : '-- ms';
      controls.appendChild(ping);

      var userId = player.userId || '';
      if (userId && (hasPermission('PLAYERS_KICK') || hasPermission('PLAYERS_BAN'))) {
        var actions = document.createElement('div');
        actions.className = 'player-actions';
        if (hasPermission('PLAYERS_KICK')) {
          actions.appendChild(createPlayerActionButton('Expulsar', 'kick', userId, player.name));
        }
        if (hasPermission('PLAYERS_BAN')) {
          actions.appendChild(createPlayerActionButton('Banear', 'ban', userId, player.name, true));
        }
        controls.appendChild(actions);
      }

      row.append(identity, details, controls);
      container.appendChild(row);
    });
  }

  function createPlayerActionButton(label, action, userId, playerName, dangerous) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = dangerous ? 'player-action player-action--danger' : 'player-action';
    button.textContent = label;
    button.addEventListener('click', function () {
      void executePlayerAction(action, userId, playerName || 'este jugador', button);
    });
    return button;
  }

  async function executePlayerAction(action, userId, playerName, button) {
    var verb = action === 'ban' ? 'banear' : 'expulsar';
    if (!window.confirm('Confirmas ' + verb + ' a ' + playerName + '?')) {
      return;
    }
    button.disabled = true;
    try {
      await apiRequest('/admin/actions', {
        method: 'POST',
        body: JSON.stringify({
          action: action,
          userId: userId,
          message: 'Acción solicitada desde PSM Console Web.'
        })
      });
      showToast(action === 'ban' ? 'Jugador baneado.' : 'Jugador expulsado.');
      await refreshPlayers();
    } catch (error) {
      showToast(error.message);
    } finally {
      button.disabled = false;
    }
  }

  async function refreshLogs() {
    var result = await apiRequest('/logs?maxLines=300');
    var lines = [];
    (result.entries || []).forEach(function (entry) {
      (entry.lines || []).forEach(function (line) {
        lines.push(line);
      });
    });
    var consoleElement = document.getElementById('logs-console');
    consoleElement.textContent = lines.length ? lines.join('\n') : 'No hay actividad registrada en esta instancia.';
    consoleElement.scrollTop = consoleElement.scrollHeight;
    if (access.profile === 'ADMIN') {
      var files = await apiRequest('/logs/files');
      renderLogFiles(files.files || []);
    }
  }

  async function executeAdminAction(action, payload, confirmation) {
    if (confirmation && !window.confirm(confirmation)) {
      return;
    }
    try {
      var result = await apiRequest('/admin/actions', {
        method: 'POST',
        body: JSON.stringify(Object.assign({ action: action }, payload || {}))
      });
      showToast(result.message || 'Accion completada.');
      await refreshAdministration();
    } catch (error) {
      showToast(error.message);
    }
  }

  async function executeInstallationAction(action) {
    if (!window.confirm(action === 'repair'
      ? 'Se validaran y repararan los archivos del servidor. Continuar?'
      : 'Se actualizara el servidor sin modificar el progreso del mundo. Continuar?')) {
      return;
    }
    try {
      var result = await apiRequest('/installation/' + action, { method: 'POST' });
      if (result.operationId) {
        await pollOperation(result.operationId);
      }
      await refreshServerView();
    } catch (error) {
      showToast(error.message);
    }
  }

  async function executeSetupAction(path, confirmation) {
    if (!window.confirm(confirmation)) {
      return;
    }
    try {
      var result = await apiRequest(path, { method: 'POST' });
      if (result.operationId) {
        await pollOperation(result.operationId);
      }
      await refreshServerView();
    } catch (error) {
      showToast(error.message);
    }
  }

  async function executeBackupAction(id, action, name) {
    var labels = { verify: 'verificar', restore: 'restaurar', delete: 'enviar a la papelera' };
    if (!window.confirm('Confirmas ' + labels[action] + ' el backup ' + name + '?')) {
      return;
    }
    try {
      var result = await apiRequest('/backups/' + encodeURIComponent(id) + (action === 'delete' ? '' : '/' + action), {
        method: action === 'delete' ? 'DELETE' : 'POST'
      });
      if (result.operationId) {
        await pollOperation(result.operationId);
      }
      await refreshBackups();
    } catch (error) {
      showToast(error.message);
    }
  }

  function formatBytes(value) {
    var bytes = Number(value || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return '0 B';
    }
    var units = ['B', 'KB', 'MB', 'GB'];
    var index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    return (bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1) + ' ' + units[index];
  }

  function createDataRow(label, value, detail) {
    var item = document.createElement('article');
    item.className = 'remote-data-row';
    var heading = document.createElement('strong');
    heading.textContent = label;
    var content = document.createElement('span');
    content.textContent = value;
    item.append(heading, content);
    if (detail) {
      var small = document.createElement('small');
      small.textContent = detail;
      item.appendChild(small);
    }
    return item;
  }

  async function refreshServerView() {
    var results = await Promise.all([
      apiRequest('/steamcmd'),
      apiRequest('/installation'),
      apiRequest('/installation/update?force=true'),
      apiRequest('/configuration/schema')
    ]);
    var steamcmd = results[0];
    var installation = results[1];
    var update = results[2];
    var configuration = results[3];
    setText('steamcmd-status', formatState(steamcmd.status));
    setText('steamcmd-message', steamcmd.message || 'Sin detalles.');
    setText('installation-status', formatState(installation.status));
    setText('installation-message', installation.message || 'Sin detalles.');
    setText('update-status', formatState(update.status));
    setText('update-message', update.message || 'Sin detalles.');
    var editor = document.getElementById('configuration-content');
    if (!editor.dataset.dirty) {
      loadConfigurationSchema(configuration);
    }
  }

  function loadConfigurationSchema(schema) {
    configurationSchema = schema;
    configurationDraftValues = {};
    (schema.settings || []).forEach(function (setting) {
      configurationDraftValues[setting.key] = unquoteConfigurationValue(setting.value);
    });
    var editor = document.getElementById('configuration-content');
    editor.value = schema.content || '';
    editor.dataset.dirty = '';
    populateConfigurationCategories();
    renderConfigurationPresets();
    renderConfigurationGroups();
    setText('configuration-status', 'Configuracion cargada.');
  }

  function unquoteConfigurationValue(value) {
    var text = String(value || '');
    return text.length >= 2 && text.startsWith('"') && text.endsWith('"')
      ? text.slice(1, -1).replaceAll('\\"', '"')
      : text;
  }

  function quoteConfigurationValue(value, originalValue) {
    var text = String(value ?? '');
    if (String(originalValue || '').startsWith('"') || text.length === 0 || /[\s:/\\]/.test(text)) {
      return '"' + text.replaceAll('"', '\\"') + '"';
    }
    return text;
  }

  function isConfigurationDirty() {
    return document.getElementById('configuration-content').dataset.dirty === 'true';
  }

  function markConfigurationDirty() {
    document.getElementById('configuration-content').dataset.dirty = 'true';
    setText('configuration-status', 'Cambios sin guardar.');
  }

  function syncAdvancedConfiguration() {
    if (!configurationSchema) {
      return;
    }
    var content = (configurationSchema.settings || []).map(function (setting) {
      return setting.key + '=' + quoteConfigurationValue(configurationDraftValues[setting.key], setting.value);
    }).join(',');
    document.getElementById('configuration-content').value = String(configurationSchema.prefix || '') + content + String(configurationSchema.suffix || '');
  }

  function populateConfigurationCategories() {
    if (!configurationSchema) {
      return;
    }
    var select = document.getElementById('configuration-category');
    var current = select.value;
    var categories = Array.from(new Set((configurationSchema.settings || []).map(function (setting) {
      return setting.definition.group;
    })));
    select.replaceChildren(new Option('Todas', ''));
    categories.forEach(function (category) {
      select.add(new Option(category, category));
    });
    select.value = categories.includes(current) ? current : '';
  }

  function renderConfigurationPresets() {
    var container = document.getElementById('configuration-presets');
    container.replaceChildren();
    (configurationSchema && configurationSchema.presets || []).forEach(function (preset) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'choice-chip';
      button.textContent = preset.label;
      button.addEventListener('click', function () {
        Object.keys(preset.values || {}).forEach(function (key) {
          if (Object.prototype.hasOwnProperty.call(configurationDraftValues, key)) {
            configurationDraftValues[key] = String(preset.values[key]);
          }
        });
        syncAdvancedConfiguration();
        markConfigurationDirty();
        renderConfigurationGroups();
      });
      container.appendChild(button);
    });
  }

  function renderConfigurationGroups() {
    var container = document.getElementById('configuration-groups');
    var query = document.getElementById('configuration-search').value.trim().toLocaleLowerCase();
    var category = document.getElementById('configuration-category').value;
    var groups = new Map();
    (configurationSchema && configurationSchema.settings || []).forEach(function (setting) {
      var definition = setting.definition || {};
      var search = [definition.group, definition.label, setting.key, definition.help, definition.range].join(' ').toLocaleLowerCase();
      if ((category && definition.group !== category) || (query && !search.includes(query))) {
        return;
      }
      var entries = groups.get(definition.group) || [];
      entries.push(setting);
      groups.set(definition.group, entries);
    });
    container.replaceChildren();
    var count = 0;
    groups.forEach(function (settings, group) {
      count += settings.length;
      var details = document.createElement('details');
      details.className = 'web-settings-group';
      details.open = Boolean(query || category);
      var summary = document.createElement('summary');
      var heading = document.createElement('strong');
      heading.textContent = group;
      var total = document.createElement('span');
      total.textContent = String(settings.length);
      summary.append(heading, total);
      var grid = document.createElement('div');
      grid.className = 'web-settings-grid';
      settings.forEach(function (setting) {
        grid.appendChild(createConfigurationField(setting));
      });
      details.append(summary, grid);
      container.appendChild(details);
    });
    setText('configuration-count', String(count) + ' de ' + String((configurationSchema && configurationSchema.settings || []).length) + ' parametros');
  }

  function createConfigurationField(setting) {
    var definition = setting.definition || {};
    var field = document.createElement('article');
    field.className = 'web-setting-field';
    var heading = document.createElement('div');
    heading.className = 'web-setting-heading';
    var label = document.createElement('strong');
    label.textContent = definition.label || setting.key;
    var key = document.createElement('small');
    key.textContent = setting.key;
    var info = document.createElement('button');
    info.type = 'button';
    info.className = 'setting-info';
    info.textContent = 'i';
    info.title = [definition.help, definition.range].filter(Boolean).join(' ');
    info.setAttribute('aria-label', info.title || 'Informacion del parametro');
    heading.append(label, key, info);
    field.appendChild(heading);
    var currentValue = configurationDraftValues[setting.key] ?? unquoteConfigurationValue(setting.value);
    if (setting.zeroToggle) {
      var zeroRow = document.createElement('div');
      zeroRow.className = 'web-zero-toggle';
      var zeroButton = createConfigurationToggle(Number(currentValue) !== 0, function (enabled) {
        configurationDraftValues[setting.key] = enabled ? String(setting.zeroToggle.defaultValue) : String(setting.zeroToggle.zeroValue);
        syncAdvancedConfiguration();
        markConfigurationDirty();
        renderConfigurationGroups();
      }, Number(currentValue) !== 0 ? setting.zeroToggle.enabledLabel : setting.zeroToggle.disabledLabel);
      zeroRow.appendChild(zeroButton);
      field.appendChild(zeroRow);
      if (Number(currentValue) !== 0) {
        field.appendChild(createConfigurationInput(setting, currentValue));
      }
      return field;
    }
    if (definition.kind === 'boolean') {
      field.appendChild(createConfigurationToggle(String(currentValue).toLowerCase() === 'true', function (enabled) {
        configurationDraftValues[setting.key] = enabled ? 'True' : 'False';
        syncAdvancedConfiguration();
        markConfigurationDirty();
      }, String(currentValue).toLowerCase() === 'true' ? 'Activo' : 'Inactivo'));
      return field;
    }
    field.appendChild(createConfigurationInput(setting, currentValue));
    return field;
  }

  function createConfigurationToggle(checked, onChange, label) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'setting-toggle' + (checked ? ' is-active' : '');
    button.setAttribute('role', 'switch');
    button.setAttribute('aria-checked', String(checked));
    button.innerHTML = '<span class="setting-toggle__track" aria-hidden="true"><span></span></span><span class="setting-toggle__state"></span>';
    button.querySelector('.setting-toggle__state').textContent = label;
    button.addEventListener('click', function () { onChange(!checked); });
    return button;
  }

  function createConfigurationInput(setting, currentValue) {
    var definition = setting.definition || {};
    var update = function (value) {
      configurationDraftValues[setting.key] = value;
      syncAdvancedConfiguration();
      markConfigurationDirty();
    };
    if (definition.kind === 'select' && Array.isArray(definition.options)) {
      var select = document.createElement('select');
      definition.options.forEach(function (option) {
        var item = new Option(formatConfigurationOption(option), option, false, option === currentValue);
        select.add(item);
      });
      select.addEventListener('change', function () { update(select.value); });
      return select;
    }
    if (definition.kind === 'number') {
      var number = document.createElement('input');
      number.type = 'number';
      number.step = String(definition.step || 'any');
      number.value = currentValue;
      if (typeof definition.min === 'number') number.min = String(definition.min);
      if (typeof definition.max === 'number') number.max = String(definition.max);
      number.addEventListener('input', function () { update(number.value); });
      if (typeof definition.min !== 'number' || typeof definition.max !== 'number') {
        return number;
      }
      var range = document.createElement('input');
      range.type = 'range';
      range.min = String(definition.min);
      range.max = String(definition.max);
      range.step = String(definition.step || 'any');
      range.value = currentValue;
      range.addEventListener('input', function () {
        number.value = range.value;
        update(range.value);
      });
      var row = document.createElement('div');
      row.className = 'web-setting-range';
      row.append(range, number);
      return row;
    }
    var input = document.createElement('input');
    input.type = 'text';
    input.value = currentValue;
    input.addEventListener('input', function () { update(input.value); });
    return input;
  }

  function formatConfigurationOption(option) {
    return { All: 'Todo', Easy: 'Facil', Hard: 'Dificil', Item: 'Items', ItemAndEquipment: 'Items y equipo', None: 'Ninguno', Normal: 'Normal', Region: 'Por region', Text: 'Texto' }[option] || option;
  }

  function renderAdminSnapshot(container, title, values) {
    var card = document.createElement('article');
    card.className = 'remote-snapshot-card';
    var heading = document.createElement('strong');
    heading.textContent = title;
    card.appendChild(heading);
    Object.keys(values || {}).slice(0, 12).forEach(function (key) {
      var row = document.createElement('div');
      var label = document.createElement('span');
      label.textContent = key;
      var value = document.createElement('b');
      value.textContent = String(values[key]);
      row.append(label, value);
      card.appendChild(row);
    });
    container.appendChild(card);
  }

  async function refreshAdministration() {
    var result = await apiRequest('/admin');
    var container = document.getElementById('admin-summary');
    container.replaceChildren();
    container.appendChild(createDataRow('Estado', formatState(result.status), result.message));
    if (result.info) {
      renderAdminSnapshot(container, 'Servidor', result.info);
    }
    if (result.metrics) {
      renderAdminSnapshot(container, 'Metricas', result.metrics);
    }
    if (result.settings) {
      renderAdminSnapshot(container, 'Settings', result.settings);
    }
  }

  async function refreshNetwork() {
    var results = await Promise.all([apiRequest('/firewall'), apiRequest('/network/addresses'), apiRequest('/network/public')]);
    var firewall = results[0];
    var addresses = results[1];
    var publicNetwork = results[2];
    var container = document.getElementById('firewall-summary');
    container.replaceChildren();
    (firewall.local && firewall.local.ports || []).forEach(function (port) {
      container.appendChild(createDataRow(
        port.label + ' ' + port.protocol + ' ' + port.port,
        formatState(port.state),
        port.message
      ));
    });
    var networkSummary = document.getElementById('network-summary');
    networkSummary.replaceChildren();
    networkSummary.appendChild(createDataRow('Red local', (addresses.addresses || []).join(', ') || 'No detectada'));
    networkSummary.appendChild(createDataRow('IP publica', publicNetwork.publicIp || 'No disponible', publicNetwork.message));
  }

  function renderBackupEntries(summary) {
    var container = document.getElementById('backup-list');
    container.replaceChildren();
    var backups = [].concat(summary.configurationBackups || [], summary.worldBackups || []);
    if (!backups.length) {
      container.appendChild(createDataRow('Backups', 'No hay respaldos disponibles.', summary.message));
      return;
    }
    backups.forEach(function (backup) {
      var item = createDataRow(backup.name, backup.kind === 'world' ? 'Mundo' : 'Configuracion', formatBytes(backup.sizeBytes) + ' · ' + backup.integrity);
      var controls = document.createElement('div');
      controls.className = 'backup-row-actions';
      [['Verificar', 'verify'], ['Restaurar', 'restore'], ['Papelera', 'delete']].forEach(function (entry) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = entry[1] === 'delete' ? 'danger-button compact-button' : 'secondary-button compact-button';
        button.textContent = entry[0];
        button.addEventListener('click', function () {
          void executeBackupAction(backup.id, entry[1], backup.name);
        });
        controls.appendChild(button);
      });
      item.appendChild(controls);
      container.appendChild(item);
    });
  }

  async function refreshBackups() {
    var summary = await apiRequest('/backups');
    var form = document.getElementById('backup-policy-form');
    form.elements.automaticEnabled.value = String(Boolean(summary.policy.automaticEnabled));
    form.elements.automaticIntervalHours.value = String(summary.policy.automaticIntervalHours);
    form.elements.automaticRetentionPerType.value = String(summary.policy.automaticRetentionPerType);
    form.elements.compressWorldBackups.checked = Boolean(summary.policy.compressWorldBackups);
    renderBackupEntries(summary);
  }

  function renderLogFiles(files) {
    var container = document.getElementById('log-files');
    if (!container) {
      return;
    }
    container.replaceChildren();
    files.forEach(function (file) {
      var button = document.createElement('button');
      button.className = 'log-file-button';
      button.type = 'button';
      button.textContent = file.relativePath + (file.isActiveFile ? ' · actual' : '');
      button.addEventListener('click', function () {
        void readLogFile(file.id);
      });
      container.appendChild(button);
    });
  }

  async function readLogFile(id) {
    var result = await apiRequest('/logs/files/' + encodeURIComponent(id) + '?maxLines=1000');
    var consoleElement = document.getElementById('logs-console');
    consoleElement.textContent = (result.lines || []).join('\n') || 'El archivo no contiene lineas.';
    consoleElement.scrollTop = consoleElement.scrollHeight;
  }

  async function refreshSettings() {
    var results = await Promise.all([apiRequest('/app/settings'), apiRequest('/app/updates'), apiRequest('/app/remote-api'), apiRequest('/automation/idle')]);
    var app = results[0];
    var update = results[1];
    var remote = results[2];
    var idle = results[3];
    var container = document.getElementById('app-settings-summary');
    container.replaceChildren();
    container.appendChild(createDataRow('Raiz portable', app.portableRoot, app.settingsRelativePath));
    container.appendChild(createDataRow('Actualizaciones', update.state, update.message));
    container.appendChild(createDataRow('API web', remote.state, remote.endpoint || remote.message));
    var form = document.getElementById('idle-policy-form');
    form.elements.enabled.checked = Boolean(idle.policy.enabled);
    form.elements.emptySeconds.value = String(idle.policy.emptySeconds);
    renderRemoteApiForms(remote.settings);
  }

  function renderRemoteApiForms(settings) {
    var adminForm = document.getElementById('remote-api-admin-form');
    var clientForm = document.getElementById('remote-api-client-form');
    adminForm.elements.enabled.checked = Boolean(settings.enabled);
    adminForm.elements.bindMode.value = settings.bindMode;
    adminForm.elements.port.value = String(settings.port);
    adminForm.elements.username.value = settings.username || '';
    adminForm.elements.password.value = '';
    clientForm.elements.enabled.checked = Boolean(settings.client.enabled);
    clientForm.elements.username.value = settings.client.username || '';
    clientForm.elements.password.value = '';
    var labels = {
      GENERAL: 'Estado general',
      SERVER_START: 'Iniciar',
      SERVER_RESTART: 'Reiniciar',
      SERVER_STOP: 'Detener',
      PLAYERS_VIEW: 'Ver jugadores',
      PLAYERS_KICK: 'Expulsar',
      PLAYERS_BAN: 'Banear',
      LOGS: 'Logs'
    };
    var permissions = document.getElementById('client-permissions');
    permissions.replaceChildren();
    Object.keys(labels).forEach(function (permission) {
      var label = document.createElement('label');
      label.className = 'checkbox-field';
      var input = document.createElement('input');
      input.type = 'checkbox';
      input.name = 'permission';
      input.value = permission;
      input.checked = (settings.client.permissions || []).includes(permission);
      var text = document.createElement('span');
      text.textContent = labels[permission];
      label.append(input, text);
      permissions.appendChild(label);
    });
  }

  async function saveRemoteApiProfile(profile, form) {
    var adminForm = document.getElementById('remote-api-admin-form');
    var source = profile === 'ADMIN' ? form : adminForm;
    var body = {
      profile: profile,
      enabled: form.elements.enabled.checked,
      bindMode: source.elements.bindMode.value,
      port: Number(source.elements.port.value),
      username: form.elements.username.value.trim(),
      password: form.elements.password.value
    };
    if (profile === 'CLIENT') {
      body.permissions = Array.from(form.querySelectorAll('input[name="permission"]:checked')).map(function (input) {
        return input.value;
      });
    }
    var result = await apiRequest('/app/remote-api', { method: 'PUT', body: JSON.stringify(body) });
    form.elements.password.value = '';
    showToast('Configuracion de API guardada.');
    renderRemoteApiForms(result.settings);
  }

  async function refreshAll() {
    try {
      var requests = [];
      if (
        hasPermission('GENERAL')
        || hasPermission('SERVER_START')
        || hasPermission('SERVER_RESTART')
        || hasPermission('SERVER_STOP')
      ) {
        requests.push(refreshStatus());
      }
      if (
        hasPermission('PLAYERS_VIEW')
        || hasPermission('PLAYERS_KICK')
        || hasPermission('PLAYERS_BAN')
      ) {
        requests.push(refreshPlayers());
      }
      if (hasPermission('LOGS')) {
        requests.push(refreshLogs());
      }
      if (
        hasPermission('PLAYERS_VIEW')
        || hasPermission('PLAYERS_KICK')
        || hasPermission('PLAYERS_BAN')
      ) {
        requests.push(refreshMap());
      }
      await Promise.all(requests);
      connectionLabel.textContent = 'Conectado';
    } catch (error) {
      if (error.message !== 'AUTHENTICATION_REQUIRED') {
        connectionLabel.textContent = 'Sin respuesta';
        showToast(error.message);
      }
    }
  }

  function getVisibleView() {
    return activeView;
  }

  async function refreshVisibleView(notify) {
    try {
      var view = getVisibleView();
      if (view === 'players') {
        await refreshPlayers();
      } else if (view === 'map') {
        await refreshMap();
      } else if (view === 'logs') {
        await refreshLogs();
      } else if (view === 'server') {
        await refreshServerView();
      } else if (view === 'administration') {
        await refreshAdministration();
      } else if (view === 'network') {
        await refreshNetwork();
      } else if (view === 'backups') {
        await refreshBackups();
      } else if (view === 'settings') {
        await refreshSettings();
      } else {
        await refreshStatus();
      }
      connectionLabel.textContent = 'Conectado';
      if (notify) {
        showToast('Información actualizada.');
      }
    } catch (error) {
      if (error.message !== 'AUTHENTICATION_REQUIRED') {
        connectionLabel.textContent = 'Sin respuesta';
        showToast(error.message);
      }
    }
  }

  function selectView(view) {
    if (!view) {
      return;
    }
    activeView = view;
    document.querySelectorAll('.nav-button').forEach(function (button) {
      button.classList.toggle('active', button.dataset.view === view);
    });
    document.querySelectorAll('[data-content-view]').forEach(function (section) {
      section.hidden = section.dataset.contentView !== view;
    });
    void refreshVisibleView(false);
  }

  async function executeServerAction(action) {
    var labels = {
      start: 'Iniciando servidor...',
      stop: 'Deteniendo servidor...',
      restart: 'Reiniciando servidor...'
    };
    operationMessage.textContent = labels[action];
    setActionButtonsDisabled(true);
    try {
      var result = await apiRequest('/server/' + action, { method: 'POST' });
      if (result.operationId) {
        await pollOperation(result.operationId);
      }
      await refreshAll();
    } catch (error) {
      operationMessage.textContent = error.message;
      showToast(error.message);
    } finally {
      await refreshStatus().catch(function () {});
    }
  }

  async function pollOperation(operationId) {
    for (var attempt = 0; attempt < 120; attempt += 1) {
      var operation = await apiRequest('/operations/' + encodeURIComponent(operationId));
      operationMessage.textContent = String(operation.percent || 0) + '% / ' + (operation.message || operation.title);
      if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(operation.status)) {
        if (operation.status === 'FAILED') {
          throw new Error(operation.error || operation.message);
        }
        showToast(operation.message || 'Operación completada.');
        return;
      }
      await new Promise(function (resolve) {
        setTimeout(resolve, 500);
      });
    }
    throw new Error('La operación continúa en segundo plano.');
  }

  function setActionButtonsDisabled(disabled) {
    ['start-button', 'restart-button', 'stop-button'].forEach(function (id) {
      document.getElementById(id).disabled = disabled;
    });
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = setTimeout(function () {
      toast.hidden = true;
    }, 3500);
  }

  loginForm.addEventListener('submit', function (event) {
    void login(event);
  });
  document.getElementById('toggle-password').addEventListener('click', function () {
    var visible = passwordInput.type === 'text';
    passwordInput.type = visible ? 'password' : 'text';
    this.classList.toggle('is-visible', !visible);
    this.setAttribute('aria-pressed', String(!visible));
    this.setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
    this.setAttribute('title', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
  });
  document.getElementById('logout-button').addEventListener('click', function () {
    void logout();
  });
  document.querySelectorAll('.nav-button').forEach(function (button) {
    button.addEventListener('click', function () {
      selectView(button.dataset.view);
    });
  });
  document.querySelectorAll('[data-refresh]').forEach(function (button) {
    button.addEventListener('click', function () {
      void refreshVisibleView(true);
    });
  });
  document.getElementById('start-button').addEventListener('click', function () {
    void executeServerAction('start');
  });
  document.getElementById('restart-button').addEventListener('click', function () {
    void executeServerAction('restart');
  });
  document.getElementById('stop-button').addEventListener('click', function () {
    void executeServerAction('stop');
  });
  document.getElementById('server-update-button').addEventListener('click', function () {
    void executeInstallationAction('update');
  });
  document.getElementById('steamcmd-install-button').addEventListener('click', function () {
    void executeSetupAction('/steamcmd/install', 'Se descargara SteamCMD desde la fuente oficial. Continuar?');
  });
  document.getElementById('server-install-button').addEventListener('click', function () {
    void executeSetupAction('/installation/install', 'Se instalara Palworld Dedicated Server en la raiz portable. Continuar?');
  });
  document.getElementById('server-repair-button').addEventListener('click', function () {
    void executeInstallationAction('repair');
  });
  document.getElementById('configuration-content').addEventListener('input', function () {
    markConfigurationDirty();
  });
  document.getElementById('configuration-search').addEventListener('input', renderConfigurationGroups);
  document.getElementById('configuration-category').addEventListener('change', renderConfigurationGroups);
  document.getElementById('configuration-form').addEventListener('submit', function (event) {
    event.preventDefault();
    void (async function () {
      try {
        var content = document.getElementById('configuration-content').value;
        var result = await apiRequest('/configuration', { method: 'PUT', body: JSON.stringify({ content: content }) });
        if (result.operationId) {
          await pollOperation(result.operationId);
        }
        document.getElementById('configuration-content').dataset.dirty = '';
        setText('configuration-status', 'Configuracion guardada.');
        showToast('Configuracion guardada.');
        await refreshServerView();
      } catch (error) {
        showToast(error.message);
      }
    }());
  });
  document.getElementById('configuration-default-button').addEventListener('click', function () {
    if (!window.confirm('Se restaurara la configuracion por defecto. Continuar?')) {
      return;
    }
    void (async function () {
      try {
        var result = await apiRequest('/configuration/default', { method: 'POST' });
        if (result.operationId) {
          await pollOperation(result.operationId);
        }
        await refreshServerView();
      } catch (error) {
        showToast(error.message);
      }
    }());
  });
  document.getElementById('announce-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var message = document.getElementById('announce-message').value.trim();
    if (!message) {
      return;
    }
    document.getElementById('announce-message').value = '';
    void executeAdminAction('announce', { message: message });
  });
  document.getElementById('admin-save-button').addEventListener('click', function () {
    void executeAdminAction('save', {}, 'Solicitar guardado manual del mundo?');
  });
  document.getElementById('admin-shutdown-button').addEventListener('click', function () {
    var seconds = Number(window.prompt('Segundos antes del apagado programado:', '60'));
    if (!Number.isFinite(seconds) || seconds < 0) {
      return;
    }
    void executeAdminAction('shutdown', { seconds: Math.round(seconds), message: 'Apagado solicitado desde PSM Console Web.' }, 'Programar apagado del servidor?');
  });
  document.getElementById('firewall-configure-button').addEventListener('click', function () {
    if (!window.confirm('Windows solicitara permisos de administrador para crear las reglas. Continuar?')) {
      return;
    }
    void (async function () {
      try {
        var result = await apiRequest('/firewall/rules', { method: 'POST' });
        if (result.operationId) {
          await pollOperation(result.operationId);
        }
        await refreshNetwork();
      } catch (error) {
        showToast(error.message);
      }
    }());
  });
  document.getElementById('backup-config-button').addEventListener('click', function () {
    void (async function () {
      try {
        var result = await apiRequest('/backups/configuration', { method: 'POST' });
        if (result.operationId) { await pollOperation(result.operationId); }
        await refreshBackups();
      } catch (error) { showToast(error.message); }
    }());
  });
  document.getElementById('backup-world-button').addEventListener('click', function () {
    void (async function () {
      try {
        var result = await apiRequest('/backups/world', { method: 'POST' });
        if (result.operationId) { await pollOperation(result.operationId); }
        await refreshBackups();
      } catch (error) { showToast(error.message); }
    }());
  });
  document.getElementById('backup-policy-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var form = event.currentTarget;
    void (async function () {
      try {
        var result = await apiRequest('/backups/policy', {
          method: 'PUT',
          body: JSON.stringify({
            automaticEnabled: form.elements.automaticEnabled.value === 'true',
            automaticIntervalHours: Number(form.elements.automaticIntervalHours.value),
            automaticRetentionPerType: Number(form.elements.automaticRetentionPerType.value),
            compressWorldBackups: form.elements.compressWorldBackups.checked
          })
        });
        if (result.operationId) { await pollOperation(result.operationId); }
        await refreshBackups();
      } catch (error) { showToast(error.message); }
    }());
  });
  document.getElementById('idle-policy-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var form = event.currentTarget;
    void (async function () {
      try {
        await apiRequest('/automation/idle', {
          method: 'PUT',
          body: JSON.stringify({
            enabled: form.elements.enabled.checked,
            emptySeconds: Number(form.elements.emptySeconds.value)
          })
        });
        showToast('Automatizacion guardada.');
        await refreshSettings();
      } catch (error) { showToast(error.message); }
    }());
  });
  document.getElementById('remote-api-admin-form').addEventListener('submit', function (event) {
    event.preventDefault();
    void saveRemoteApiProfile('ADMIN', event.currentTarget).catch(function (error) {
      showToast(error.message);
    });
  });
  document.getElementById('remote-api-client-form').addEventListener('submit', function (event) {
    event.preventDefault();
    void saveRemoteApiProfile('CLIENT', event.currentTarget).catch(function (error) {
      showToast(error.message);
    });
  });
  bindWebMapControls();

  if (getToken()) {
    apiRequest('/session')
      .then(function (session) {
        applyAccess(session);
        showDashboard();
        return refreshAll();
      })
      .catch(function () {
        showLogin('La sesion finalizo. Ingresa nuevamente.');
      });
  } else {
    showLogin();
  }
}());
