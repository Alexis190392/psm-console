import { Injectable, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import {
  createServer,
  get as httpGet,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from 'node:http';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { APP_INFO } from '../../shared/constants/app-info';
import type {
  RemoteApiConnectionDto,
  RemoteApiLoginResultDto,
  RemoteApiPermission,
  RemoteApiProfile,
  RemoteApiProfileStatusDto,
  RemoteApiStatusDto,
  RemoteApiUpdateRequestDto
} from '../../shared/dto/remote-api.dto';
import type { NetworkDiagnosticsDto } from '../../shared/dto/network-diagnostics.dto';
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
import type {
  StoredRemoteApiSettings
} from './remote-api-settings.types';

const API_PREFIX = '/api/v1';
const MAX_BODY_BYTES = 64 * 1024;
const LOGIN_WINDOW_MS = 5 * 60 * 1000;
const LOGIN_LOCK_MS = 30 * 1000;
const MAX_LOGIN_FAILURES = 5;
const CONNECTION_PROBE_DELAY_MS = 450;
const CONNECTION_PROBE_TIMEOUT_MS = 1_500;
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
  profile: RemoteApiProfile;
  permissions: RemoteApiPermission[];
}

interface LoginAttempt {
  failures: number;
  windowStartedAt: number;
  lockedUntil: number;
}

interface ProfileRuntime {
  state: RemoteApiProfileStatusDto['state'];
  message: string;
  endpoint?: string;
  updatedAt: string;
}

@Injectable()
export class RemoteApiService implements OnApplicationBootstrap, OnApplicationShutdown {
  private server: Server | null = null;
  private readonly runtimes: Record<RemoteApiProfile, ProfileRuntime> = {
    ADMIN: createDisabledRuntime('API administrativa deshabilitada.'),
    CLIENT: createDisabledRuntime('API cliente deshabilitada.')
  };
  private readonly sessions = new Map<string, ApiSession>();
  private readonly loginAttempts = new Map<string, LoginAttempt>();
  private connections: RemoteApiConnectionDto[] = [];
  private connectionProbeVersion = 0;
  private externalAccessConfirmed = false;

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
    await this.stopAll();
  }

  async getStatus(): Promise<RemoteApiStatusDto> {
    const settings = await this.appSettingsService.read();
    const admin = this.toProfileStatus('ADMIN', settings.remoteApi);
    const client = this.toProfileStatus('CLIENT', settings.remoteApi.client);
    return {
      settings: settings.remoteApi,
      state: admin.state,
      ...(admin.endpoint ? { endpoint: admin.endpoint } : {}),
      message: admin.message,
      updatedAt: admin.updatedAt,
      client,
      connections: this.connections.map((connection) => ({ ...connection }))
    };
  }

  async update(request: RemoteApiUpdateRequestDto): Promise<RemoteApiStatusDto> {
    await this.appSettingsService.updateRemoteApi(request);
    await this.applyCurrentSettings();
    return this.getStatus();
  }

  private async applyCurrentSettings(): Promise<void> {
    await this.stopAll();
    const settings = await this.appSettingsService.getRemoteApiSettings();
    if (!settings.enabled) {
      this.setState('ADMIN', 'DISABLED', 'API administrativa deshabilitada.');
    }
    if (!settings.client.enabled) {
      this.setState('CLIENT', 'DISABLED', 'API cliente deshabilitada.');
    }
    if (settings.enabled || settings.client.enabled) {
      await this.start(settings);
    }
  }

  private async start(settings: StoredRemoteApiSettings): Promise<void> {
    const enabledProfiles = getEnabledProfiles(settings);
    enabledProfiles.forEach((profile) => {
      this.setState(profile, 'STARTING', 'Iniciando API web compartida.');
    });
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
      const localAddresses = this.networkService.getLocalAddresses();
      const lanAddress = selectPreferredLanAddress(localAddresses);
      const endpoint = createEndpoint(settings, lanAddress);
      this.connections = createInitialConnections(settings, lanAddress);
      const probeVersion = ++this.connectionProbeVersion;
      enabledProfiles.forEach((profile) => {
        this.runtimes[profile].endpoint = endpoint;
        this.setState(
          profile,
          'RUNNING',
          `${profile === 'ADMIN' ? 'API administrativa' : 'API cliente'} disponible en ${endpoint}.`
        );
      });
      void this.loggingService.write('api', 'INFO', `API web compartida disponible en ${endpoint}.`);
      void this.verifyConnectionsSequentially(settings, lanAddress, probeVersion);
    } catch (error) {
      server.close();
      this.server = null;
      enabledProfiles.forEach((profile) => {
        this.runtimes[profile].endpoint = undefined;
        this.setState(profile, 'ERROR', `No se pudo iniciar la API web: ${toErrorMessage(error)}`);
      });
      void this.loggingService.write(
        'api',
        'ERROR',
        `No se pudo iniciar la API web: ${toErrorMessage(error)}`
      );
    }
  }

  private async stopAll(): Promise<void> {
    this.connectionProbeVersion += 1;
    this.connections = [];
    this.externalAccessConfirmed = false;
    this.sessions.clear();
    this.loginAttempts.clear();
    const server = this.server;
    this.server = null;
    (['ADMIN', 'CLIENT'] as const).forEach((profile) => {
      this.runtimes[profile].endpoint = undefined;
    });
    if (!server) {
      return;
    }

    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
      server.closeAllConnections();
    });
    void this.loggingService.write('api', 'INFO', 'API web compartida detenida.');
  }

  private async handleRequest(
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> {
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
          api: 'RUNNING',
          profiles: {
            admin: this.runtimes.ADMIN.state === 'RUNNING',
            client: this.runtimes.CLIENT.state === 'RUNNING'
          },
          updatedAt: new Date().toISOString()
        });
        return;
      }

      if (method === 'POST' && requestUrl.pathname === `${API_PREFIX}/auth/login`) {
        await this.login(request, response);
        return;
      }

      const { token, session } = this.requireSession(request);
      if (method === 'POST' && requestUrl.pathname === `${API_PREFIX}/auth/logout`) {
        this.sessions.delete(token);
        sendJson(response, 200, { status: 'ok' });
        return;
      }

      if (method === 'GET' && requestUrl.pathname === `${API_PREFIX}/session`) {
        sendJson(response, 200, {
          profile: session.profile,
          permissions: session.permissions
        });
        return;
      }

      await this.routeAuthenticated(session, method, requestUrl, request, response);
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
    session: ApiSession,
    method: string,
    requestUrl: URL,
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> {
    const path = requestUrl.pathname;

    if (method === 'GET' && path === `${API_PREFIX}/status`) {
      this.requireAnyPermission(session, [
        'GENERAL',
        'SERVER_START',
        'SERVER_RESTART',
        'SERVER_STOP'
      ]);
      sendJson(response, 200, {
        application: this.applicationStateService.getStatus(),
        actions: this.applicationStateService.getAllowedActions(),
        server: this.palworldProcessService.getRuntimeStatus()
      });
      return;
    }
    if (method === 'GET' && path === `${API_PREFIX}/server`) {
      this.requireAnyPermission(session, [
        'GENERAL',
        'SERVER_START',
        'SERVER_RESTART',
        'SERVER_STOP'
      ]);
      sendJson(response, 200, this.palworldProcessService.getRuntimeStatus());
      return;
    }
    if (method === 'POST' && path === `${API_PREFIX}/server/start`) {
      this.requirePermission(session, 'SERVER_START');
      sendJson(response, 202, this.palworldProcessService.start({ confirmed: true }));
      this.logMutation('Inicio de servidor solicitado desde API web.');
      return;
    }
    if (method === 'POST' && path === `${API_PREFIX}/server/stop`) {
      this.requirePermission(session, 'SERVER_STOP');
      sendJson(response, 202, this.palworldProcessService.stop({ confirmed: true }));
      this.logMutation('Detencion de servidor solicitada desde API web.');
      return;
    }
    if (method === 'POST' && path === `${API_PREFIX}/server/restart`) {
      this.requirePermission(session, 'SERVER_RESTART');
      sendJson(response, 202, this.palworldProcessService.restart({ confirmed: true }));
      this.logMutation('Reinicio de servidor solicitado desde API web.');
      return;
    }
    if (method === 'GET' && path === `${API_PREFIX}/players`) {
      this.requireAnyPermission(session, [
        'PLAYERS_VIEW',
        'PLAYERS_KICK',
        'PLAYERS_BAN'
      ]);
      sendJson(response, 200, await this.palworldPlayersService.getStatus());
      return;
    }
    if (method === 'GET' && path === `${API_PREFIX}/admin`) {
      this.requireAdmin(session);
      sendJson(response, 200, await this.palworldAdminService.getStatus());
      return;
    }
    if (method === 'POST' && path === `${API_PREFIX}/admin/actions`) {
      const body = await readJsonBody(request);
      const action = requireString(body, 'action') as
        | 'announce'
        | 'save'
        | 'kick'
        | 'ban'
        | 'unban'
        | 'shutdown'
        | 'stop';
      if (action === 'kick') {
        this.requirePermission(session, 'PLAYERS_KICK');
      } else if (action === 'ban') {
        this.requirePermission(session, 'PLAYERS_BAN');
      } else {
        this.requireAdmin(session);
      }
      sendJson(response, 200, await this.palworldAdminService.execute({
        confirmed: true,
        action,
        ...(optionalString(body, 'message') ? { message: optionalString(body, 'message') } : {}),
        ...(optionalString(body, 'userId') ? { userId: optionalString(body, 'userId') } : {}),
        ...(typeof body['seconds'] === 'number' ? { seconds: body['seconds'] } : {})
      }));
      this.logMutation(`Accion administrativa ${String(body['action'])} ejecutada desde API web.`);
      return;
    }
    if (method === 'GET' && path === `${API_PREFIX}/configuration`) {
      this.requireAdmin(session);
      sendJson(response, 200, await this.palworldConfigurationService.readActive());
      return;
    }
    if (method === 'PUT' && path === `${API_PREFIX}/configuration`) {
      this.requireAdmin(session);
      const body = await readJsonBody(request);
      sendJson(response, 202, this.palworldConfigurationService.saveActive({
        confirmed: true,
        content: requireString(body, 'content')
      }));
      this.logMutation('Configuracion del servidor guardada desde API web.');
      return;
    }
    if (method === 'POST' && path === `${API_PREFIX}/configuration/default`) {
      this.requireAdmin(session);
      sendJson(response, 202, this.palworldConfigurationService.restoreDefault({ confirmed: true }));
      this.logMutation('Restauracion de configuracion solicitada desde API web.');
      return;
    }
    if (method === 'GET' && path === `${API_PREFIX}/backups`) {
      this.requireAdmin(session);
      sendJson(response, 200, await this.backupService.getSummary());
      return;
    }
    if (method === 'POST' && path === `${API_PREFIX}/backups/configuration`) {
      this.requireAdmin(session);
      sendJson(response, 202, this.backupService.createConfigurationBackup({ confirmed: true }));
      this.logMutation('Backup de configuracion solicitado desde API web.');
      return;
    }
    if (method === 'POST' && path === `${API_PREFIX}/backups/world`) {
      this.requireAdmin(session);
      sendJson(response, 202, this.backupService.createWorldBackup({ confirmed: true }));
      this.logMutation('Backup del mundo solicitado desde API web.');
      return;
    }
    if (method === 'GET' && path === `${API_PREFIX}/logs`) {
      this.requirePermission(session, 'LOGS');
      const maxLines = parseBoundedInteger(requestUrl.searchParams.get('maxLines'), 200, 1, 1_000);
      sendJson(response, 200, await this.loggingService.readRecent({ maxLines }));
      return;
    }
    if (method === 'GET' && path === `${API_PREFIX}/network/addresses`) {
      this.requireAdmin(session);
      sendJson(response, 200, { addresses: this.networkService.getLocalAddresses() });
      return;
    }
    if (method === 'GET' && path === `${API_PREFIX}/network/public`) {
      this.requireAdmin(session);
      const port = parseOptionalPort(requestUrl.searchParams.get('port'));
      sendJson(response, 200, await this.networkService.getPublicAddress(port ? { port } : undefined));
      return;
    }
    if (method === 'GET' && path.startsWith(`${API_PREFIX}/operations/`)) {
      this.requireAnyPermission(session, ['SERVER_START', 'SERVER_RESTART', 'SERVER_STOP']);
      const operationId = decodeURIComponent(path.slice(`${API_PREFIX}/operations/`.length));
      sendJson(response, 200, this.operationManagerService.get(operationId));
      return;
    }

    throw new ApiHttpError(404, 'API_ROUTE_NOT_FOUND');
  }

  private async login(
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> {
    const clientId = request.socket.remoteAddress ?? 'unknown';
    this.assertLoginAllowed(clientId);
    const body = await readJsonBody(request);
    const username = requireString(body, 'username');
    const password = requireString(body, 'password');
    const settings = await this.appSettingsService.getRemoteApiSettings();
    let profile: RemoteApiProfile | null = null;
    if (
      settings.enabled
      && await this.appSettingsService.verifyRemoteApiCredentials('ADMIN', username, password)
    ) {
      profile = 'ADMIN';
    } else if (
      settings.client.enabled
      && await this.appSettingsService.verifyRemoteApiCredentials('CLIENT', username, password)
    ) {
      profile = 'CLIENT';
    }

    if (!profile) {
      this.registerLoginFailure(clientId);
      void this.loggingService.write('api', 'WARN', `Inicio de sesion rechazado desde ${clientId}.`);
      throw new ApiHttpError(401, 'REMOTE_API_INVALID_CREDENTIALS');
    }

    this.loginAttempts.delete(clientId);
    const token = randomBytes(32).toString('base64url');
    const permissions = profile === 'ADMIN'
      ? allRemoteApiPermissions()
      : [...settings.client.permissions];
    this.sessions.set(token, { profile, permissions });
    const result: RemoteApiLoginResultDto = {
      token,
      expiresAt: null,
      profile,
      permissions
    };
    sendJson(response, 200, result);
    void this.loggingService.write('api', 'INFO', `Sesion API iniciada desde ${clientId}.`);
    void this.confirmExternalAccess(clientId, settings);
  }

  private requireSession(
    request: IncomingMessage
  ): { token: string; session: ApiSession } {
    const authorization = request.headers.authorization ?? '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    const session = this.sessions.get(token);
    if (!token || !session) {
      throw new ApiHttpError(401, 'REMOTE_API_AUTHENTICATION_REQUIRED');
    }
    return { token, session };
  }

  private async verifyConnectionsSequentially(
    settings: Pick<StoredRemoteApiSettings, 'bindMode' | 'port'>,
    lanAddress: string | undefined,
    probeVersion: number
  ): Promise<void> {
    await delay(CONNECTION_PROBE_DELAY_MS);
    if (!this.isCurrentConnectionProbe(probeVersion)) {
      return;
    }

    const loopbackAvailable = await probeApiHealth(createApiEndpoint('127.0.0.1', settings.port));
    if (!this.isCurrentConnectionProbe(probeVersion)) {
      return;
    }
    this.replaceConnection(createVerifiedConnection(
      'LOOPBACK',
      'Este equipo',
      createApiEndpoint('127.0.0.1', settings.port),
      loopbackAvailable,
      'Disponible mientras PSM Console permanezca abierta.',
      'La API no responde desde este equipo.'
    ));

    if (!loopbackAvailable || settings.bindMode !== 'LOCAL_NETWORK') {
      return;
    }

    if (!lanAddress) {
      this.replaceConnection({
        kind: 'LAN',
        label: 'Red local',
        state: 'UNKNOWN',
        message: 'No se detecto una direccion IPv4 de red local.'
      });
      return;
    }

    this.replaceConnection({
      kind: 'LAN',
      label: 'Red local',
      endpoint: createApiEndpoint(lanAddress, settings.port),
      state: 'CHECKING',
      message: 'Comprobando acceso desde la direccion de red local.'
    });
    await delay(CONNECTION_PROBE_DELAY_MS);
    if (!this.isCurrentConnectionProbe(probeVersion)) {
      return;
    }
    const lanAvailable = await probeApiHealth(createApiEndpoint(lanAddress, settings.port));
    if (!this.isCurrentConnectionProbe(probeVersion)) {
      return;
    }
    this.replaceConnection(createVerifiedConnection(
      'LAN',
      'Red local',
      createApiEndpoint(lanAddress, settings.port),
      lanAvailable,
      'Disponible para equipos de la misma red.',
      'La API no responde mediante la direccion de red local.'
    ));

    if (!lanAvailable) {
      return;
    }

    this.replaceConnection({
      kind: 'PUBLIC',
      label: 'Internet',
      state: 'CHECKING',
      message: 'Comprobando IP publica y acceso TCP desde Internet.'
    });
    await this.refreshPublicConnection(settings.port, probeVersion);
  }

  private async refreshPublicConnection(port: number, probeVersion: number): Promise<void> {
    try {
      const diagnostics = await this.networkService.getPublicAddress({ port });
      if (probeVersion !== this.connectionProbeVersion || !this.server) {
        return;
      }
      if (this.externalAccessConfirmed) {
        return;
      }
      this.replacePublicConnection(createPublicConnection(diagnostics, port));
    } catch {
      if (probeVersion !== this.connectionProbeVersion || !this.server) {
        return;
      }
      if (this.externalAccessConfirmed) {
        return;
      }
      this.replacePublicConnection({
        kind: 'PUBLIC',
        label: 'Internet',
        state: 'UNKNOWN',
        message: 'No se pudo comprobar el acceso desde Internet.'
      });
    }
  }

  private async confirmExternalAccess(
    clientAddress: string,
    settings: Pick<StoredRemoteApiSettings, 'bindMode' | 'port'>
  ): Promise<void> {
    if (
      settings.bindMode !== 'LOCAL_NETWORK'
      || !isExternalRemoteAddress(clientAddress, this.networkService.getLocalAddresses())
      || !this.server
    ) {
      return;
    }

    this.externalAccessConfirmed = true;
    const probeVersion = this.connectionProbeVersion;
    const currentConnection = this.connections.find((connection) => connection.kind === 'PUBLIC');
    let endpoint = currentConnection?.endpoint;
    if (!endpoint) {
      try {
        const diagnostics = await this.networkService.getPublicAddress();
        endpoint = diagnostics.publicIp
          ? createApiEndpoint(diagnostics.publicIp, settings.port)
          : undefined;
      } catch {
        endpoint = undefined;
      }
    }
    if (!this.isCurrentConnectionProbe(probeVersion)) {
      return;
    }

    this.replacePublicConnection({
      kind: 'PUBLIC',
      label: 'Internet',
      ...(endpoint ? { endpoint } : {}),
      state: 'AVAILABLE',
      message: 'Acceso confirmado por una sesion autenticada desde Internet.'
    });
    void this.loggingService.write(
      'api',
      'INFO',
      'Acceso publico confirmado por una sesion autenticada desde Internet.'
    );
  }

  private replacePublicConnection(connection: RemoteApiConnectionDto): void {
    this.replaceConnection(connection);
  }

  private replaceConnection(connection: RemoteApiConnectionDto): void {
    this.connections = this.connections.map((item) =>
      item.kind === connection.kind ? connection : item
    );
  }

  private isCurrentConnectionProbe(probeVersion: number): boolean {
    return probeVersion === this.connectionProbeVersion && this.server !== null;
  }

  private requirePermission(session: ApiSession, permission: RemoteApiPermission): void {
    if (session.profile !== 'ADMIN' && !session.permissions.includes(permission)) {
      throw new ApiHttpError(403, 'REMOTE_API_PERMISSION_DENIED');
    }
  }

  private requireAdmin(session: ApiSession): void {
    if (session.profile !== 'ADMIN') {
      throw new ApiHttpError(403, 'REMOTE_API_ADMIN_REQUIRED');
    }
  }

  private requireAnyPermission(session: ApiSession, permissions: RemoteApiPermission[]): void {
    if (
      session.profile !== 'ADMIN'
      && !permissions.some((permission) => session.permissions.includes(permission))
    ) {
      throw new ApiHttpError(403, 'REMOTE_API_PERMISSION_DENIED');
    }
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

  private setState(
    profile: RemoteApiProfile,
    state: RemoteApiProfileStatusDto['state'],
    message: string
  ): void {
    const runtime = this.runtimes[profile];
    runtime.state = state;
    runtime.message = message;
    runtime.updatedAt = new Date().toISOString();
  }

  private toProfileStatus(
    profile: RemoteApiProfile,
    settings: RemoteApiProfileStatusDto['settings']
  ): RemoteApiProfileStatusDto {
    const runtime = this.runtimes[profile];
    return {
      settings,
      state: runtime.state,
      ...(runtime.endpoint ? { endpoint: runtime.endpoint } : {}),
      message: runtime.message,
      updatedAt: runtime.updatedAt
    };
  }
}

class ApiHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function createDisabledRuntime(message: string): ProfileRuntime {
  return {
    state: 'DISABLED',
    message,
    updatedAt: new Date().toISOString()
  };
}

function getEnabledProfiles(settings: StoredRemoteApiSettings): RemoteApiProfile[] {
  return [
    ...(settings.enabled ? ['ADMIN' as const] : []),
    ...(settings.client.enabled ? ['CLIENT' as const] : [])
  ];
}

function allRemoteApiPermissions(): RemoteApiPermission[] {
  return [
    'GENERAL',
    'SERVER_START',
    'SERVER_RESTART',
    'SERVER_STOP',
    'PLAYERS_VIEW',
    'PLAYERS_KICK',
    'PLAYERS_BAN',
    'LOGS'
  ];
}

function createEndpoint(
  settings: Pick<StoredRemoteApiSettings, 'bindMode' | 'port'>,
  lanAddress: string | undefined
): string {
  const host = settings.bindMode === 'LOCAL_ONLY'
    ? '127.0.0.1'
    : lanAddress ?? '127.0.0.1';
  return `http://${host}:${String(settings.port)}/api/v1`;
}

function createInitialConnections(
  settings: Pick<StoredRemoteApiSettings, 'bindMode' | 'port'>,
  lanAddress: string | undefined
): RemoteApiConnectionDto[] {
  const loopback: RemoteApiConnectionDto = {
    kind: 'LOOPBACK',
    label: 'Este equipo',
    endpoint: createApiEndpoint('127.0.0.1', settings.port),
    state: 'CHECKING',
    message: 'Comprobando acceso desde este equipo.'
  };
  const lan: RemoteApiConnectionDto = lanAddress
    ? {
        kind: 'LAN',
        label: 'Red local',
        endpoint: createApiEndpoint(lanAddress, settings.port),
        state: settings.bindMode === 'LOCAL_NETWORK' ? 'UNKNOWN' : 'DISABLED',
        message: settings.bindMode === 'LOCAL_NETWORK'
          ? 'Esperando la verificacion de este equipo.'
          : 'Activa el acceso de red local para habilitar esta direccion.'
      }
    : {
        kind: 'LAN',
        label: 'Red local',
        state: 'UNKNOWN',
        message: 'No se detecto una direccion IPv4 de red local.'
      };
  const publicConnection: RemoteApiConnectionDto = settings.bindMode === 'LOCAL_NETWORK'
    ? {
        kind: 'PUBLIC',
        label: 'Internet',
        state: 'UNKNOWN',
        message: 'Esperando la verificacion de la red local.'
      }
    : {
        kind: 'PUBLIC',
        label: 'Internet',
        state: 'DISABLED',
        message: 'La API esta limitada a este equipo y no se expone a Internet.'
      };

  return [loopback, lan, publicConnection];
}

export function selectPreferredLanAddress(addresses: string[]): string | undefined {
  return [...new Set(addresses)]
    .filter((address) => /^\d{1,3}(\.\d{1,3}){3}$/.test(address))
    .sort((left, right) => getLanAddressPriority(left) - getLanAddressPriority(right))[0];
}

export function isExternalRemoteAddress(address: string, localAddresses: string[] = []): boolean {
  const normalized = normalizeRemoteAddress(address);
  if (!normalized) {
    return false;
  }
  if (localAddresses.map(normalizeRemoteAddress).includes(normalized)) {
    return false;
  }

  const ipv4 = normalized.split('.').map(Number);
  if (ipv4.length === 4 && ipv4.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    const [first = -1, second = -1] = ipv4;
    return !(
      first === 0
      || first === 10
      || first === 127
      || (first === 169 && second === 254)
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 168)
      || (first === 100 && second >= 64 && second <= 127)
      || first >= 224
    );
  }

  return normalized.includes(':')
    && normalized !== '::1'
    && !normalized.startsWith('fe80:')
    && !normalized.startsWith('fc')
    && !normalized.startsWith('fd');
}

