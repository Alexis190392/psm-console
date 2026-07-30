import type { PalworldAdminStatusDto } from '../../shared/dto/palworld-admin.dto';
import type { PalworldPlayersStatusDto } from '../../shared/dto/palworld-players-status.dto';
import { renderIcon } from '../components/icon';
import {
  getAdminSnapshotFields,
  type AdminSnapshotFieldDefinition,
  type AdminSnapshotSection
} from '../constants/admin-snapshot-catalog';
import { formatDateTime } from '../utils/format';
import { escapeHtml } from '../utils/text';

export type AdminTab = 'general' | 'players' | 'map';

export function hasAdminGeneralData(adminStatus: PalworldAdminStatusDto): boolean {
  return [adminStatus.info, adminStatus.metrics, adminStatus.settings].every(
    (snapshot) => Object.keys(snapshot).length > 0
  );
}

export function renderAdminStatus(
  adminStatus: PalworldAdminStatusDto,
  playersStatus: PalworldPlayersStatusDto,
  activeTab: AdminTab
): string {
  const isReady = adminStatus.status === 'READY';

  return `
    <div class="view-stack admin-view">
      <section class="content-card admin-panel">
        ${
          isReady
            ? renderAdminTabs(adminStatus, playersStatus, activeTab)
            : `<div class="admin-toolbar"><h3>Administracion</h3><span class="view-meta-pill">${escapeHtml(adminStatus.message)}</span></div><p class="empty-state">${escapeHtml(adminStatus.message)}</p>`
        }
      </section>
    </div>
  `;
}

function renderAdminTabs(
  adminStatus: PalworldAdminStatusDto,
  playersStatus: PalworldPlayersStatusDto,
  activeTab: AdminTab
): string {
  const tabLabel: Record<AdminTab, string> = {
    general: 'Servidor',
    players: 'Jugadores',
    map: 'Mapa'
  };

  return `
    <div class="admin-toolbar" data-admin-active-tab="${activeTab}">
      <h3>${tabLabel[activeTab]}</h3>
      <span class="view-meta-pill" data-admin-live-region="status-message">${escapeHtml(adminStatus.message)}</span>
    </div>
    ${renderAdminActiveTab(adminStatus, playersStatus, activeTab)}
  `;
}

function renderAdminActiveTab(
  adminStatus: PalworldAdminStatusDto,
  playersStatus: PalworldPlayersStatusDto,
  activeTab: AdminTab
): string {
  if (activeTab === 'players') {
    return renderAdminPlayersTab(playersStatus);
  }
  if (activeTab === 'map') {
    return renderAdminMapTab(playersStatus);
  }
  return renderAdminGeneralTab(adminStatus);
}

function renderAdminGeneralTab(adminStatus: PalworldAdminStatusDto): string {
  return `
    <div class="admin-runtime-actions">
      <button id="restart-server" class="secondary-button button-with-icon" type="button">
        ${renderIcon('refresh')}
        <span>Reiniciar servidor</span>
      </button>
    </div>
    <div class="admin-snapshot-grid">
      ${renderAdminSnapshotCard('Informacion', 'Info oficial del servidor', 'info', adminStatus.info)}
      ${renderAdminSnapshotCard('Metricas', 'Rendimiento reportado por REST', 'metrics', adminStatus.metrics)}
      ${renderAdminSnapshotCard('Configuracion activa', 'Configuracion leida del servidor', 'settings', adminStatus.settings)}
    </div>
    <div class="admin-grid">
      <form class="admin-card" data-admin-form="save">
        <h4>Guardar mundo</h4>
        <p class="admin-card__hint">Guarda el estado actual.</p>
        <button class="secondary-button button-with-icon" type="submit">
          ${renderIcon('save')}
          <span>Guardar ahora</span>
        </button>
      </form>
      <form class="admin-card" data-admin-form="shutdown">
        <h4>Apagado programado</h4>
        <label class="compact-field">
          <span>Espera</span>
          <span class="input-with-unit">
            <input name="seconds" type="number" min="0" max="3600" value="60" />
            <small>s</small>
          </span>
        </label>
        <input name="message" type="text" value="Servidor detenido desde PSM Console." />
        <button class="secondary-button button-with-icon" type="submit">
          ${renderIcon('clock')}
          <span>Programar</span>
        </button>
      </form>
      <form class="admin-card admin-card--danger" data-admin-form="stop">
        <span class="view-kicker">EMERGENCIA</span>
        <h4>Detener ahora</h4>
        <p class="admin-card__hint">Solo si el apagado programado no responde.</p>
        <button class="secondary-button secondary-button--warning button-with-icon" type="submit">
          ${renderIcon('stop')}
          <span>Forzar detencion</span>
        </button>
      </form>
    </div>
  `;
}

