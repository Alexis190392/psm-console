import { Injectable } from '@nestjs/common';
import { PortablePathService } from '../portable-path/portable-path.service';
import { ApplicationStatus } from '../../shared/enums/application-status';
import type { AllowedActionsDto } from '../../shared/dto/allowed-actions.dto';
import type { ApplicationStatusDto } from '../../shared/dto/application-status.dto';

@Injectable()
export class ApplicationStateService {
  private status = ApplicationStatus.BOOTSTRAPPING;

  constructor(private readonly portablePathService: PortablePathService) {}

  getStatus(): ApplicationStatusDto {
    return {
      status: this.status,
      portableRoot: this.portablePathService.getPortableRoot(),
      isPortableRootWritable: true,
      updatedAt: new Date().toISOString()
    };
  }

  setStatus(status: ApplicationStatus): void {
    this.status = status;
  }

  getAllowedActions(): AllowedActionsDto {
    return {
      canInstallSteamCmd: this.status === ApplicationStatus.STEAMCMD_MISSING,
      canInstallServer: this.status === ApplicationStatus.SERVER_MISSING,
      canEditConfiguration: [
        ApplicationStatus.CONFIGURATION_READY,
        ApplicationStatus.READY
      ].includes(this.status),
      canManageFirewall: [
        ApplicationStatus.FIREWALL_MISSING,
        ApplicationStatus.READY
      ].includes(this.status),
      canStartServer: this.status === ApplicationStatus.READY,
      canStopServer: this.status === ApplicationStatus.SERVER_RUNNING,
      canCreateBackup: [
        ApplicationStatus.READY,
        ApplicationStatus.SERVER_RUNNING
      ].includes(this.status),
      canRestoreBackup: this.status === ApplicationStatus.READY
    };
  }
}
