import { Injectable } from '@nestjs/common';
import { networkInterfaces } from 'node:os';
import { get } from 'node:https';
import { get as httpGet } from 'node:http';
import type {
  NetworkDiagnosticsDto,
  PublicAddressRequestDto,
  PublicPortProbeDto,
  PublicPortProbeState
} from '../../shared/dto/network-diagnostics.dto';

const PUBLIC_IP_CACHE_MS = 60_000;
const PUBLIC_IP_TIMEOUT_MS = 900;
const PUBLIC_IP_ENDPOINTS = [
  {
    url: 'https://api.ipify.org',
    parser: (body: string) => body.trim()
  },
  {
    url: 'https://icanhazip.com',
    parser: (body: string) => body.trim()
  },
  {
    url: 'https://www.cloudflare.com/cdn-cgi/trace',
    parser: (body: string) => body
      .split('\n')
      .find((line) => line.startsWith('ip='))
      ?.slice(3)
      .trim() ?? ''
  }
];
const PUBLIC_PORT_PROBE_TIMEOUT_MS = 3_600;

let publicIpCache: { ip: string; expiresAt: number } | null = null;

@Injectable()
export class NetworkService {
  getLocalAddresses(): string[] {
    return getLocalIpv4Addresses();
  }

  async getPublicAddress(request: PublicAddressRequestDto = {}): Promise<NetworkDiagnosticsDto> {
    const localIpv4 = getLocalIpv4Addresses();
    const publicIp = await getPublicIp().catch(() => null);
    const cgnatStatus = resolveCgnatStatus(publicIp, localIpv4);
    const publicPortProbe = publicIp && request.port
      ? await checkPublicPort(publicIp, request.port).catch(() => undefined)
      : undefined;

    return {
      publicIp,
      localIpv4,
      cgnatStatus,
      ...(publicPortProbe ? { publicPortProbe } : {}),
      message: createCgnatMessage(cgnatStatus),
      recommendation: createCgnatRecommendation(cgnatStatus, publicIp),
      updatedAt: new Date().toISOString()
    };
  }

  async getDiagnostics(): Promise<NetworkDiagnosticsDto> {
    const localIpv4 = getLocalIpv4Addresses();
    const publicIp = await getPublicIp().catch(() => null);
    const cgnatStatus = resolveCgnatStatus(publicIp, localIpv4);

    return {
      publicIp,
      localIpv4,
      cgnatStatus,
      message: createCgnatMessage(cgnatStatus),
      recommendation: createCgnatRecommendation(cgnatStatus, publicIp),
      updatedAt: new Date().toISOString()
    };
  }
}

function getLocalIpv4Addresses(): string[] {
  return Object.values(networkInterfaces())
    .flatMap((networkInterface) => networkInterface ?? [])
    .filter((address) => address.family === 'IPv4' && !address.internal)
    .map((address) => address.address);
}

async function getPublicIp(): Promise<string> {
  if (publicIpCache && publicIpCache.expiresAt > Date.now()) {
    return publicIpCache.ip;
  }

  const ip = await Promise.any(
    PUBLIC_IP_ENDPOINTS.map((endpoint) =>
      getPublicIpFromEndpoint(endpoint.url, endpoint.parser)
    )
  );
  publicIpCache = {
    ip,
    expiresAt: Date.now() + PUBLIC_IP_CACHE_MS
  };

  return ip;
}

async function getPublicIpFromEndpoint(url: string, parser: (body: string) => string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = get(url, { timeout: PUBLIC_IP_TIMEOUT_MS }, (response) => {
      let body = '';

      response.setEncoding('utf8');
      response.on('data', (chunk: string) => {
        body += chunk;
      });
      response.on('end', () => {
        const ip = parser(body);

        if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
          resolve(ip);
          return;
        }

        reject(new Error('PUBLIC_IP_INVALID_RESPONSE'));
      });
    });

    request.on('timeout', () => {
      request.destroy(new Error('PUBLIC_IP_TIMEOUT'));
    });
    request.on('error', reject);
  });
}

async function checkPublicPort(publicIp: string, port: number): Promise<PublicPortProbeDto> {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PUBLIC_PORT_INVALID');
  }

  const query = `http://starrupture-utilities.com/port_check/index.php?ip=${encodeURIComponent(publicIp)}&port=${String(port)}&format=json`;
  const response = await getJson(query, PUBLIC_PORT_PROBE_TIMEOUT_MS);
  const tcp = parseProbeState(response, 'tcp');
  const udp = parseProbeState(response, 'udp');

  return {
    port,
    tcp,
    udp,
    provider: 'starrupture-utilities',
    checkedAt: new Date().toISOString(),
    message: createPublicPortProbeMessage(udp, tcp)
  };
}

