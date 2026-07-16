import { Module } from '@nestjs/common';
import { ApplicationStateService } from './application-state/application-state.service';
import { OperationManagerService } from './operations/operation-manager.service';
import { PalworldInstallationService } from './palworld-installation/palworld-installation.service';
import { PortablePathService } from './portable-path/portable-path.service';
import { SteamCmdService } from './steamcmd/steamcmd.service';

@Module({
  providers: [
    PortablePathService,
    ApplicationStateService,
    OperationManagerService,
    SteamCmdService,
    PalworldInstallationService
  ],
  exports: [
    PortablePathService,
    ApplicationStateService,
    OperationManagerService,
    SteamCmdService,
    PalworldInstallationService
  ]
})
export class AppModule {}
