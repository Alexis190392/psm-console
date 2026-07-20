import { Injectable } from '@nestjs/common';
import { networkInterfaces } from 'node:os';
import { get } from 'node:https';
import type { NetworkDiagnosticsDto } from '../../shared/dto/network-diagnostics.dto';

@Injectable()
export class NetworkService {
  getLocalAddresses(): string[] {
    return getLocalIpv4Addresses();
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
  return new Promise((resolve, reject) => {
    const request = get('https://api.ipify.org', { timeout: 1800 }, (response) => {
      let body = '';

      response.setEncoding('utf8');
      response.on('data', (chunk: string) => {
        body += chunk;
      });
      response.on('end', () => {
        const ip = body.trim();

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
