import { describe, expect, it } from 'vitest';
import { FirewallService } from '../src/backend/firewall/firewall.service';
import type { NetworkDiagnosticsDto } from '../src/shared/dto/network-diagnostics.dto';

function createService(configurationContent: string): FirewallService {
  const configurationService = {
    readActive: () => Promise.resolve({
      path: 'PalWorldSettings.ini',
      content: configurationContent
    })
  };
  const installationService = {
    getStatus: () => ({
      status: 'READY',
      executablePath: 'D:\\PalCM\\server\\palworld\\PalServer.exe'
    })
  };
  const operationManager = {
    create: () => ({ operationId: 'operation-1' }),
    update: () => undefined,
    appendLog: () => undefined
  };
  const networkService = {
    getDiagnostics: (): Promise<NetworkDiagnosticsDto> => Promise.resolve({
      publicIp: '200.0.0.10',
      localIpv4: ['192.168.0.10'],
      cgnatStatus: 'NEEDS_ROUTER_CHECK',
      message: 'Diagnostico de red simulado.',
      recommendation: 'Sin recomendacion para el test.',
      updatedAt: new Date(0).toISOString()
    })
  };

  return new FirewallService(
    configurationService as never,
    installationService as never,
    operationManager as never,
    networkService as never
  );
}

describe('FirewallService', () => {
  it('does not include REST API as a network/firewall requirement', async () => {
    const service = createService(
      'OptionSettings=(PublicPort=8211,RCONEnabled=True,RCONPort=25575,RESTAPIEnabled=True,RESTAPIPort=8212)'
    );

    const status = await service.getStatus();
    const localKeys = status.local.ports.map((port) => port.key);
    const externalKeys = status.external.ports.map((port) => port.key);

    expect(localKeys).toEqual(['PublicPort', 'RCONPort']);
    expect(externalKeys).toEqual(['PublicPort', 'RCONPort']);
    expect(localKeys).not.toContain('RESTAPIPort');
    expect(externalKeys).not.toContain('RESTAPIPort');
  });
});
