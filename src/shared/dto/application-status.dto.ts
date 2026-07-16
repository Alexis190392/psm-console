import { ApplicationStatus } from '../enums/application-status';

export interface ApplicationStatusDto {
  status: ApplicationStatus;
  portableRoot: string;
  isPortableRootWritable: boolean;
  updatedAt: string;
}