function renderAdminPlayersTab(playersStatus: PalworldPlayersStatusDto): string {
  return `
    <form class="admin-broadcast-bar" data-admin-form="announce">
      <span class="view-kicker">ANUNCIO GLOBAL</span>
      <div class="admin-broadcast-bar__row">
        <input name="message" type="text" placeholder="Mensaje para todos los jugadores" required />
        <button class="primary-button icon-button" type="submit" aria-label="Enviar anuncio" title="Enviar anuncio">
          ${renderIcon('send')}
        </button>
      </div>
    </form>
    <div class="admin-players-layout">
      <section class="admin-players-panel admin-players-panel--wide">
        <div class="players-list-card__header">
          <h3>Jugadores conectados</h3>
          <span data-admin-live-region="players-meta">${renderPlayersHeaderMeta(playersStatus)}</span>
        </div>
        <div data-admin-live-region="players-list">${renderAdminPlayersList(playersStatus)}</div>
      </section>
    </div>
  `;
}

function renderAdminMapTab(playersStatus: PalworldPlayersStatusDto): string {
  return `<div data-admin-live-region="map-content">${renderAdminMapContent(playersStatus)}</div>`;
}

function renderAdminMapContent(playersStatus: PalworldPlayersStatusDto): string {
  if (playersStatus.status !== 'READY') {
    return `<section class="admin-map-panel"><p class="empty-state">${escapeHtml(playersStatus.message)}</p></section>`;
  }
  const locatedPlayers = playersStatus.players.filter(hasPlayerLocation);
  if (locatedPlayers.length === 0) {
    return `
      <section class="admin-map-panel">
        <div class="admin-map__header">
          <h3>Ubicacion de jugadores</h3>
          <span class="view-meta-pill">${escapeHtml(formatDateTime(playersStatus.updatedAt))}</span>
        </div>
        <p class="empty-state">No hay jugadores conectados con coordenadas reportadas por la REST API.</p>
      </section>
    `;
  }
  const bounds = getPlayerMapBounds(locatedPlayers);
  return `
    <section class="admin-map-panel">
      <div class="admin-map__header">
        <h3>Ubicacion de jugadores</h3>
        <span class="view-meta-pill">${String(locatedPlayers.length)} activos</span>
      </div>
      <div class="admin-map-layout">
        <div class="admin-map-stage" role="img" aria-label="Mapa relativo de jugadores conectados">
          <div class="admin-map-stage__axis admin-map-stage__axis--x">X</div>
          <div class="admin-map-stage__axis admin-map-stage__axis--y">Y</div>
          ${locatedPlayers.map((player, index) => renderPlayerMapMarker(player, bounds, index)).join('')}
        </div>
        <div class="admin-map-list">${locatedPlayers.map(renderPlayerMapListItem).join('')}</div>
      </div>
    </section>
  `;
}

function renderAdminSnapshotCard(
  title: string,
  detail: string,
  section: AdminSnapshotSection,
  snapshot: PalworldAdminStatusDto['info']
): string {
  const entries = getAdminSnapshotFields(section, snapshot ?? {});
  return `
    <article class="admin-snapshot-card">
      <h4>${escapeHtml(title)}</h4>
      <span class="sr-only">${escapeHtml(detail)}</span>
      ${
        entries.length > 0
          ? `<dl>${entries.map(([key, value, definition]) => renderAdminSnapshotEntry(section, key, value, definition)).join('')}</dl>`
          : '<small>Datos del servidor pendientes.</small>'
      }
    </article>
  `;
}

function renderAdminSnapshotEntry(
  section: AdminSnapshotSection,
  key: string,
  value: unknown,
  definition: AdminSnapshotFieldDefinition | undefined
): string {
  const label = definition?.label ?? key;
  const description = definition?.description ?? `Clave tecnica REST: ${key}`;
  const formattedValue = formatAdminValue(value, definition);
  const health = getAdminMetricHealth(value, definition);
  const healthClass = health ? ` admin-snapshot-value--${health}` : '';
  const healthLabel = health === 'ok'
    ? 'Rendimiento normal'
    : health === 'warning'
      ? 'Rendimiento a revisar'
      : health === 'critical'
        ? 'Rendimiento critico'
        : '';

  return `
    <div>
      <dt title="${escapeHtml(description)} · Clave REST: ${escapeHtml(key)}">${escapeHtml(label)}</dt>
      <dd
        class="admin-snapshot-value${healthClass}"
        data-admin-live-region="snapshot-${escapeHtml(section)}-${escapeHtml(key)}"
        title="${escapeHtml(healthLabel || description)}"
      >
        <span>${escapeHtml(formattedValue)}</span>
        ${definition?.unit ? `<small>${escapeHtml(definition.unit)}</small>` : ''}
      </dd>
    </div>
  `;
}

