import { describe, expect, it, vi } from 'vitest';
import { OperationManagerService } from '../src/backend/operations/operation-manager.service';

describe('OperationManagerService cancellation', () => {
  it('cancels only a known operation with a registered handler', async () => {
    const service = new OperationManagerService();
    const operation = service.create('Prueba', 'Preparando.');
    const cancel = vi.fn();
    service.registerCancellation(operation.operationId, cancel);

    const cancelling = await service.cancel({ operationId: operation.operationId });
    const result = service.completeCancellation(operation.operationId);

    expect(cancel).toHaveBeenCalledOnce();
    expect(cancelling).toMatchObject({
      status: 'RUNNING',
      canCancel: false
    });
    expect(result).toMatchObject({
      status: 'CANCELLED',
      canCancel: false,
      message: 'Operacion cancelada por el usuario.'
    });
  });

  it('does not allow a completed task to be overwritten after cancellation', async () => {
    const service = new OperationManagerService();
    const operation = service.create('Prueba', 'Preparando.');
    service.registerCancellation(operation.operationId, () => undefined);
    await service.cancel({ operationId: operation.operationId });
    service.completeCancellation(operation.operationId);

    service.update(operation.operationId, {
      status: 'FAILED',
      message: 'Resultado tardio.'
    });

    expect(service.get(operation.operationId).status).toBe('CANCELLED');
  });

  it('rejects malformed and non-cancellable operation requests', async () => {
    const service = new OperationManagerService();
    const operation = service.create('Prueba', 'Preparando.');

    await expect(service.cancel({ operationId: 'not-an-id' })).rejects.toThrow('INVALID_OPERATION_ID');
    await expect(service.cancel({ operationId: operation.operationId })).rejects.toThrow(
      'OPERATION_NOT_CANCELLABLE'
    );
  });
});
