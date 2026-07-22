export type AppProcessKind = 'main' | 'renderer' | 'gpu' | 'utility' | 'other';

export interface AppProcessMetricDto {
  pid: number;
  kind: AppProcessKind;
  label: string;
  detail: string;
  electronType: string;
  serviceName?: string;
  cpuPercent: number;
  memoryBytes: number;
  sandboxed?: boolean;
}

export interface AppProcessMetricsDto {
  updatedAt: string;
  processes: AppProcessMetricDto[];
}
