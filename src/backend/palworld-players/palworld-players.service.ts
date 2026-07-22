import { Injectable, Optional } from '@nestjs/common';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { dirname, join } from 'node:path';
import { PalworldConfigurationService } from '../palworld-configuration/palworld-configuration.service';
import { PalworldProcessService } from '../palworld-process/palworld-process.service';
import { LoggingService } from '../logging/logging.service';
import { PortablePathService } from '../portable-path/portable-path.service';
import type { PalworldPlayerDto, PalworldPlayersStatusDto } from '../../shared/dto/palworld-players-status.dto';

const DEFAULT_REST_API_PORT = 8212;
const DEFAULT_ADMIN_PASSWORD = 'admin';
const PLAYERS_ENDPOINT_PATH = '/v1/api/players';
const REST_REQUEST_TIMEOUT_MS = 1_800;
const REST_READY_GRACE_MS = 60_000;
const REST_ERROR_LOG_THROTTLE_MS = 60_000;

interface KnownPlayerRecord extends PalworldPlayerDto {
  key: string;
  firstSeenAt: string;
  lastSeenAt: string;
  online: boolean;
  banState: 'BANNED' | 'NOT_BANNED' | 'UNKNOWN';
}

@Injectable()
export class PalworldPlayersService {
  private runningRuntimeKey: string | null = null;
  private restReadyWaitStartedAt = 0;
  private lastRestErrorLoggedAt = 0;
  private readonly knownPlayers = new Map<string, KnownPlayerRecord>();

  constructor(
    private readonly palworldConfigurationService: PalworldConfigurationService,
    private readonly palworldProcessService: PalworldProcessService,
    private readonly portablePathService: PortablePathService,
    @Optional() private readonly loggingService?: LoggingService
  ) {}

