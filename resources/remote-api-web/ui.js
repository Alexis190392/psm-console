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
    var visibleNavigation = Array.from(document.querySelectorAll('.nav-button')).filter(function (button) {
      return !button.hidden;
    });
    var activeNavigation = document.querySelector('.nav-button.active');
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
    var active = document.querySelector('.nav-button.active');
    return active ? active.dataset.view : 'general';
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
