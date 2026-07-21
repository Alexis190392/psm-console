import { Injectable, Optional } from '@nestjs/common';
import { request as httpRequest } from 'node:http';
import { PalworldConfigurationService } from '../palworld-configuration/palworld-configuration.service';
import { PalworldPlayersService } from '../palworld-players/palworld-players.service';
import { PalworldProcessService } from '../palworld-process/palworld-process.service';
import { LoggingService } from '../logging/logging.service';
import type {
  PalworldAdminAction,
  PalworldAdminActionRequestDto,
  PalworldAdminActionResultDto,
  PalworldAdminSnapshot,
  PalworldAdminStatusDto
} from '../../shared/dto/palworld-admin.dto';

const DEFAULT_REST_API_PORT = 8212;
const REST_REQUEST_TIMEOUT_MS = 2_500;

@Injectable()
export class PalworldAdminService {
  constructor(
    private readonly palworldConfigurationService: PalworldConfigurationService,
    private readonly palworldProcessService: PalworldProcessService,
    private readonly palworldPlayersService: PalworldPlayersService,
    @Optional() private readonly loggingService?: LoggingService
  ) {}

  async getStatus(): Promise<PalworldAdminStatusDto> {
    const runtime = this.palworldProcessService.getRuntimeStatus();

    if (runtime.state !== 'RUNNING') {
      return createAdminStatus({
        status: 'SERVER_STOPPED',
        message: 'Inicia el servidor para habilitar comandos administrativos.'
      });
    }

    try {
      const credentials = await this.readRestCredentials();

      if (!credentials.restEnabled) {
        return createAdminStatus({
          status: 'REST_DISABLED',
          restPort: credentials.restPort,
          message: 'Activa REST API en Servidor y reinicia para usar administracion.'
        });
      }

      if (!credentials.adminPassword) {
        return createAdminStatus({
          status: 'ADMIN_PASSWORD_MISSING',
          restPort: credentials.restPort,
          message: 'Define Admin Password en Servidor para autenticar acciones administrativas.'
        });
      }

      const [info, settings, metrics] = await Promise.all([
        requestAdminRead(createRestEndpoint(credentials.restPort, '/info'), credentials.adminPassword),
        requestAdminRead(createRestEndpoint(credentials.restPort, '/settings'), credentials.adminPassword),
        requestAdminRead(createRestEndpoint(credentials.restPort, '/metrics'), credentials.adminPassword)
      ]);

      return createAdminStatus({
        status: 'READY',
        restPort: credentials.restPort,
        endpoint: createRestEndpoint(credentials.restPort, ''),
        info,
        settings,
        metrics,
        message: 'Administracion REST disponible.'
      });
    } catch {
      return createAdminStatus({
        status: 'CONFIGURATION_MISSING',
        message: 'No se pudo leer PalWorldSettings.ini para preparar administracion.'
      });
    }
  }

  async execute(request: PalworldAdminActionRequestDto): Promise<PalworldAdminActionResultDto> {
    if (!request.confirmed) {
      throw new Error('PALWORLD_ADMIN_REQUIRES_CONFIRMATION');
    }

    const runtime = this.palworldProcessService.getRuntimeStatus();
    if (runtime.state !== 'RUNNING') {
      throw new Error('PALWORLD_ADMIN_REQUIRES_RUNNING_SERVER');
    }

    const credentials = await this.readRestCredentials();
    if (!credentials.restEnabled) {
      throw new Error('PALWORLD_ADMIN_REST_DISABLED');
    }

    if (!credentials.adminPassword) {
      throw new Error('PALWORLD_ADMIN_PASSWORD_MISSING');
    }

    const payload = createActionPayload(request);
    const endpoint = createRestEndpoint(credentials.restPort, getActionPath(request.action));
    await requestAdminAction(endpoint, credentials.adminPassword, payload);
    this.updateKnownPlayerBanState(request);
    const message = getActionSuccessMessage(request.action);
    void this.loggingService?.write('palserver', 'INFO', `Administracion: ${message}`);

    return {
      action: request.action,
      status: 'OK',
      message,
      updatedAt: new Date().toISOString()
    };
  }

  private updateKnownPlayerBanState(request: PalworldAdminActionRequestDto): void {
    if (request.action === 'ban' && request.userId) {
      this.palworldPlayersService.markBanState(request.userId, 'BANNED');
    }

    if (request.action === 'unban' && request.userId) {
      this.palworldPlayersService.markBanState(request.userId, 'NOT_BANNED');
    }
  }

  private async readRestCredentials(): Promise<{
    restEnabled: boolean;
    restPort: number;
    adminPassword: string;
  }> {
    const configuration = await this.palworldConfigurationService.readActive();
    const settings = parseOptionSettings(configuration.content);

    return {
      restEnabled: parseBooleanSetting(settings.get('RESTAPIEnabled')),
      restPort: parsePort(settings.get('RESTAPIPort')) ?? DEFAULT_REST_API_PORT,
      adminPassword: unquoteSetting(settings.get('AdminPassword') ?? '')
    };
  }
}