  async getStatus(): Promise<PalworldPlayersStatusDto> {
    const runtime = this.palworldProcessService.getRuntimeStatus();

    if (runtime.state !== 'RUNNING') {
      this.resetRuntimeTracking();
      return createPlayersStatus({
        status: 'SERVER_STOPPED',
        message: 'Inicia el servidor para consultar jugadores conectados.'
      });
    }

    this.trackRunningRuntime(`${String(runtime.pid ?? 'sin-pid')}:${runtime.startedAt ?? runtime.updatedAt}`);
    let restPort = DEFAULT_REST_API_PORT;
    let maxPlayers: number | undefined;
    let endpoint: string | undefined;

    try {
      const configuration = await this.palworldConfigurationService.readActive();
      const settings = parseOptionSettings(configuration.content);
      const restEnabled = parseBooleanSetting(settings.get('RESTAPIEnabled'));
      restPort = parsePort(settings.get('RESTAPIPort')) ?? DEFAULT_REST_API_PORT;
      const adminPassword = unquoteSetting(settings.get('AdminPassword') ?? '');
      maxPlayers = parseIntegerSetting(settings.get('ServerPlayerMaxNum'));

      if (!restEnabled) {
        await this.enableRestApi(configuration.path, configuration.content);
        return createPlayersStatus({
          status: 'REST_CONFIGURED_RESTART_REQUIRED',
          restPort: DEFAULT_REST_API_PORT,
          maxPlayers,
          message: 'REST API fue activada en el INI. Reinicia el servidor para que Palworld aplique el cambio.'
        });
      }

      if (!adminPassword) {
        await this.enableRestApi(configuration.path, configuration.content);
        return createPlayersStatus({
          status: 'REST_CONFIGURED_RESTART_REQUIRED',
          restPort,
          maxPlayers,
          message: 'AdminPassword estaba vacio y se configuro como admin. Reinicia el servidor para que Palworld aplique el cambio.'
        });
      }

      endpoint = createPlayersEndpoint(restPort);
      const response = await requestPlayers(endpoint, adminPassword);
      const players = this.mergeOnlinePlayers(normalizePlayersResponse(response));
      const previousPlayers = this.getPreviousPlayers(players);

      return createPlayersStatus({
        status: 'READY',
        players,
        previousPlayers,
        currentPlayers: players.length,
        maxPlayers,
        restPort,
        endpoint,
        message: players.length === 0 ? 'Servidor activo sin jugadores conectados.' : 'Jugadores conectados detectados.'
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isRestWarmupError(message) && Date.now() - this.restReadyWaitStartedAt < REST_READY_GRACE_MS) {
        return createPlayersStatus({
          status: 'REST_STARTING',
          restPort,
          maxPlayers,
          endpoint,
          message: 'Servidor en ejecucion. Esperando que la REST API local quede disponible.'
        });
      }

      this.logRestErrorThrottled(message);
      return createPlayersStatus({
        status: message.startsWith('ACTIVE_CONFIGURATION') ? 'CONFIGURATION_MISSING' : 'CONNECTION_ERROR',
        restPort,
        maxPlayers,
        endpoint,
        message: message.startsWith('ACTIVE_CONFIGURATION')
          ? 'No se pudo leer PalWorldSettings.ini para configurar el monitor.'
          : 'No se pudo conectar con la REST API local del servidor.'
      });
    }
  }

  private async enableRestApi(activePath: string, content: string): Promise<void> {
    const settings = parseOptionSettings(content);
    const updates = new Map([
      ['RESTAPIEnabled', 'True'],
      ['RESTAPIPort', String(DEFAULT_REST_API_PORT)]
    ]);

    if (!unquoteSetting(settings.get('AdminPassword') ?? '').trim()) {
      updates.set('AdminPassword', `"${DEFAULT_ADMIN_PASSWORD}"`);
    }

    const nextContent = upsertOptionSettings(content, updates);
    if (nextContent === content) {
      return;
    }

    const backupPath = join(
      this.portablePathService.getPortableRoot(),
      'backups',
      'configuration',
      `PalWorldSettings.before-rest-api.${new Date().toISOString().replace(/[:.]/g, '-')}.ini`
    );
    const tempPath = `${activePath}.tmp`;
    await mkdir(dirname(backupPath), { recursive: true });
    await copyFile(activePath, backupPath);
    await writeFile(tempPath, nextContent, 'utf8');
    await copyFile(tempPath, activePath);
    void this.loggingService?.write('palserver', 'INFO', 'Monitor de jugadores: REST API activada en PalWorldSettings.ini.');
  }

  private trackRunningRuntime(runtimeKey: string): void {
    if (this.runningRuntimeKey === runtimeKey) {
      return;
    }

    this.runningRuntimeKey = runtimeKey;
    this.restReadyWaitStartedAt = Date.now();
    this.lastRestErrorLoggedAt = 0;
  }

  private resetRuntimeTracking(): void {
    this.runningRuntimeKey = null;
    this.restReadyWaitStartedAt = 0;
    this.lastRestErrorLoggedAt = 0;
    this.knownPlayers.clear();
  }

  private logRestErrorThrottled(message: string): void {
    const now = Date.now();
    if (now - this.lastRestErrorLoggedAt < REST_ERROR_LOG_THROTTLE_MS) {
      return;
    }

    this.lastRestErrorLoggedAt = now;
    void this.loggingService?.write('palserver', 'ERROR', `Monitor de jugadores: ${message}`);
  }

  markBanState(userId: string, banState: 'BANNED' | 'NOT_BANNED'): void {
    const key = createPlayerKey({ userId });
    const existing = this.knownPlayers.get(key);
    const now = new Date().toISOString();

    this.knownPlayers.set(key, {
      key,
      name: existing?.name ?? userId,
      playerId: existing?.playerId,
      userId: existing?.userId ?? userId,
      steamId: existing?.steamId,
      ping: existing?.ping,
      locationX: existing?.locationX,
      locationY: existing?.locationY,
      locationZ: existing?.locationZ,
      level: existing?.level,
      buildingCount: existing?.buildingCount,
      firstSeenAt: existing?.firstSeenAt ?? now,
      lastSeenAt: existing?.lastSeenAt ?? now,
      online: existing?.online ?? false,
      banState
    });
  }

  private mergeOnlinePlayers(players: PalworldPlayerDto[]): PalworldPlayerDto[] {
    const now = new Date().toISOString();
    const onlineKeys = new Set<string>();

    const merged = players.map((player) => {
      const key = createPlayerKey(player);
      onlineKeys.add(key);
      const existing = this.knownPlayers.get(key);
      const record: KnownPlayerRecord = {
        key,
        name: player.name,
        playerId: player.playerId ?? existing?.playerId,
        userId: player.userId ?? existing?.userId,
        steamId: player.steamId ?? existing?.steamId,
        ping: player.ping,
        locationX: player.locationX ?? existing?.locationX,
        locationY: player.locationY ?? existing?.locationY,
        locationZ: player.locationZ ?? existing?.locationZ,
        level: player.level ?? existing?.level,
        buildingCount: player.buildingCount ?? existing?.buildingCount,
        firstSeenAt: existing?.firstSeenAt ?? now,
        lastSeenAt: now,
        online: true,
        banState: existing?.banState ?? 'UNKNOWN'
      };
      this.knownPlayers.set(key, record);

      return toPlayerDto(record);
    });

    this.knownPlayers.forEach((record, key) => {
      if (!onlineKeys.has(key) && record.online) {
        this.knownPlayers.set(key, {
          ...record,
          online: false
        });
      }
    });

    return merged;
  }

  private getPreviousPlayers(currentPlayers: PalworldPlayerDto[]): PalworldPlayerDto[] {
    const currentKeys = new Set(currentPlayers.map(createPlayerKey));

    return [...this.knownPlayers.values()]
      .filter((record) => !currentKeys.has(record.key))
      .sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt))
      .map(toPlayerDto);
  }
}

