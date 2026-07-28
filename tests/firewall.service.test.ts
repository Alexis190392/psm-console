import { describe, expect, it } from 'vitest';
import {
  buildElevatedPowerShellLauncher,
  buildFirewallCheckScript,
  createFirewallCheckErrorMessage,
  findExternalPlayerConnection,
  resolveFirewallPortRequirements
} from '../src/backend/firewall/firewall.service';

describe('FirewallService', () => {
  it('does not include REST API as a network/firewall requirement', () => {
    const requirements = resolveFirewallPortRequirements(
      'OptionSettings=(PublicPort=8211,RCONEnabled=True,RCONPort=25575,RESTAPIEnabled=True,RESTAPIPort=8212)'
    );
    const keys = requirements.map((port) => port.key);

    expect(keys).toEqual(['PublicPort', 'RCONPort']);
    expect(keys).not.toContain('RESTAPIPort');
  });

  it('uses the native Firewall COM API without privileged NetSecurity cmdlets', () => {
    const requirements = resolveFirewallPortRequirements(
      'OptionSettings=(PublicPort=8211,RCONEnabled=True,RCONPort=25575)'
    );
    const script = buildFirewallCheckScript(requirements, 'D:\\PalCM\\server\\PalServer.exe');

    expect(script).toContain('New-Object -ComObject HNetCfg.FwPolicy2');
    expect(script).toContain('if ([int]$rule.Protocol -ne [int]$requirement.protocolNumber)');
    expect(script).toContain('"protocolNumber":17');
    expect(script).toContain('"protocolNumber":6');
    expect(script).not.toContain('Get-NetFirewallRule');
    expect(script).not.toContain('Get-NetFirewallPortFilter');
  });

  it('escapes the executable path embedded in the PowerShell query', () => {
    const requirements = resolveFirewallPortRequirements('OptionSettings=(PublicPort=8211)');
    const script = buildFirewallCheckScript(requirements, "D:\\Alexis' Server\\PalServer.exe");

    expect(script).toContain("D:\\Alexis'' Server\\PalServer.exe");
  });

  it('returns a recoverable message when the PowerShell query times out', () => {
    expect(createFirewallCheckErrorMessage({ killed: true })).toBe(
      'Windows Firewall no respondio dentro de 8 segundos. Reintenta el diagnostico.'
    );
  });

  it('keeps UAC elevation visible but hides the PowerShell console afterwards', () => {
    const launcher = buildElevatedPowerShellLauncher('Write-Output "test"');

    expect(launcher).toContain('-Verb RunAs');
    expect(launcher).toContain('-WindowStyle Hidden');
    expect(launcher).toContain("'-WindowStyle','Hidden'");
  });

  it('confirms public access from an external connected player', () => {
    expect(findExternalPlayerConnection(
      [{ name: 'Remoto', ip: '198.51.100.25' }],
      ['192.168.0.100'],
      '2026-07-28T15:00:00.000Z'
    )).toEqual(expect.objectContaining({
      source: 'REMOTE_PLAYER',
      observedAt: '2026-07-28T15:00:00.000Z'
    }));
  });

  it('does not treat LAN, loopback or VPN addresses as public evidence', () => {
    expect(findExternalPlayerConnection(
      [
        { name: 'LAN', ip: '192.168.0.50' },
        { name: 'Local', ip: '127.0.0.1' },
        { name: 'VPN', ip: '100.100.20.30' }
      ],
      ['192.168.0.100']
    )).toBeUndefined();
  });
});
