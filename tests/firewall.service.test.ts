import { describe, expect, it } from 'vitest';
import { resolveFirewallPortRequirements } from '../src/backend/firewall/firewall.service';

describe('FirewallService', () => {
  it('does not include REST API as a network/firewall requirement', () => {
    const requirements = resolveFirewallPortRequirements(
      'OptionSettings=(PublicPort=8211,RCONEnabled=True,RCONPort=25575,RESTAPIEnabled=True,RESTAPIPort=8212)'
    );
    const keys = requirements.map((port) => port.key);

    expect(keys).toEqual(['PublicPort', 'RCONPort']);
    expect(keys).not.toContain('RESTAPIPort');
  });
});
