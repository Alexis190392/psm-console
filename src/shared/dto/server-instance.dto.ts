export interface ServerInstanceDto {
  id: string;
  rootPath: string;
  name: string;
  isSelected: boolean;
  isRunning: boolean;
  addedAt: string;
}

export interface ServerInstancesStatusDto {
  mode: 'PORTABLE' | 'MULTI_SERVER';
  selectedInstanceId?: string;
  instances: ServerInstanceDto[];
}
