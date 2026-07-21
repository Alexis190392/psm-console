import { Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { LoggingService } from '../logging/logging.service';
import type { OperationProgressDto, OperationStatus } from '../../shared/dto/operation-progress.dto';

@Injectable()
export class OperationManagerService {
  private readonly operations = new Map<string, OperationProgressDto>();

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

  update(
    operationId: string,
    patch: Partial<Pick<OperationProgressDto, 'message' | 'percent' | 'error' | 'canCancel' | 'logs'>> & {
      status?: OperationStatus;
      logMessage?: boolean;
    }
  ): OperationProgressDto {
    const current = this.get(operationId);
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
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatLogLine(line: string): string {
  return `[${new Date().toISOString()}] ${line}`;
}
