import { describe, expect, it } from 'vitest';
import { requiresUserConfirmation } from '../src/shared/contracts/confirmation-policy';

describe('confirmation policy', () => {
  it('requires confirmation before downloads, server actions, firewall and backups', () => {
    expect(requiresUserConfirmation('steamcmd:install')).toBe(true);
    expect(requiresUserConfirmation('steamcmd:repair')).toBe(true);
    expect(requiresUserConfirmation('server:install')).toBe(true);
    expect(requiresUserConfirmation('server:repair')).toBe(true);
    expect(requiresUserConfirmation('server:restart')).toBe(true);
    expect(requiresUserConfirmation('server:stop-query-port-owner')).toBe(true);
    expect(requiresUserConfirmation('admin:execute-action')).toBe(true);
    expect(requiresUserConfirmation('config:restore-default')).toBe(true);
    expect(requiresUserConfirmation('firewall:create-rule')).toBe(true);
    expect(requiresUserConfirmation('backup:create-configuration')).toBe(true);
    expect(requiresUserConfirmation('backup:create-world')).toBe(true);
    expect(requiresUserConfirmation('backup:restore')).toBe(true);
  });

  it('allows read-only diagnostics without confirmation', () => {
    expect(requiresUserConfirmation('app:get-status')).toBe(false);
    expect(requiresUserConfirmation('firewall:get-status')).toBe(false);
    expect(requiresUserConfirmation('network:get-local-addresses')).toBe(false);
    expect(requiresUserConfirmation('network:get-public-address')).toBe(false);
  });

  it('does not require a second confirmation to cancel an active operation', () => {
    expect(requiresUserConfirmation('operation:cancel')).toBe(false);
  });
});
