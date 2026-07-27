import { Injectable } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { PortablePathService } from '../portable-path/portable-path.service';
import type {
  ServerIdlePolicyDto,
  ServerIdlePolicyUpdateRequestDto
} from '../../shared/dto/server-idle-policy.dto';

export const DEFAULT_SERVER_IDLE_POLICY: ServerIdlePolicyDto = {
  enabled: false,
  emptySeconds: 300
};

@Injectable()
export class ServerIdlePolicyService {
  constructor(private readonly portablePathService: PortablePathService) {}

  async read(): Promise<ServerIdlePolicyDto> {
    const path = this.getPolicyPath();
    if (!existsSync(path)) {
      return { ...DEFAULT_SERVER_IDLE_POLICY };
    }

    try {
      const stored = JSON.parse(await readFile(path, 'utf8')) as Partial<ServerIdlePolicyDto>;
      return validatePolicy({ ...DEFAULT_SERVER_IDLE_POLICY, ...stored });
    } catch {
      return { ...DEFAULT_SERVER_IDLE_POLICY };
    }
  }

  async update(request: ServerIdlePolicyUpdateRequestDto): Promise<ServerIdlePolicyDto> {
    if (!request.confirmed) {
      throw new Error('SERVER_IDLE_POLICY_UPDATE_REQUIRES_CONFIRMATION');
    }

    const policy = validatePolicy(request);
    const path = this.getPolicyPath();
    const temporaryPath = `${path}.${randomUUID()}.tmp`;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(temporaryPath, JSON.stringify(policy, null, 2), 'utf8');
    await rename(temporaryPath, path);
    return policy;
  }

  private getPolicyPath(): string {
    return join(this.portablePathService.getConfigRoot(), 'server-idle-policy.json');
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
