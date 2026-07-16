import { Module } from '@nestjs/common';
import { ApplicationStateService } from './application-state/application-state.service';
import { OperationManagerService } from './operations/operation-manager.service';
import { PalworldConfigurationService } from './palworld-configuration/palworld-configuration.service';
import { PalworldInstallationService } from './palworld-installation/palworld-installation.service';
import { PortablePathService } from './portable-path/portable-path.service';
import { SteamCmdService } from './steamcmd/steamcmd.service';

@Module({
  providers: [
    PortablePathService,
    ApplicationStateService,
    OperationManagerService,
    SteamCmdService,
    PalworldInstallationService,
    PalworldConfigurationService
  ],
  exports: [
    PortablePathService,
    ApplicationStateService,
    OperationManagerService,
    SteamCmdService,
    PalworldInstallationService,
    PalworldConfigurationService
  ]
})
export class AppModule {}
