import { describe, expect, it } from 'vitest';
import {
  buildFirewallCheckScript,
  createFirewallCheckErrorMessage,
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

  it('queries port filters before resolving associated firewall rules', () => {
    const requirements = resolveFirewallPortRequirements(
      'OptionSettings=(PublicPort=8211,RCONEnabled=True,RCONPort=25575)'
    );
    const script = buildFirewallCheckScript(requirements, 'D:\\PalCM\\server\\PalServer.exe');

    expect(script).toContain('Get-NetFirewallPortFilter -Protocol $requirement.protocol');
    expect(script).toContain('Get-NetFirewallRule -AssociatedNetFirewallPortFilter $portFilter');
    expect(script).not.toContain(
      'Get-NetFirewallRule -Direction Inbound -Action Allow -Enabled True'
    );
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
});