function normalizeRemoteAddress(address: string): string {
  const normalized = address.trim().toLowerCase().split('%')[0] ?? '';
  return normalized.startsWith('::ffff:') ? normalized.slice(7) : normalized;
}

function getLanAddressPriority(address: string): number {
  const [first, second] = address.split('.').map(Number);
  if (first === 192 && second === 168) {
    return 0;
  }
  if (first === 10) {
    return 1;
  }
  if (first === 172 && second !== undefined && second >= 16 && second <= 31) {
    return 2;
  }
  if (first === 127) {
    return 3;
  }
  if (first === 169 && second === 254) {
    return 5;
  }
  if (first === 100 && second !== undefined && second >= 64 && second <= 127) {
    return 6;
  }
  return 4;
}

function createVerifiedConnection(
  kind: 'LOOPBACK' | 'LAN',
  label: string,
  endpoint: string,
  available: boolean,
  availableMessage: string,
  unavailableMessage: string
): RemoteApiConnectionDto {
  return {
    kind,
    label,
    endpoint,
    state: available ? 'AVAILABLE' : 'UNAVAILABLE',
    message: available ? availableMessage : unavailableMessage
  };
}

async function probeApiHealth(endpoint: string): Promise<boolean> {
  const url = new URL(`${endpoint}/health`);
  return new Promise((resolve) => {
    const request = httpGet(url, { timeout: CONNECTION_PROBE_TIMEOUT_MS }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });
    request.on('error', () => {
      resolve(false);
    });
  });
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function createPublicConnection(
  diagnostics: NetworkDiagnosticsDto,
  port: number
): RemoteApiConnectionDto {
  const endpoint = diagnostics.publicIp
    ? createApiEndpoint(diagnostics.publicIp, port)
    : undefined;
  const tcpState = diagnostics.publicPortProbe?.tcp;

  if (tcpState === 'OPEN') {
    return {
      kind: 'PUBLIC',
      label: 'Internet',
      ...(endpoint ? { endpoint } : {}),
      state: 'AVAILABLE',
      message: 'El puerto TCP responde desde Internet.'
    };
  }

  if (tcpState === 'CLOSED') {
    return {
      kind: 'PUBLIC',
      label: 'Internet',
      ...(endpoint ? { endpoint } : {}),
      state: 'UNAVAILABLE',
      message: 'El puerto TCP no responde desde Internet. Revisa el router o el proveedor.'
    };
  }

  return {
    kind: 'PUBLIC',
    label: 'Internet',
    ...(endpoint ? { endpoint } : {}),
    state: 'UNKNOWN',
    message: endpoint
      ? 'IP publica detectada, pero no se pudo confirmar el acceso al puerto.'
      : 'No se pudo obtener la IP publica.'
  };
}

function createApiEndpoint(host: string, port: number): string {
  return `http://${host}:${String(port)}/api/v1`;
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
