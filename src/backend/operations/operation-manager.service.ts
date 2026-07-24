import { Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { LoggingService } from '../logging/logging.service';
import { formatLocalLogTimestamp } from '../../shared/utils/local-time';
import type { OperationProgressDto, OperationStatus } from '../../shared/dto/operation-progress.dto';
import type { OperationCancelRequestDto } from '../../shared/dto/operation-progress.dto';

type CancellationHandler = () => void | Promise<void>;

@Injectable()
export class OperationManagerService {
  private readonly operations = new Map<string, OperationProgressDto>();
  private readonly cancellationHandlers = new Map<string, CancellationHandler>();
  private readonly cancellationRequests = new Set<string>();

  constructor(@Optional() private readonly loggingService?: LoggingService) {}

  create(title: string, message: string): OperationProgressDto {
    const operation: OperationProgressDto = {
      operationId: randomUUID(),
      status: 'PENDING',
      title,
      message,
      logs: [formatLogLine(message)],
      percent: 0,
      canCancel: false,
      updatedAt: new Date().toISOString()
    };

    this.operations.set(operation.operationId, operation);
    void this.loggingService?.write('manager', 'INFO', `${title}: ${message}`);
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
        logs: [formatLogLine('No existe una operacion con ese identificador.')],
        percent: 0,
        canCancel: false,
        error: 'OPERATION_NOT_FOUND',
        updatedAt: new Date().toISOString()
      };
    }

    return operation;
  }

  registerCancellation(operationId: string, handler: CancellationHandler): void {
    const operation = this.requireOperation(operationId);

    if (isTerminal(operation.status)) {
      return;
    }

    this.cancellationHandlers.set(operationId, handler);
    this.update(operationId, { canCancel: true, logMessage: false });
  }

  clearCancellation(operationId: string): void {
    this.cancellationHandlers.delete(operationId);
    const operation = this.operations.get(operationId);

    if (operation && !isTerminal(operation.status)) {
      this.update(operationId, { canCancel: false, logMessage: false });
    }
  }

  isCancelled(operationId: string): boolean {
    return this.cancellationRequests.has(operationId) || this.operations.get(operationId)?.status === 'CANCELLED';
  }

  async cancel(request: OperationCancelRequestDto): Promise<OperationProgressDto> {
    if (!isUuid(request.operationId)) {
      throw new Error('INVALID_OPERATION_ID');
    }

    const operation = this.requireOperation(request.operationId);

    if (isTerminal(operation.status)) {
      return operation;
    }

    const handler = this.cancellationHandlers.get(request.operationId);
    if (!handler || !operation.canCancel) {
      throw new Error('OPERATION_NOT_CANCELLABLE');
    }

    this.cancellationHandlers.delete(request.operationId);
    this.cancellationRequests.add(request.operationId);
    try {
      await handler();
    } catch (error) {
      this.cancellationRequests.delete(request.operationId);
      throw error;
    }

    return this.update(request.operationId, {
      status: 'RUNNING',
      canCancel: false,
      message: 'Cancelando operacion y restaurando el estado seguro.'
    });
  }

  completeCancellation(operationId: string, message = 'Operacion cancelada por el usuario.'): OperationProgressDto {
    this.cancellationRequests.delete(operationId);
    return this.update(operationId, {
      status: 'CANCELLED',
      canCancel: false,
      message
    });
  }

  update(
    operationId: string,
    patch: Partial<Pick<OperationProgressDto, 'message' | 'percent' | 'error' | 'canCancel' | 'logs'>> & {
      status?: OperationStatus;
      logMessage?: boolean;
    }
  ): OperationProgressDto {
    const current = this.get(operationId);
    if (current.status === 'CANCELLED' && patch.status !== 'CANCELLED') {
      return current;
    }
    const { logMessage, ...operationPatch } = patch;
    const shouldLogMessage = logMessage ?? true;
    const hasNewMessage =
      shouldLogMessage && typeof operationPatch.message === 'string' && operationPatch.message !== current.message;
    const next: OperationProgressDto = {
      ...current,
      ...operationPatch,
      logs:
        operationPatch.logs ??
        (hasNewMessage ? [...current.logs, formatLogLine(operationPatch.message ?? '')] : current.logs),
      percent: clampPercent(operationPatch.percent ?? current.percent),
      updatedAt: new Date().toISOString()
    };

    this.operations.set(operationId, next);
    if (isTerminal(next.status)) {
      this.cancellationHandlers.delete(operationId);
      this.cancellationRequests.delete(operationId);
    }
    if (hasNewMessage) {
      void this.loggingService?.write(patch.status === 'FAILED' ? 'error' : 'manager', patch.status === 'FAILED' ? 'ERROR' : 'INFO', `${next.title}: ${operationPatch.message ?? ''}`);
    }
    return next;
  }

  appendLog(operationId: string, line: string): OperationProgressDto {
    const current = this.get(operationId);
    void this.loggingService?.write('manager', 'INFO', `${current.title}: ${line}`);
    return this.update(operationId, {
      logs: [...current.logs, formatLogLine(line)]
    });
  }

  private requireOperation(operationId: string): OperationProgressDto {
    const operation = this.operations.get(operationId);
    if (!operation) {
      throw new Error('OPERATION_NOT_FOUND');
    }

    return operation;
  }
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatLogLine(line: string): string {
  return `[${formatLocalLogTimestamp()}] ${line}`;
}

function isTerminal(status: OperationStatus): boolean {
  return status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED';
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
