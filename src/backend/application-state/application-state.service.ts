import { Injectable } from '@nestjs/common';
import { PortablePathService } from '../portable-path/portable-path.service';
import { SteamCmdService } from '../steamcmd/steamcmd.service';
import { ApplicationStatus } from '../../shared/enums/application-status';
import type { AllowedActionsDto } from '../../shared/dto/allowed-actions.dto';
import type { ApplicationStatusDto } from '../../shared/dto/application-status.dto';

@Injectable()
export class ApplicationStateService {
  constructor(
    private readonly portablePathService: PortablePathService,
    private readonly steamCmdService: SteamCmdService
  ) {}

  getStatus(): ApplicationStatusDto {
    this.portablePathService.ensurePortableLayout();
    const status = this.resolveStatus();

    return {
      status,
      portableRoot: this.portablePathService.getPortableRoot(),
      isPortableRootWritable: true,
      updatedAt: new Date().toISOString()
    };
  }

  getAllowedActions(): AllowedActionsDto {
    const status = this.resolveStatus();

    return {
      canInstallSteamCmd: status === ApplicationStatus.STEAMCMD_MISSING,
      canInstallServer: status === ApplicationStatus.SERVER_MISSING,
      canEditConfiguration: [
        ApplicationStatus.CONFIGURATION_READY,
        ApplicationStatus.READY
      ].includes(status),
      canManageFirewall: [
        ApplicationStatus.FIREWALL_MISSING,
        ApplicationStatus.READY
      ].includes(status),
      canStartServer: status === ApplicationStatus.READY,
      canStopServer: status === ApplicationStatus.SERVER_RUNNING,
      canCreateBackup: [
        ApplicationStatus.READY,
        ApplicationStatus.SERVER_RUNNING
      ].includes(status),
      canRestoreBackup: status === ApplicationStatus.READY
    };
  }

  private resolveStatus(): ApplicationStatus {
    const steamCmdStatus = this.steamCmdService.getStatus();

    if (steamCmdStatus.status === 'MISSING') {
      return ApplicationStatus.STEAMCMD_MISSING;
    }

    return ApplicationStatus.SERVER_MISSING;
  }
}
