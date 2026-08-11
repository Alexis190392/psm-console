import { ApplicationStatus } from '../enums/application-status';

export interface ApplicationStatusDto {
  status: ApplicationStatus;
  portableRoot: string;
  isPortableRootWritable: boolean;
  requiresServerSelection?: boolean;
  updatedAt: string;
}
