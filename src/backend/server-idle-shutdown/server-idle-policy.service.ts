import { Injectable } from '@nestjs/common';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { DEFAULT_SERVER_IDLE_POLICY } from '../../shared/constants/app-settings-defaults';
import type {
  ServerIdlePolicyDto,
  ServerIdlePolicyUpdateRequestDto
} from '../../shared/dto/server-idle-policy.dto';

export { DEFAULT_SERVER_IDLE_POLICY };

@Injectable()
export class ServerIdlePolicyService {
  constructor(private readonly appSettingsService: AppSettingsService) {}

  async read(): Promise<ServerIdlePolicyDto> {
    return (await this.appSettingsService.read()).automation.idleShutdown;
  }

  async update(request: ServerIdlePolicyUpdateRequestDto): Promise<ServerIdlePolicyDto> {
    if (!request.confirmed) {
      throw new Error('SERVER_IDLE_POLICY_UPDATE_REQUIRES_CONFIRMATION');
    }

    return this.appSettingsService.updateIdlePolicy(validatePolicy(request));
  }
}

function validatePolicy(policy: ServerIdlePolicyDto): ServerIdlePolicyDto {
  if (typeof policy.enabled !== 'boolean') {
    throw new Error('SERVER_IDLE_POLICY_ENABLED_INVALID');
  }
  if (!Number.isInteger(policy.emptySeconds) || policy.emptySeconds < 10 || policy.emptySeconds > 86_400) {
    throw new Error('SERVER_IDLE_POLICY_SECONDS_OUT_OF_RANGE');
  }

  return {
    enabled: policy.enabled,
    emptySeconds: policy.emptySeconds
  };
}