function formatAdminValue(value: unknown, definition?: AdminSnapshotFieldDefinition): string {
  if (definition?.format === 'boolean' || typeof value === 'boolean') {
    return value === true || value === 'true' ? 'Si' : 'No';
  }

  if (definition?.format === 'duration') {
    const seconds = toFiniteNumber(value);
    return seconds === null ? String(value) : formatDuration(seconds);
  }

  if (definition?.format === 'multiplier') {
    const multiplier = toFiniteNumber(value);
    return multiplier === null ? String(value) : `${formatAdminNumber(multiplier)}x`;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return formatAdminNumber(value);
  }

  if (typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value.trim())) {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) {
      return formatAdminNumber(numericValue);
    }
  }

  return value === 'None' ? 'Ninguno' : String(value);
}

function formatAdminNumber(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/, '');
}

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);

  if (days > 0) {
    return `${String(days)} d ${String(hours)} h`;
  }
  if (hours > 0) {
    return `${String(hours)} h ${String(minutes)} min`;
  }
  if (minutes > 0) {
    return `${String(minutes)} min`;
  }
  return `${String(seconds)} s`;
}

function getAdminMetricHealth(
  value: unknown,
  definition: AdminSnapshotFieldDefinition | undefined
): 'ok' | 'warning' | 'critical' | null {
  if (!definition?.health) {
    return null;
  }

  const numericValue = toFiniteNumber(value);
  if (numericValue === null) {
    return null;
  }

  const { direction, warning, critical } = definition.health;
  if (direction === 'minimum') {
    return numericValue < critical ? 'critical' : numericValue < warning ? 'warning' : 'ok';
  }
  return numericValue > critical ? 'critical' : numericValue > warning ? 'warning' : 'ok';
}

function toFiniteNumber(value: unknown): number | null {
  const numericValue = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() !== ''
      ? Number(value)
      : Number.NaN;
  return Number.isFinite(numericValue) ? numericValue : null;
}

function renderPlayersHeaderMeta(summary: PalworldPlayersStatusDto): string {
  const capacity = `${String(summary.currentPlayers)}${summary.maxPlayers ? `/${String(summary.maxPlayers)}` : ''}`;
  return summary.status === 'READY'
    ? `${capacity} - ${formatDateTime(summary.updatedAt)}`
    : formatDateTime(summary.updatedAt);
}

function renderAdminPlayersList(summary: PalworldPlayersStatusDto): string {
  if (summary.status !== 'READY') {
    return `<p class="empty-state">${escapeHtml(summary.message)}</p>`;
  }
  const previousPlayers = summary.previousPlayers ?? [];
  if (summary.players.length === 0 && previousPlayers.length === 0) {
    return '<p class="empty-state">No hay jugadores detectados todavia.</p>';
  }
  return `
    <div class="players-sections">
      ${renderPlayersSection('En curso', summary.players, 'No hay jugadores conectados en este momento.', true)}
      ${renderPlayersSection('Vistos anteriormente', previousPlayers, 'Todavia no hay jugadores anteriores.', false)}
    </div>
  `;
}

function renderPlayersSection(
  title: string,
  players: PalworldPlayersStatusDto['players'],
  emptyMessage: string,
  allowKick: boolean
): string {
  return `
    <section class="players-section">
      <div class="players-section__header"><h4>${escapeHtml(title)}</h4><span>${String(players.length)}</span></div>
      ${
        players.length > 0
          ? `<div class="players-list">${players.map((player) => renderAdminPlayerRow(player, allowKick)).join('')}</div>`
          : `<p class="empty-state empty-state--compact">${escapeHtml(emptyMessage)}</p>`
      }
    </section>
  `;
}

