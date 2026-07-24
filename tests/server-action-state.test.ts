import { describe, expect, it } from 'vitest';
import { ApplicationStatus } from '../src/shared/enums/application-status';
import type { AllowedActionsDto } from '../src/shared/dto/allowed-actions.dto';
import { resolveServerActionState } from '../src/renderer/state/server-action-state';

const actions: AllowedActionsDto = {
  canInstallSteamCmd: false,
  canInstallServer: false,
  canEditConfiguration: true,
  canManageFirewall: true,
  canStartServer: false,
  canStopServer: false,
  canCreateBackup: true,
  canRestoreBackup: true
};

describe('server primary action state', () => {
  it('allows retrying after a recoverable runtime error', () => {
    const state = resolveServerActionState(ApplicationStatus.ERROR, {
      ...actions,
      canStartServer: true
    });

    expect(state.action).toBe('start');
    expect(state.disabled).toBe(false);
    expect(state.buttonLabel).toBe('Reintentar servidor');
  });

  it('allows stopping a server while it is starting when backend permits it', () => {
    const state = resolveServerActionState(ApplicationStatus.SERVER_STARTING, {
      ...actions,
      canStopServer: true
    });

    expect(state.action).toBe('stop');
    expect(state.disabled).toBe(false);
    expect(state.buttonLabel).toBe('Detener inicio');
  });

  it('keeps the action disabled while the server is stopping', () => {
    const state = resolveServerActionState(ApplicationStatus.SERVER_STOPPING, actions);

    expect(state.action).toBe('none');
    expect(state.disabled).toBe(true);
    expect(state.buttonLabel).toBe('Deteniendo servidor');
  });
});
