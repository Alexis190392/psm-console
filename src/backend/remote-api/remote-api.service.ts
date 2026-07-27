import { Injectable, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { APP_INFO } from '../../shared/constants/app-info';
import type {
  RemoteApiLoginResultDto,
  RemoteApiStatusDto,
  RemoteApiUpdateRequestDto
} from '../../shared/dto/remote-api.dto';
import { ApplicationStateService } from '../application-state/application-state.service';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { BackupService } from '../backup/backup.service';
import { LoggingService } from '../logging/logging.service';
import { NetworkService } from '../network/network.service';
import { OperationManagerService } from '../operations/operation-manager.service';
import { PalworldAdminService } from '../palworld-admin/palworld-admin.service';
import { PalworldConfigurationService } from '../palworld-configuration/palworld-configuration.service';
import { PalworldPlayersService } from '../palworld-players/palworld-players.service';
import { PalworldProcessService } from '../palworld-process/palworld-process.service';
import type { StoredRemoteApiSettings } from './remote-api-settings.types';

const API_PREFIX = '/api/v1';
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 64 * 1024;
const LOGIN_WINDOW_MS = 5 * 60 * 1000;
const LOGIN_LOCK_MS = 30 * 1000;
const MAX_LOGIN_FAILURES = 5;
const WEB_ASSETS = {
  [`${API_PREFIX}/`]: {
    filename: 'index.html',
    contentType: 'text/html; charset=utf-8'
  },
  [`${API_PREFIX}/ui.css`]: {
    filename: 'ui.css',
    contentType: 'text/css; charset=utf-8'
  },
  [`${API_PREFIX}/ui.js`]: {
    filename: 'ui.js',
    contentType: 'text/javascript; charset=utf-8'
  }
} as const;

interface ApiSession {
  expiresAt: number;
}

interface LoginAttempt {
  failures: number;
  windowStartedAt: number;
  lockedUntil: number;
}

@Injectable()
export class RemoteApiService implements OnApplicationBootstrap, OnApplicationShutdown {
  private server: Server | null = null;
  private state: RemoteApiStatusDto['state'] = 'DISABLED';
  private message = 'API web deshabilitada.';
  private endpoint: string | undefined;
  private updatedAt = new Date().toISOString();
  private readonly sessions = new Map<string, ApiSession>();
  private readonly loginAttempts = new Map<string, LoginAttempt>();

  constructor(
    private readonly appSettingsService: AppSettingsService,
    private readonly applicationStateService: ApplicationStateService,
    private readonly palworldProcessService: PalworldProcessService,
    private readonly palworldPlayersService: PalworldPlayersService,
    private readonly palworldAdminService: PalworldAdminService,
    private readonly palworldConfigurationService: PalworldConfigurationService,
    private readonly backupService: BackupService,
    private readonly loggingService: LoggingService,
    private readonly networkService: NetworkService,
    private readonly operationManagerService: OperationManagerService
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.applyCurrentSettings();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.stop();
  }

  async getStatus(): Promise<RemoteApiStatusDto> {
    const settings = await this.appSettingsService.read();
    return {
      settings: settings.remoteApi,
      state: this.state,
      ...(this.endpoint ? { endpoint: this.endpoint } : {}),
      message: this.message,
      updatedAt: this.updatedAt
    };
  }

  async update(request: RemoteApiUpdateRequestDto): Promise<RemoteApiStatusDto> {
    await this.appSettingsService.updateRemoteApi(request);
    await this.applyCurrentSettings();
    return this.getStatus();
  }

  private async applyCurrentSettings(): Promise<void> {
    await this.stop();
    const settings = await this.appSettingsService.getRemoteApiSettings();
    if (!settings.enabled) {
      this.setState('DISABLED', 'API web deshabilitada.');
      return;
    }

    await this.start(settings);
  }

  private async start(settings: StoredRemoteApiSettings): Promise<void> {
    this.setState('STARTING', 'Iniciando API web.');
    const host = settings.bindMode === 'LOCAL_ONLY' ? '127.0.0.1' : '0.0.0.0';
    const server = createServer((request, response) => {
      void this.handleRequest(request, response);
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const handleError = (error: Error): void => {
          reject(error);
        };
        server.once('error', handleError);
        server.listen(settings.port, host, () => {
          server.off('error', handleError);
          resolve();
        });
      });
      this.server = server;
      this.endpoint = createEndpoint(settings, this.networkService.getLocalAddresses());
      this.setState('RUNNING', `API web disponible en ${this.endpoint}.`);
      void this.loggingService.write('api', 'INFO', this.message);
    } catch (error) {
      server.close();
      this.server = null;
      this.endpoint = undefined;
      this.setState('ERROR', `No se pudo iniciar la API web: ${toErrorMessage(error)}`);
      void this.loggingService.write('api', 'ERROR', this.message);
    }
  }

  private async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    this.endpoint = undefined;
    this.sessions.clear();
    this.loginAttempts.clear();
    if (!server) {
      return;
    }

    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
      server.closeAllConnections();
    });
    void this.loggingService.write('api', 'INFO', 'API web detenida.');
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const method = request.method ?? 'GET';
    const requestUrl = new URL(request.url ?? '/', 'http://localhost');

    try {
      if (method === 'GET' && requestUrl.pathname === API_PREFIX) {
        sendRedirect(response, `${API_PREFIX}/`);
        return;
      }

      if (method === 'GET' && requestUrl.pathname in WEB_ASSETS) {
        await this.sendWebAsset(response, requestUrl.pathname as keyof typeof WEB_ASSETS);
        return;
      }

      if (method === 'GET' && requestUrl.pathname === `${API_PREFIX}/logo.png`) {
        await this.sendLogo(response);
        return;
      }

      if (method === 'GET' && requestUrl.pathname === `${API_PREFIX}/health`) {
        sendJson(response, 200, {
          status: 'ok',
          application: APP_INFO.shortName,
          version: APP_INFO.version,
          api: this.state,
          updatedAt: new Date().toISOString()
        });
        return;
      }

      if (method === 'POST' && requestUrl.pathname === `${API_PREFIX}/auth/login`) {
        await this.login(request, response);
        return;
      }

      const token = this.requireSession(request);
      if (method === 'POST' && requestUrl.pathname === `${API_PREFIX}/auth/logout`) {
        this.sessions.delete(token);
        sendJson(response, 200, { status: 'ok' });
        return;
      }

      await this.routeAuthenticated(method, requestUrl, request, response);
    } catch (error) {
      const status = getHttpErrorStatus(error);
      sendJson(response, status, {
        error: status === 500 ? 'INTERNAL_SERVER_ERROR' : toErrorMessage(error),
        message: getPublicErrorMessage(error, status)
      });
      if (status >= 500) {
        void this.loggingService.write('api', 'ERROR', `Solicitud API: ${toErrorMessage(error)}`);
      }
    }
  }

  private async sendWebAsset(
    response: ServerResponse,
    path: keyof typeof WEB_ASSETS
  ): Promise<void> {
    const asset = WEB_ASSETS[path];
    const body = await readFile(resolveWebAssetPath(asset.filename));
    sendAsset(response, 200, asset.contentType, body, asset.filename === 'index.html');
  }

  private async sendLogo(response: ServerResponse): Promise<void> {
    const body = await readFile(resolveLogoPath());
    sendAsset(response, 200, 'image/png', body, false);
  }

  private async routeAuthenticated(
    method: string,
    requestUrl: URL,
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> {
    const path = requestUrl.pathname;

    if (method === 'GET' && path === `${API_PREFIX}/status`) {
      sendJson(response, 200, {
        application: this.applicationStateService.getStatus(),
        actions: this.applicationStateService.getAllowedActions(),
        server: this.palworldProcessService.getRuntimeStatus()
      });
      return;
    }
    if (method === 'GET' && path === `${API_PREFIX}/server`) {
      sendJson(response, 200, this.palworldProcessService.getRuntimeStatus());
      return;
    }
    if (method === 'POST' && path === `${API_PREFIX}/server/start`) {
      sendJson(response, 202, this.palworldProcessService.start({ confirmed: true }));
      this.logMutation('Inicio de servidor solicitado desde API web.');
      return;
    }
    if (method === 'POST' && path === `${API_PREFIX}/server/stop`) {
      sendJson(response, 202, this.palworldProcessService.stop({ confirmed: true }));
      this.logMutation('Detencion de servidor solicitada desde API web.');
      return;
    }
    if (method === 'POST' && path === `${API_PREFIX}/server/restart`) {
      sendJson(response, 202, this.palworldProcessService.restart({ confirmed: true }));
      this.logMutation('Reinicio de servidor solicitado desde API web.');
      return;
    }
    if (method === 'GET' && path === `${API_PREFIX}/players`) {
      sendJson(response, 200, await this.palworldPlayersService.getStatus());
      return;
    }
    if (method === 'GET' && path === `${API_PREFIX}/admin`) {
      sendJson(response, 200, await this.palworldAdminService.getStatus());
      return;
    }
    if (method === 'POST' && path === `${API_PREFIX}/admin/actions`) {
      const body = await readJsonBody(request);
      sendJson(response, 200, await this.palworldAdminService.execute({
        confirmed: true,
        action: requireString(body, 'action') as 'announce' | 'save' | 'kick' | 'ban' | 'unban' | 'shutdown' | 'stop',
        ...(optionalString(body, 'message') ? { message: optionalString(body, 'message') } : {}),
        ...(optionalString(body, 'userId') ? { userId: optionalString(body, 'userId') } : {}),
        ...(typeof body['seconds'] === 'number' ? { seconds: body['seconds'] } : {})
      }));
      this.logMutation(`Accion administrativa ${String(body['action'])} ejecutada desde API web.`);
      return;
    }
    if (method === 'GET' && path === `${API_PREFIX}/configuration`) {
      sendJson(response, 200, await this.palworldConfigurationService.readActive());
      return;
    }
    if (method === 'PUT' && path === `${API_PREFIX}/configuration`) {
      const body = await readJsonBody(request);
      sendJson(response, 202, this.palworldConfigurationService.saveActive({
        confirmed: true,
        content: requireString(body, 'content')
      }));
      this.logMutation('Configuracion del servidor guardada desde API web.');
      return;
    }
    if (method === 'POST' && path === `${API_PREFIX}/configuration/default`) {
      sendJson(response, 202, this.palworldConfigurationService.restoreDefault({ confirmed: true }));
      this.logMutation('Restauracion de configuracion solicitada desde API web.');
      return;
    }
    if (method === 'GET' && path === `${API_PREFIX}/backups`) {
      sendJson(response, 200, await this.backupService.getSummary());
      return;
    }
    if (method === 'POST' && path === `${API_PREFIX}/backups/configuration`) {
      sendJson(response, 202, this.backupService.createConfigurationBackup({ confirmed: true }));
      this.logMutation('Backup de configuracion solicitado desde API web.');
      return;
    }
    if (method === 'POST' && path === `${API_PREFIX}/backups/world`) {
      sendJson(response, 202, this.backupService.createWorldBackup({ confirmed: true }));
      this.logMutation('Backup del mundo solicitado desde API web.');
      return;
    }
    if (method === 'GET' && path === `${API_PREFIX}/logs`) {
      const maxLines = parseBoundedInteger(requestUrl.searchParams.get('maxLines'), 200, 1, 1_000);
      sendJson(response, 200, await this.loggingService.readRecent({ maxLines }));
      return;
    }
    if (method === 'GET' && path === `${API_PREFIX}/network/addresses`) {
      sendJson(response, 200, { addresses: this.networkService.getLocalAddresses() });
      return;
    }
    if (method === 'GET' && path === `${API_PREFIX}/network/public`) {
      const port = parseOptionalPort(requestUrl.searchParams.get('port'));
      sendJson(response, 200, await this.networkService.getPublicAddress(port ? { port } : undefined));
      return;
    }
    if (method === 'GET' && path.startsWith(`${API_PREFIX}/operations/`)) {
      const operationId = decodeURIComponent(path.slice(`${API_PREFIX}/operations/`.length));
      sendJson(response, 200, this.operationManagerService.get(operationId));
      return;
    }

    throw new ApiHttpError(404, 'API_ROUTE_NOT_FOUND');
  }

  private async login(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const clientId = request.socket.remoteAddress ?? 'unknown';
    this.assertLoginAllowed(clientId);
    const body = await readJsonBody(request);
    const username = requireString(body, 'username');
    const password = requireString(body, 'password');
    const valid = await this.appSettingsService.verifyRemoteApiCredentials(username, password);

    if (!valid) {
      this.registerLoginFailure(clientId);
      void this.loggingService.write('api', 'WARN', `Inicio de sesion rechazado desde ${clientId}.`);
      throw new ApiHttpError(401, 'REMOTE_API_INVALID_CREDENTIALS');
    }

    this.loginAttempts.delete(clientId);
    const token = randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + SESSION_DURATION_MS;
    this.sessions.set(token, { expiresAt });
    const result: RemoteApiLoginResultDto = {
      token,
      expiresAt: new Date(expiresAt).toISOString()
    };
    sendJson(response, 200, result);
    void this.loggingService.write('api', 'INFO', `Sesion API iniciada desde ${clientId}.`);
  }

  private requireSession(request: IncomingMessage): string {
    const authorization = request.headers.authorization ?? '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    const session = this.sessions.get(token);
    if (!token || !session || session.expiresAt <= Date.now()) {
      if (token) {
        this.sessions.delete(token);
      }
      throw new ApiHttpError(401, 'REMOTE_API_AUTHENTICATION_REQUIRED');
    }
    return token;
  }

  private assertLoginAllowed(clientId: string): void {
    const attempt = this.loginAttempts.get(clientId);
    if (attempt && attempt.lockedUntil > Date.now()) {
      throw new ApiHttpError(429, 'REMOTE_API_LOGIN_TEMPORARILY_LOCKED');
    }
  }

  private registerLoginFailure(clientId: string): void {
    const now = Date.now();
    const current = this.loginAttempts.get(clientId);
    const attempt = !current || now - current.windowStartedAt > LOGIN_WINDOW_MS
      ? { failures: 1, windowStartedAt: now, lockedUntil: 0 }
      : { ...current, failures: current.failures + 1 };
    if (attempt.failures >= MAX_LOGIN_FAILURES) {
      attempt.lockedUntil = now + LOGIN_LOCK_MS;
    }
    this.loginAttempts.set(clientId, attempt);
  }

  private logMutation(message: string): void {
    void this.loggingService.write('api', 'INFO', message);
  }

  private setState(state: RemoteApiStatusDto['state'], message: string): void {
    this.state = state;
    this.message = message;
    this.updatedAt = new Date().toISOString();
  }
}

class ApiHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function createEndpoint(settings: StoredRemoteApiSettings, localAddresses: string[]): string {
  const host = settings.bindMode === 'LOCAL_ONLY'
    ? '127.0.0.1'
    : localAddresses[0] ?? '127.0.0.1';
  return `http://${host}:${String(settings.port)}/api/v1`;
}

function applyCommonSecurityHeaders(response: ServerResponse): void {
  response.setHeader('cache-control', 'no-store');
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('x-frame-options', 'DENY');
  response.setHeader('referrer-policy', 'no-referrer');
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  if (response.headersSent) {
    return;
  }
  applyCommonSecurityHeaders(response);
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('content-security-policy', "default-src 'none'; frame-ancestors 'none'");
  response.statusCode = status;
  response.end(JSON.stringify(value));
}

function sendRedirect(response: ServerResponse, location: string): void {
  applyCommonSecurityHeaders(response);
  response.statusCode = 302;
  response.setHeader('location', location);
  response.end();
}

function sendAsset(
  response: ServerResponse,
  status: number,
  contentType: string,
  body: Buffer,
  isHtml: boolean
): void {
  applyCommonSecurityHeaders(response);
  response.statusCode = status;
  response.setHeader('content-type', contentType);
  response.setHeader(
    'content-security-policy',
    isHtml
      ? [
          "default-src 'self'",
          "script-src 'self'",
          "style-src 'self'",
          "img-src 'self'",
          "connect-src 'self'",
          "object-src 'none'",
          "base-uri 'none'",
          "form-action 'self'",
          "frame-ancestors 'none'"
        ].join('; ')
      : "default-src 'none'; frame-ancestors 'none'"
  );
  response.end(body);
}

