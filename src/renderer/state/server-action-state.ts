import type { AllowedActionsDto } from '../../shared/dto/allowed-actions.dto';
import { ApplicationStatus } from '../../shared/enums/application-status';

export type ServerPrimaryAction = 'start' | 'stop' | 'none';
export type ServerRuntimeTone = 'ready' | 'blocked' | 'starting' | 'running' | 'error';

export interface ServerActionState {
  action: ServerPrimaryAction;
  disabled: boolean;
  buttonLabel: string;
  runtimeTone: ServerRuntimeTone;
  runtimeLabel: string;
}

export function resolveServerActionState(
  status: ApplicationStatus,
  actions: AllowedActionsDto
): ServerActionState {
  if (status === ApplicationStatus.SERVER_STARTING) {
    return actions.canStopServer
      ? createState('stop', false, 'Detener inicio', 'starting', 'Iniciando')
      : createState('none', true, 'Iniciando servidor', 'starting', 'Iniciando');
  }

  if (status === ApplicationStatus.SERVER_RUNNING) {
    return actions.canStopServer
      ? createState('stop', false, 'Detener servidor', 'running', 'Ejecutandose')
      : createState('none', true, 'Servidor activo', 'running', 'Ejecutandose');
  }

  if (status === ApplicationStatus.SERVER_STOPPING) {
    return createState('none', true, 'Deteniendo servidor', 'starting', 'Deteniendo');
  }

  if (status === ApplicationStatus.ERROR) {
    return actions.canStartServer
      ? createState('start', false, 'Reintentar servidor', 'error', 'Reintento disponible')
      : createState('none', true, 'Servidor bloqueado', 'error', 'Revisar logs');
  }

  return actions.canStartServer
    ? createState('start', false, 'Iniciar servidor', 'ready', 'Listo para iniciar')
    : createState('none', true, 'Servidor bloqueado', 'blocked', 'Bloqueado');
}

function createState(
  action: ServerPrimaryAction,
  disabled: boolean,
  buttonLabel: string,
  runtimeTone: ServerRuntimeTone,
  runtimeLabel: string
): ServerActionState {
  return { action, disabled, buttonLabel, runtimeTone, runtimeLabel };
}
