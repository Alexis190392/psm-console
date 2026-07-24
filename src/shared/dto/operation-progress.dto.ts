export type OperationStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface OperationProgressDto {
  operationId: string;
  status: OperationStatus;
  title: string;
  message: string;
  logs: string[];
  percent: number;
  canCancel: boolean;
  error?: string;
  updatedAt: string;
}

export interface OperationAcceptedDto {
  operationId: string;
}

export interface OperationCancelRequestDto {
  operationId: string;
}