async function getJson(url: string, timeoutMs: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = httpGet(url, { timeout: timeoutMs }, (response) => {
      let body = '';

      response.setEncoding('utf8');
      response.on('data', (chunk: string) => {
        body += chunk;
      });
      response.on('end', () => {
        try {
          resolve(JSON.parse(body) as unknown);
        } catch {
          reject(new Error('PUBLIC_PORT_INVALID_RESPONSE'));
        }
      });
    });

    request.on('timeout', () => {
      request.destroy(new Error('PUBLIC_PORT_TIMEOUT'));
    });
    request.on('error', reject);
  });
}

function parseProbeState(response: unknown, protocol: 'tcp' | 'udp'): PublicPortProbeState {
  const values = collectProtocolValues(response, protocol);

  if (values.some((value) => ['open', 'opened', 'true', 'reachable', 'success'].includes(value))) {
    return 'OPEN';
  }

  if (values.some((value) => ['closed', 'close', 'false', 'refused'].includes(value))) {
    return 'CLOSED';
  }

  if (values.some((value) => ['filtered', 'timeout', 'timed_out', 'inconclusive', 'unknown'].includes(value))) {
    return 'FILTERED';
  }

  return 'UNKNOWN';
}

function collectProtocolValues(value: unknown, protocol: 'tcp' | 'udp'): string[] {
  if (value === null || value === undefined) {
    return [];
  }

  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return [String(value).trim().toLowerCase()];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectProtocolValues(item, protocol));
  }

  if (typeof value === 'object') {
    return Object.entries(value).flatMap(([key, nested]) => {
      const normalizedKey = key.toLowerCase();

      if (normalizedKey === protocol || normalizedKey.includes(protocol)) {
        return collectProtocolValues(nested, protocol);
      }

      return [];
    });
  }

  return [];
}

function createPublicPortProbeMessage(udp: PublicPortProbeState, tcp: PublicPortProbeState): string {
  if (udp === 'OPEN') {
    return 'UDP abierto desde Internet. El puerto publico responde desde una red externa.';
  }

  if (udp === 'CLOSED') {
    return 'UDP cerrado desde Internet. Revisa servidor, firewall, router, NAT o CGNAT.';
  }

  if (tcp === 'OPEN') {
    return 'TCP abierto, pero Palworld usa UDP para jugadores. Revisa especificamente UDP.';
  }

  return 'UDP no confirmado desde Internet. En UDP esto puede ser inconcluso si el servidor no responde a la sonda.';
}

function resolveCgnatStatus(publicIp: string | null, localIpv4: string[]): NetworkDiagnosticsDto['cgnatStatus'] {
  if (!publicIp) {
    return 'UNKNOWN';
  }

  if (isCgnatRange(publicIp)) {
    return 'LIKELY';
  }

  if (localIpv4.includes(publicIp)) {
    return 'UNLIKELY';
  }

  return 'NEEDS_ROUTER_CHECK';
}

function createCgnatMessage(status: NetworkDiagnosticsDto['cgnatStatus']): string {
  if (status === 'LIKELY') {
    return 'La IP publica detectada pertenece a un rango compatible con CGNAT.';
  }

  if (status === 'UNLIKELY') {
    return 'La IP publica coincide con una IP local de este equipo.';
  }

  if (status === 'NEEDS_ROUTER_CHECK') {
    return 'No se puede confirmar CGNAT desde la PC sin ver la IP WAN del router.';
  }

  return 'No se pudo obtener la IP publica para evaluar CGNAT.';
}

function createCgnatRecommendation(status: NetworkDiagnosticsDto['cgnatStatus'], publicIp: string | null): string {
  if (status === 'LIKELY') {
    return 'Pedi al ISP una IP publica dinamica sin CGNAT. Es la alternativa con menor impacto en ping.';
  }

  if (status === 'UNLIKELY') {
    return 'Si el puerto externo falla, revisar port forwarding o el perfil de red/firewall.';
  }

  if (status === 'NEEDS_ROUTER_CHECK') {
    return `Compara la IP WAN que muestra el router con ${publicIp ?? 'la IP publica detectada'}. Si son distintas, hay CGNAT o doble NAT.`;
  }

  return 'Reintenta con Internet disponible o consulta tu IP publica desde otra herramienta.';
}

function isCgnatRange(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  const first = parts[0];
  const second = parts[1];

  return first === 100 && typeof second === 'number' && second >= 64 && second <= 127;
}