function createAdminStatus(input: {
  status: PalworldAdminStatusDto['status'];
  message: string;
  restPort?: number;
  endpoint?: string;
  info?: PalworldAdminSnapshot;
  settings?: PalworldAdminSnapshot;
  metrics?: PalworldAdminSnapshot;
}): PalworldAdminStatusDto {
  return {
    status: input.status,
    restPort: input.restPort,
    endpoint: input.endpoint,
    info: input.info,
    settings: input.settings,
    metrics: input.metrics,
    updatedAt: new Date().toISOString(),
    message: input.message
  };
}

async function requestAdminRead(endpoint: string, adminPassword: string): Promise<PalworldAdminSnapshot> {
  try {
    const response = await requestAdminJson(endpoint, adminPassword, 'GET');
    return normalizeSnapshot(response);
  } catch {
    return {};
  }
}

function requestAdminAction(endpoint: string, adminPassword: string, payload: Record<string, unknown>): Promise<void> {
  return requestAdminJson(endpoint, adminPassword, 'POST', payload).then(() => undefined);
}

function requestAdminJson(
  endpoint: string,
  adminPassword: string,
  method: 'GET' | 'POST',
  payload?: Record<string, unknown>
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const body = payload ? JSON.stringify(payload) : '';
    const url = new URL(endpoint);
    const request = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method,
        timeout: REST_REQUEST_TIMEOUT_MS,
        headers: {
          Accept: 'application/json',
          Authorization: `Basic ${Buffer.from(`admin:${adminPassword}`).toString('base64')}`,
          ...(payload
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
              }
            : {})
        }
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });
        response.on('end', () => {
          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`PALWORLD_ADMIN_REST_FAILED: HTTP ${String(response.statusCode ?? 'UNKNOWN')}`));
            return;
          }

          const responseBody = Buffer.concat(chunks).toString('utf8');
          if (!responseBody) {
            resolve({});
            return;
          }

          try {
            resolve(JSON.parse(responseBody));
          } catch {
            resolve({});
          }
        });
      }
    );

    request.on('timeout', () => {
      request.destroy(new Error('PALWORLD_ADMIN_REST_TIMEOUT'));
    });
    request.on('error', reject);
    if (body) {
      request.write(body);
    }
    request.end();
  });
}

function getActionPath(action: PalworldAdminAction): string {
  const paths: Record<PalworldAdminAction, string> = {
    announce: '/announce',
    save: '/save',
    kick: '/kick',
    ban: '/ban',
    unban: '/unban',
    shutdown: '/shutdown',
    stop: '/stop'
  };

  return paths[action];
}

function createActionPayload(request: PalworldAdminActionRequestDto): Record<string, unknown> {
  if (request.action === 'announce') {
    return { message: requireText(request.message, 'PALWORLD_ADMIN_MESSAGE_REQUIRED') };
  }

  if (request.action === 'kick' || request.action === 'ban' || request.action === 'unban') {
    return {
      userid: requireText(request.userId, 'PALWORLD_ADMIN_USER_ID_REQUIRED'),
      ...(request.action === 'unban' ? {} : { message: request.message?.trim() || undefined })
    };
  }

  if (request.action === 'shutdown') {
    return {
      waittime: Math.max(0, Math.min(3600, Math.trunc(request.seconds ?? 60))),
      message: request.message?.trim() || 'Servidor detenido desde PSM Console.'
    };
  }

  return {};
}

function getActionSuccessMessage(action: PalworldAdminAction): string {
  const messages: Record<PalworldAdminAction, string> = {
    announce: 'mensaje global enviado.',
    save: 'guardado del mundo solicitado.',
    kick: 'jugador expulsado.',
    ban: 'jugador baneado.',
    unban: 'jugador desbaneado.',
    shutdown: 'apagado programado solicitado.',
    stop: 'detencion forzada solicitada.'
  };

  return messages[action];
}

function requireText(value: string | undefined, errorCode: string): string {
  const trimmed = value?.trim();

  if (!trimmed) {
    throw new Error(errorCode);
  }

  return trimmed;
}

function createRestEndpoint(port: number, path: string): string {
  return `http://127.0.0.1:${String(port)}/v1/api${path}`;
}

function normalizeSnapshot(value: unknown): PalworldAdminSnapshot {
  if (!isRecord(value)) {
    return {};
  }

  return Object.entries(value).reduce<PalworldAdminSnapshot>((snapshot, [key, entryValue]) => {
    if (
      typeof entryValue === 'string' ||
      typeof entryValue === 'number' ||
      typeof entryValue === 'boolean' ||
      entryValue === null
    ) {
      snapshot[key] = entryValue;
    }

    return snapshot;
  }, {});
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
  const parsed = Number.parseInt(unquoteSetting(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 65_535 ? parsed : undefined;
}

function unquoteSetting(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
