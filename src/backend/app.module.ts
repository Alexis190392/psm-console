import { Module } from '@nestjs/common';
import { ApplicationStateService } from './application-state/application-state.service';
import { AppSettingsService } from './app-settings/app-settings.service';
import { BackupService } from './backup/backup.service';
import { BackupArchiveService } from './backup/backup-archive.service';
import { BackupIntegrityService } from './backup/backup-integrity.service';
import { BackupPolicyService } from './backup/backup-policy.service';
import { FirewallService } from './firewall/firewall.service';
import { NetworkService } from './network/network.service';
import { LoggingService } from './logging/logging.service';
import { OperationManagerService } from './operations/operation-manager.service';
import { PalworldAdminService } from './palworld-admin/palworld-admin.service';
import { PalworldConfigurationService } from './palworld-configuration/palworld-configuration.service';
import { PalworldSettingsDefinitionsService } from './palworld-settings/palworld-settings-definitions.service';
import { PalworldInstallationService } from './palworld-installation/palworld-installation.service';
import { PalworldMaintenanceSnapshotService } from './palworld-maintenance/palworld-maintenance-snapshot.service';
import { PalworldPlayersService } from './palworld-players/palworld-players.service';
import { PalworldProcessService } from './palworld-process/palworld-process.service';
import { PortablePathService } from './portable-path/portable-path.service';
import { PortableStateService } from './portable-state/portable-state.service';
import { SteamCmdService } from './steamcmd/steamcmd.service';
import { ReleaseUpdateService } from './release-update/release-update.service';
import { RemoteApiService } from './remote-api/remote-api.service';
import { ServerIdlePolicyService } from './server-idle-shutdown/server-idle-policy.service';
import { ServerIdleShutdownService } from './server-idle-shutdown/server-idle-shutdown.service';

@Module({
  providers: [
    PortablePathService,
    PortableStateService,
    ApplicationStateService,
    AppSettingsService,
    OperationManagerService,
    BackupArchiveService,
    BackupIntegrityService,
    BackupPolicyService,
    BackupService,
    SteamCmdService,
    ReleaseUpdateService,
    RemoteApiService,
    ServerIdlePolicyService,
    ServerIdleShutdownService,
    PalworldInstallationService,
    PalworldMaintenanceSnapshotService,
    PalworldAdminService,
    PalworldPlayersService,
    PalworldProcessService,
    PalworldConfigurationService,
    PalworldSettingsDefinitionsService,
    NetworkService,
    FirewallService,
    LoggingService
  ],
  exports: [
    PortablePathService,
    PortableStateService,
    ApplicationStateService,
    AppSettingsService,
    OperationManagerService,
    BackupArchiveService,
    BackupIntegrityService,
    BackupPolicyService,
    BackupService,
    SteamCmdService,
    ReleaseUpdateService,
    RemoteApiService,
    ServerIdlePolicyService,
    ServerIdleShutdownService,
    PalworldInstallationService,
    PalworldMaintenanceSnapshotService,
    PalworldAdminService,
    PalworldPlayersService,
    PalworldProcessService,
    PalworldConfigurationService,
    PalworldSettingsDefinitionsService,
    NetworkService,
    FirewallService,
    LoggingService
  ]
})
export class AppModule {}
