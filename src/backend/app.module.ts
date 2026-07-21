import { Module } from '@nestjs/common';
import { ApplicationStateService } from './application-state/application-state.service';
import { BackupService } from './backup/backup.service';
import { FirewallService } from './firewall/firewall.service';
import { NetworkService } from './network/network.service';
import { LoggingService } from './logging/logging.service';
import { OperationManagerService } from './operations/operation-manager.service';
import { PalworldConfigurationService } from './palworld-configuration/palworld-configuration.service';
import { PalworldInstallationService } from './palworld-installation/palworld-installation.service';
import { PalworldProcessService } from './palworld-process/palworld-process.service';
import { PortablePathService } from './portable-path/portable-path.service';
import { PortableStateService } from './portable-state/portable-state.service';
import { SteamCmdService } from './steamcmd/steamcmd.service';

@Module({
  providers: [
    PortablePathService,
    PortableStateService,
    ApplicationStateService,
    OperationManagerService,
    BackupService,
    SteamCmdService,
    PalworldInstallationService,
    PalworldProcessService,
    PalworldConfigurationService,
    NetworkService,
    FirewallService,
    LoggingService
  ],
  exports: [
    PortablePathService,
    PortableStateService,
    ApplicationStateService,
    OperationManagerService,
    BackupService,
    SteamCmdService,
    PalworldInstallationService,
    PalworldProcessService,
    PalworldConfigurationService,
    NetworkService,
    FirewallService,
    LoggingService
  ]
})
export class AppModule {}
