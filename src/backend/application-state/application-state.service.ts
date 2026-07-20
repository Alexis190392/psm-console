import { Injectable } from '@nestjs/common';
import { PalworldConfigurationService } from '../palworld-configuration/palworld-configuration.service';
import { PalworldInstallationService } from '../palworld-installation/palworld-installation.service';
import { PalworldProcessService } from '../palworld-process/palworld-process.service';
import { PortablePathService } from '../portable-path/portable-path.service';
import { SteamCmdService } from '../steamcmd/steamcmd.service';
import { ApplicationStatus } from '../../shared/enums/application-status';
import type { AllowedActionsDto } from '../../shared/dto/allowed-actions.dto';
import type { ApplicationStatusDto } from '../../shared/dto/application-status.dto';

@Injectable()
export class ApplicationStateService {
  constructor(
    private readonly portablePathService: PortablePathService,
    private readonly steamCmdService: SteamCmdService,
    private readonly palworldInstallationService: PalworldInstallationService,
    private readonly palworldConfigurationService: PalworldConfigurationService,
    private readonly palworldProcessService: PalworldProcessService
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
        ApplicationStatus.CONFIGURATION_MISSING,
        ApplicationStatus.CONFIGURATION_READY,
        ApplicationStatus.READY,
        ApplicationStatus.ERROR
      ].includes(status),
      canManageFirewall: [
        ApplicationStatus.FIREWALL_MISSING,
        ApplicationStatus.READY,
        ApplicationStatus.ERROR
      ].includes(status),
      canStartServer: [
        ApplicationStatus.READY,
        ApplicationStatus.ERROR
      ].includes(status),
      canStopServer: [
        ApplicationStatus.SERVER_STARTING,
        ApplicationStatus.SERVER_RUNNING
      ].includes(status),
      canCreateBackup: [
        ApplicationStatus.CONFIGURATION_MISSING,
        ApplicationStatus.READY,
        ApplicationStatus.SERVER_RUNNING,
        ApplicationStatus.ERROR
      ].includes(status),
      canRestoreBackup: status === ApplicationStatus.READY
    };
  }

  private resolveStatus(): ApplicationStatus {
    const steamCmdStatus = this.steamCmdService.getStatus();

    if (steamCmdStatus.status === 'MISSING') {
      return ApplicationStatus.STEAMCMD_MISSING;
    }

    const serverStatus = this.palworldInstallationService.getStatus();

    if (serverStatus.status === 'MISSING') {
      return ApplicationStatus.SERVER_MISSING;
    }

    const configurationStatus = this.palworldConfigurationService.getStatus();

    if (configurationStatus.status === 'MISSING') {
      return ApplicationStatus.CONFIGURATION_MISSING;
    }

    const runtimeStatus = this.palworldProcessService.getRuntimeStatus();

    if (runtimeStatus.state === 'STARTING') {
      return ApplicationStatus.SERVER_STARTING;
    }

    if (runtimeStatus.state === 'RUNNING') {
      return ApplicationStatus.SERVER_RUNNING;
    }

    if (runtimeStatus.state === 'STOPPING') {
      return ApplicationStatus.SERVER_STOPPING;
    }

    if (runtimeStatus.state === 'ERROR') {
      return ApplicationStatus.ERROR;
    }

    return ApplicationStatus.READY;
  }
}
