import type { OperationProgressDto } from '../../shared/dto/operation-progress.dto';

export function isOperationSuccessful(operation: OperationProgressDto): boolean {
  return operation.status === 'COMPLETED';
}

export function getOperationFailureMessage(operation: OperationProgressDto): string | null {
  if (operation.status === 'FAILED') {
    return operation.error?.trim() || operation.message || 'La operacion fallo.';
  }

  if (operation.status === 'CANCELLED') {
    return operation.message || 'La operacion fue cancelada.';
  }

  return null;
}