function resolveWebAssetPath(filename: string): string {
  const packagedRoot = typeof process.resourcesPath === 'string'
    ? join(process.resourcesPath, 'remote-api-web')
    : '';
  const packagedPath = packagedRoot ? join(packagedRoot, filename) : '';
  if (packagedPath && existsSync(packagedPath)) {
    return packagedPath;
  }
  return join(process.cwd(), 'resources', 'remote-api-web', filename);
}

function resolveLogoPath(): string {
  const packagedPath = typeof process.resourcesPath === 'string'
    ? join(process.resourcesPath, 'palcm-logo.png')
    : '';
  if (packagedPath && existsSync(packagedPath)) {
    return packagedPath;
  }
  return join(process.cwd(), 'src', 'renderer', 'assets', 'palcm-logo.png');
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  let body = '';
  for await (const chunk of request) {
    body += String(chunk);
    if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
      throw new ApiHttpError(413, 'REMOTE_API_BODY_TOO_LARGE');
    }
  }
  if (!body) {
    return {};
  }
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('REMOTE_API_BODY_OBJECT_REQUIRED');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new ApiHttpError(400, 'REMOTE_API_BODY_INVALID');
  }
}

function requireString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiHttpError(400, `REMOTE_API_${key.toUpperCase()}_REQUIRED`);
  }
  return value.trim();
}

function optionalString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parseBoundedInteger(
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  if (value === null) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new ApiHttpError(400, 'REMOTE_API_QUERY_VALUE_INVALID');
  }
  return parsed;
}

function parseOptionalPort(value: string | null): number | undefined {
  if (value === null) {
    return undefined;
  }
  return parseBoundedInteger(value, 1, 1, 65_535);
}

function getHttpErrorStatus(error: unknown): number {
  if (error instanceof ApiHttpError) {
    return error.status;
  }
  const message = toErrorMessage(error);
  if (
    message.includes('REQUIRES')
    || message.includes('REQUIRED')
    || message.includes('INVALID')
    || message.includes('OUT_OF_RANGE')
  ) {
    return 400;
  }
  if (
    message.includes('ALREADY')
    || message.includes('NOT_READY')
    || message.includes('TRANSITION')
    || message.includes('SERVER_STOPPED')
  ) {
    return 409;
  }
  return 500;
}

function getPublicErrorMessage(error: unknown, status: number): string {
  if (status === 500) {
    return 'La operacion no pudo completarse.';
  }
  return toErrorMessage(error);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