interface PlayersStatusInput {
  status: PalworldPlayersStatusDto['status'];
  message: string;
  players?: PalworldPlayerDto[];
  previousPlayers?: PalworldPlayerDto[];
  currentPlayers?: number;
  maxPlayers?: number;
  restPort?: number;
  endpoint?: string;
}

function createPlayersStatus(input: PlayersStatusInput): PalworldPlayersStatusDto {
  return {
    status: input.status,
    players: input.players ?? [],
    previousPlayers: input.previousPlayers ?? [],
    currentPlayers: input.currentPlayers ?? input.players?.length ?? 0,
    maxPlayers: input.maxPlayers,
    restPort: input.restPort,
    endpoint: input.endpoint,
    updatedAt: new Date().toISOString(),
    message: input.message
  };
}

function createPlayerKey(player: Partial<Pick<PalworldPlayerDto, 'userId' | 'steamId' | 'playerId' | 'name'>>): string {
  return player.userId ?? player.steamId ?? player.playerId ?? player.name ?? 'jugador-desconocido';
}

function toPlayerDto(record: KnownPlayerRecord): PalworldPlayerDto {
  return {
    name: record.name,
    playerId: record.playerId,
    userId: record.userId,
    steamId: record.steamId,
    ping: record.ping,
    locationX: record.locationX,
    locationY: record.locationY,
    locationZ: record.locationZ,
    level: record.level,
    buildingCount: record.buildingCount,
    online: record.online,
    lastSeenAt: record.lastSeenAt,
    banState: record.banState
  };
}

function createPlayersEndpoint(port: number): string {
  return `http://127.0.0.1:${String(port)}${PLAYERS_ENDPOINT_PATH}`;
}

function requestPlayers(endpoint: string, adminPassword: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    const request = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'GET',
        timeout: REST_REQUEST_TIMEOUT_MS,
        headers: {
          Accept: 'application/json',
          Authorization: `Basic ${Buffer.from(`admin:${adminPassword}`).toString('base64')}`
        }
      },
      (response) => {
        const chunks: Buffer[] = [];

        response.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        response.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');

          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`REST_API_PLAYERS_FAILED: HTTP ${String(response.statusCode ?? 'UNKNOWN')}`));
            return;
          }

          try {
            resolve(body ? JSON.parse(body) : {});
          } catch {
            reject(new Error('REST_API_PLAYERS_INVALID_JSON'));
          }
        });
      }
    );

    request.on('timeout', () => {
      request.destroy(new Error('REST_API_PLAYERS_TIMEOUT'));
    });
    request.on('error', reject);
    request.end();
  });
}

function isRestWarmupError(message: string): boolean {
  return /ECONNREFUSED|ECONNRESET|REST_API_PLAYERS_TIMEOUT/i.test(message);
}

function normalizePlayersResponse(response: unknown): PalworldPlayerDto[] {
  const players = extractPlayersArray(response);
  return players.map(normalizePlayer).filter((player): player is PalworldPlayerDto => player !== null);
}