function renderAdminPlayerRow(player: PalworldPlayersStatusDto['players'][number], allowKick: boolean): string {
  const actionId = player.userId ?? player.steamId ?? player.playerId ?? '';
  const identity = actionId || 'ID no informado';
  const isBanned = player.banState === 'BANNED';
  const banAction = isBanned ? 'unban' : 'ban';
  const locationText = hasPlayerLocation(player)
    ? `X ${formatCoordinate(player.locationX)}, Y ${formatCoordinate(player.locationY)}`
    : null;
  const secondary = [
    player.playerId ? `PlayerUID ${player.playerId}` : null,
    player.userId ? `UserID ${player.userId}` : null,
    player.steamId ? `SteamID ${player.steamId}` : null,
    locationText
  ].filter((value): value is string => value !== null);
  const statusText = player.online
    ? 'Conectado'
    : player.lastSeenAt
      ? `Visto ${formatDateTime(player.lastSeenAt)}`
      : 'Visto anteriormente';

  return `
    <article class="player-row ${player.online ? 'player-row--online' : 'player-row--previous'}">
      <div class="player-row__identity"><strong>${escapeHtml(player.name)}</strong><span>${escapeHtml(identity)}</span></div>
      <small class="player-row__details">${escapeHtml(secondary.join(' - ') || 'Sin identificadores adicionales')}</small>
      <em class="player-row__status">${player.online && typeof player.ping === 'number' ? `${formatPing(player.ping)} ms` : escapeHtml(statusText)}</em>
      <form class="player-row__actions" data-admin-form="player">
        <input name="userId" type="hidden" value="${escapeHtml(actionId)}" />
        <input name="message" type="hidden" value="Accion aplicada desde PSM Console." />
        <button class="admin-icon-button secondary-button icon-button" type="submit" data-player-action="kick" ${actionId && allowKick ? '' : 'disabled'} aria-label="Expulsar jugador" title="${allowKick ? 'Expulsar jugador' : 'Solo disponible para jugadores conectados'}">
          ${renderIcon('log-out')}
        </button>
        <button class="ban-toggle ${isBanned ? 'ban-toggle--active' : ''}" type="submit" data-player-action="${banAction}" ${actionId ? '' : 'disabled'} aria-pressed="${isBanned ? 'true' : 'false'}" aria-label="${isBanned ? 'Desbanear jugador' : 'Banear jugador'}" title="${isBanned ? 'Desbanear jugador' : 'Banear jugador'}">
          <span class="ban-toggle__track" aria-hidden="true"><span class="ban-toggle__thumb"></span></span>
          <span>${isBanned ? 'Baneado' : 'Permitido'}</span>
        </button>
      </form>
    </article>
  `;
}

interface PlayerMapBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function hasPlayerLocation(
  player: PalworldPlayersStatusDto['players'][number]
): player is PalworldPlayersStatusDto['players'][number] & { locationX: number; locationY: number } {
  return typeof player.locationX === 'number' &&
    Number.isFinite(player.locationX) &&
    typeof player.locationY === 'number' &&
    Number.isFinite(player.locationY);
}

function getPlayerMapBounds(
  players: Array<PalworldPlayersStatusDto['players'][number] & { locationX: number; locationY: number }>
): PlayerMapBounds {
  const xs = players.map((player) => player.locationX);
  const ys = players.map((player) => player.locationY);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  };
}

function renderPlayerMapMarker(
  player: PalworldPlayersStatusDto['players'][number] & { locationX: number; locationY: number },
  bounds: PlayerMapBounds,
  index: number
): string {
  const position = getPlayerMapPosition(player, bounds);
  return `
    <article class="admin-map-marker" style="left: ${position.left}%; top: ${position.top}%;" title="${escapeHtml(player.name)}">
      <span class="admin-map-marker__pin">${escapeHtml(getPlayerInitials(player.name))}</span>
      <span class="admin-map-marker__label">${escapeHtml(player.name || `Jugador ${String(index + 1)}`)}</span>
    </article>
  `;
}

function renderPlayerMapListItem(
  player: PalworldPlayersStatusDto['players'][number] & { locationX: number; locationY: number }
): string {
  const details = [
    typeof player.level === 'number' ? `Nivel ${String(player.level)}` : null,
    typeof player.ping === 'number' ? `${formatPing(player.ping)} ms` : null,
    typeof player.locationZ === 'number' ? `Z ${formatCoordinate(player.locationZ)}` : null
  ].filter((value): value is string => value !== null);
  return `
    <article class="admin-map-player">
      <strong>${escapeHtml(player.name)}</strong>
      <span>X ${formatCoordinate(player.locationX)} / Y ${formatCoordinate(player.locationY)}</span>
      <small>${escapeHtml(details.join(' - ') || 'Sin datos adicionales')}</small>
    </article>
  `;
}

function getPlayerMapPosition(
  player: PalworldPlayersStatusDto['players'][number] & { locationX: number; locationY: number },
  bounds: PlayerMapBounds
): { left: string; top: string } {
  const left = normalizeMapAxis(player.locationX, bounds.minX, bounds.maxX);
  const top = 100 - normalizeMapAxis(player.locationY, bounds.minY, bounds.maxY);
  return { left: left.toFixed(2), top: top.toFixed(2) };
}

function normalizeMapAxis(value: number, min: number, max: number): number {
  if (min === max) {
    return 50;
  }
  const padding = 8;
  const normalized = ((value - min) / (max - min)) * (100 - padding * 2) + padding;
  return Math.min(100 - padding, Math.max(padding, normalized));
}

function getPlayerInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = words.slice(0, 2).map((word) => word[0]?.toUpperCase() ?? '').join('');
  return initials || 'J';
}

function formatCoordinate(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatPing(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
