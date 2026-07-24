import { describe, expect, it } from 'vitest';
import type { OperationProgressDto } from '../src/shared/dto/operation-progress.dto';
import {
  getOperationFailureMessage,
  isOperationSuccessful
} from '../src/renderer/utils/operation-result';

function operation(
  status: OperationProgressDto['status'],
  patch: Partial<OperationProgressDto> = {}
): OperationProgressDto {
  return {
    operationId: '00000000-0000-4000-8000-000000000000',
    status,
    title: 'Prueba',
    message: 'Estado de prueba',
    logs: [],
    percent: status === 'COMPLETED' ? 100 : 50,
    canCancel: false,
    updatedAt: '2026-07-24T12:00:00.000Z',
    ...patch
  };
}

describe('renderer operation result', () => {
  it('only treats COMPLETED as success', () => {
    expect(isOperationSuccessful(operation('COMPLETED'))).toBe(true);
    expect(isOperationSuccessful(operation('FAILED'))).toBe(false);
    expect(isOperationSuccessful(operation('CANCELLED'))).toBe(false);
  });

  it('prefers the backend error code for failed operations', () => {
    expect(
      getOperationFailureMessage(operation('FAILED', { error: 'PORT_IN_USE', message: 'Fallo' }))
    ).toBe('PORT_IN_USE');
  });

  it('uses the operation message when cancellation is confirmed', () => {
    expect(
      getOperationFailureMessage(operation('CANCELLED', { message: 'Cancelada por el usuario.' }))
    ).toBe('Cancelada por el usuario.');
  });
});
