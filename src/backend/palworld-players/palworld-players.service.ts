import { Injectable, Optional } from '@nestjs/common';
import { request as httpRequest } from 'node:http';
import { PalworldConfigurationService } from '../palworld-configuration/palworld-configuration.service';
import { PalworldProcessService } from '../palworld-process/palworld-process.service';
import { LoggingService } from '../logging/logging.service';
import type { PalworldPlayerDto, PalworldPlayersStatusDto } from '../../shared/dto/palworld-players-status.dto';

const DEFAULT_REST_API_PORT = 8212;
const PLAYERS_ENDPOINT_PATH = '/v1/api/players';
const REST_REQUEST_TIMEOUT_MS = 1_800;

@Injectable()
export class PalworldPlayersService {
  constructor(
    private readonly palworldConfigurationService: PalworldConfigurationService,
    private readonly palworldProcessService: PalworldProcessService,
    @Optional() private readonly loggingService?: LoggingService
  ) {}

  async getStatus(): Promise<PalworldPlayersStatusDto> {
    const runtime = this.palworldProcessService.getRuntimeStatus();

    if (runtime.state !== 'RUNNING') {
      return createPlayersStatus({
        status: 'SERVER_STOPPED',
        message: 'Inicia el servidor para consultar jugadores conectados.'
      });
    }

    try {
      const configuration = await this.palworldConfigurationService.readActive();
      const settings = parseOptionSettings(configuration.content);
      const restEnabled = parseBooleanSetting(settings.get('RESTAPIEnabled'));
      const restPort = parsePort(settings.get('RESTAPIPort')) ?? DEFAULT_REST_API_PORT;
      const adminPassword = unquoteSetting(settings.get('AdminPassword') ?? '');
      const maxPlayers = parseIntegerSetting(settings.get('ServerPlayerMaxNum'));

      if (!restEnabled) {
        return createPlayersStatus({
          status: 'REST_DISABLED',
          restPort,
          maxPlayers,
          message: 'Activa REST API en la configuracion del servidor para consultar jugadores.'
        });
      }

      if (!adminPassword) {
        return createPlayersStatus({
          status: 'ADMIN_PASSWORD_MISSING',
          restPort,
          maxPlayers,
          message: 'Define Admin Password en la configuracion para autenticar la API local.'
        });
      }

      const endpoint = createPlayersEndpoint(restPort);
      const response = await requestPlayers(endpoint, adminPassword);
      const players = normalizePlayersResponse(response);

      return createPlayersStatus({
        status: 'READY',
        players,
        currentPlayers: players.length,
        maxPlayers,
        restPort,
        endpoint,
        message: players.length === 0 ? 'Servidor activo sin jugadores conectados.' : 'Jugadores conectados detectados.'
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void this.loggingService?.write('palserver', 'ERROR', `Monitor de jugadores: ${message}`);
      return createPlayersStatus({
        status: message.startsWith('ACTIVE_CONFIGURATION') ? 'CONFIGURATION_MISSING' : 'CONNECTION_ERROR',
        message: message.startsWith('ACTIVE_CONFIGURATION')
          ? 'No se pudo leer PalWorldSettings.ini para configurar el monitor.'
          : 'No se pudo conectar con la REST API local del servidor.'
      });
    }
  }
}

interface PlayersStatusInput {
  status: PalworldPlayersStatusDto['status'];
  message: string;
  players?: PalworldPlayerDto[];
  currentPlayers?: number;
  maxPlayers?: number;
  restPort?: number;
  endpoint?: string;
}

function createPlayersStatus(input: PlayersStatusInput): PalworldPlayersStatusDto {
  return {
    status: input.status,
    players: input.players ?? [],
    currentPlayers: input.currentPlayers ?? input.players?.length ?? 0,
    maxPlayers: input.maxPlayers,
    restPort: input.restPort,
    endpoint: input.endpoint,
    updatedAt: new Date().toISOString(),
    message: input.message
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
    ping: readNumber(value, ['ping', 'latency'])
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
