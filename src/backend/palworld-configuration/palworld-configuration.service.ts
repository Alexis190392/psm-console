import { Injectable } from '@nestjs/common';
import { copyFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { OperationManagerService } from '../operations/operation-manager.service';
import { PortablePathService } from '../portable-path/portable-path.service';
import { PortableStateService } from '../portable-state/portable-state.service';
import type { OperationAcceptedDto } from '../../shared/dto/operation-progress.dto';
import type {
  PalworldConfigurationStatusDto,
  PalworldCreateDefaultConfigurationRequestDto
} from '../../shared/dto/palworld-configuration-status.dto';

@Injectable()
export class PalworldConfigurationService {
  constructor(
    private readonly portablePathService: PortablePathService,
    private readonly operationManagerService: OperationManagerService,
    private readonly portableStateService: PortableStateService
  ) {}

  getStatus(): PalworldConfigurationStatusDto {
    const state = this.portableStateService.read();
    const persistedActivePath = state.configuration?.activePath;
    const templatePath =
      persistedActivePath && existsSync(persistedActivePath)
        ? state.configuration?.templatePath ?? this.getTemplatePath()
        : this.getTemplatePath();
    const activePath = persistedActivePath && existsSync(persistedActivePath) ? persistedActivePath : this.getActivePath();
    const isReady = existsSync(activePath);

    if (isReady) {
      this.portableStateService.rememberConfiguration(templatePath, activePath);
    }

    return {
      status: isReady ? 'READY' : 'MISSING',
      templatePath,
      activePath,
      message: isReady
        ? 'La configuracion activa existe.'
        : 'Falta crear la configuracion activa desde la plantilla instalada.'
    };
  }

  createDefault(request: PalworldCreateDefaultConfigurationRequestDto): OperationAcceptedDto {
    if (!request.confirmed) {
      throw new Error('CONFIGURATION_CREATE_DEFAULT_REQUIRES_CONFIRMATION');
    }

    const operation = this.operationManagerService.create(
      'Creacion de configuracion inicial',
      'Preparando configuracion inicial de Palworld.'
    );

    void this.createDefaultAsync(operation.operationId);

    return {
      operationId: operation.operationId
    };
  }

  private async createDefaultAsync(operationId: string): Promise<void> {
    const templatePath = this.getTemplatePath();
    const activePath = this.getActivePath();

    try {
      if (!existsSync(templatePath)) {
        throw new Error(`DEFAULT_CONFIGURATION_TEMPLATE_NOT_FOUND: ${templatePath}`);
      }

      if (existsSync(activePath)) {
        this.portableStateService.rememberConfiguration(templatePath, activePath);
        this.operationManagerService.update(operationId, {
          status: 'COMPLETED',
          percent: 100,
          message: 'La configuracion activa ya existia.'
        });
        return;
      }

      this.operationManagerService.update(operationId, {
        status: 'RUNNING',
        percent: 30,
        message: `Creando carpeta ${dirname(activePath)}`
      });
      await mkdir(dirname(activePath), { recursive: true });
      this.operationManagerService.appendLog(operationId, `mkdir "${dirname(activePath)}"`);

      this.operationManagerService.update(operationId, {
        status: 'RUNNING',
        percent: 70,
        message: 'Copiando plantilla oficial como configuracion activa.'
      });
      this.operationManagerService.appendLog(operationId, `copy "${templatePath}" "${activePath}"`);
      await copyFile(templatePath, activePath);
      this.portableStateService.rememberConfiguration(templatePath, activePath);

      this.operationManagerService.update(operationId, {
        status: 'COMPLETED',
        percent: 100,
        message: 'Configuracion inicial creada correctamente.'
      });
    } catch (error) {
      this.operationManagerService.update(operationId, {
        status: 'FAILED',
        percent: 100,
        message: 'No se pudo crear la configuracion inicial.',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private getTemplatePath(): string {
    return join(this.portablePathService.getPalworldServerRoot(), 'DefaultPalWorldSettings.ini');
  }

  private getActivePath(): string {
    return join(
      this.portablePathService.getPalworldServerRoot(),
      'Pal',
      'Saved',
      'Config',
      'WindowsServer',
      'PalWorldSettings.ini'
    );
  }
}
