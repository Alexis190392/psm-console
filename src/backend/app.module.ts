import { Module } from '@nestjs/common';
import { ApplicationStateService } from './application-state/application-state.service';
import { PortablePathService } from './portable-path/portable-path.service';

@Module({
  providers: [PortablePathService, ApplicationStateService],
  exports: [PortablePathService, ApplicationStateService]
})
export class AppModule {}