function extractPlayersArray(response: unknown): unknown[] {
  if (Array.isArray(response)) {
    return response;
  }

  if (isRecord(response) && Array.isArray(response['players'])) {
    return response['players'];
  }

  return [];
}

function normalizePlayer(value: unknown): PalworldPlayerDto | null {
  if (!isRecord(value)) {
    return null;
  }

  const name = readString(value, ['name', 'playerName', 'nickname']) ?? 'Jugador sin nombre';
  return {
    name,
    playerId: readString(value, ['playerId', 'player_id', 'playeruid', 'playerUid']),
    userId: readString(value, ['userId', 'user_id', 'userid']),
    steamId: readString(value, ['steamId', 'steam_id', 'steamid']),
    ping: readNumber(value, ['ping', 'latency']),
    locationX: readNumber(value, ['location_x', 'LocationX', 'x']),
    locationY: readNumber(value, ['location_y', 'LocationY', 'y']),
    locationZ: readNumber(value, ['location_z', 'LocationZ', 'z']),
    level: readNumber(value, ['level', 'Level']),
    buildingCount: readNumber(value, ['building_count', 'buildingCount', 'BuildingCount'])
  };
}

function parseOptionSettings(content: string): Map<string, string> {
  const match = content.match(/OptionSettings=\(([\s\S]*)\)/);
  if (!match?.[1]) {
    return new Map();
  }

  return splitTopLevel(match[1]).reduce((settings, entry) => {
    const separator = entry.indexOf('=');
    if (separator <= 0) {
      return settings;
    }

    settings.set(entry.slice(0, separator).trim(), entry.slice(separator + 1).trim());
    return settings;
  }, new Map<string, string>());
}

function upsertOptionSettings(content: string, updates: Map<string, string>): string {
  const marker = 'OptionSettings=(';
  const start = content.indexOf(marker);
  if (start < 0) {
    throw new Error('CONFIGURATION_CONTENT_INVALID: falta OptionSettings.');
  }

  const valueStart = start + marker.length;
  const valueEnd = findOptionSettingsEnd(content, valueStart);
  if (valueEnd < valueStart) {
    throw new Error('CONFIGURATION_CONTENT_INVALID: OptionSettings incompleto.');
  }

  const body = content.slice(valueStart, valueEnd);
  const entries = splitTopLevel(body);
  const seen = new Set<string>();
  const nextEntries = entries.map((entry) => {
    const separator = entry.indexOf('=');
    if (separator <= 0) {
      return entry;
    }

    const key = entry.slice(0, separator).trim();
    const update = updates.get(key);
    if (update === undefined) {
      return entry;
    }

    seen.add(key);
    return `${key}=${update}`;
  });

  updates.forEach((value, key) => {
    if (!seen.has(key)) {
      nextEntries.push(`${key}=${value}`);
    }
  });

  return `${content.slice(0, valueStart)}${nextEntries.join(',')}${content.slice(valueEnd)}`;
}

function findOptionSettingsEnd(content: string, valueStart: number): number {
  let quoted = false;

  for (let index = valueStart; index < content.length; index += 1) {
    const char = content[index];

    if (char === '"') {
      quoted = !quoted;
    }

    if (char === ')' && !quoted) {
      return index;
    }
  }

  return -1;
}

function splitTopLevel(value: string): string[] {
  const result: string[] = [];
  let current = '';
  let quoted = false;

  for (const char of value) {
    if (char === '"') {
      quoted = !quoted;
    }

    if (char === ',' && !quoted) {
      result.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    result.push(current.trim());
  }

  return result;
}

function parseBooleanSetting(value: string | undefined): boolean {
  return /^(true|1)$/i.test(unquoteSetting(value ?? ''));
}

function parsePort(value: string | undefined): number | undefined {
  const parsed = parseIntegerSetting(value);
  return parsed && parsed > 0 && parsed <= 65_535 ? parsed : undefined;
}

function parseIntegerSetting(value: string | undefined): number | undefined {
  const parsed = Number.parseInt(unquoteSetting(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function unquoteSetting(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function readString(source: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }

  return undefined;
}

function readNumber(source: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
