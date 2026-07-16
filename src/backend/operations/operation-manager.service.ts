import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { OperationProgressDto, OperationStatus } from '../../shared/dto/operation-progress.dto';

@Injectable()
export class OperationManagerService {
  private readonly operations = new Map<string, OperationProgressDto>();

  create(title: string, message: string): OperationProgressDto {
    const operation: OperationProgressDto = {
      operationId: randomUUID(),
      status: 'PENDING',
      title,
      message,
      percent: 0,
      canCancel: false,
      updatedAt: new Date().toISOString()
    };

    this.operations.set(operation.operationId, operation);
    return operation;
  }

  get(operationId: string): OperationProgressDto {
    const operation = this.operations.get(operationId);

    if (!operation) {
      return {
        operationId,
        status: 'FAILED',
        title: 'Operacion no encontrada',
        message: 'No existe una operacion con ese identificador.',
        percent: 0,
        canCancel: false,
        error: 'OPERATION_NOT_FOUND',
        updatedAt: new Date().toISOString()
      };
    }

    return operation;
  }

  update(
    operationId: string,
    patch: Partial<Pick<OperationProgressDto, 'message' | 'percent' | 'error' | 'canCancel'>> & {
      status?: OperationStatus;
    }
  ): OperationProgressDto {
    const current = this.get(operationId);
    const next: OperationProgressDto = {
      ...current,
      ...patch,
      percent: clampPercent(patch.percent ?? current.percent),
      updatedAt: new Date().toISOString()
    };

    this.operations.set(operationId, next);
    return next;
  }
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
