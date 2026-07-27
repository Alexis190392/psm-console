import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { LoggingService } from '../logging/logging.service';
import { PalworldPlayersService } from '../palworld-players/palworld-players.service';
import { PalworldProcessService } from '../palworld-process/palworld-process.service';
import { ServerIdlePolicyService } from './server-idle-policy.service';
import type {
  ServerIdlePolicyUpdateRequestDto,
  ServerIdleStatusDto
} from '../../shared/dto/server-idle-policy.dto';

const MONITOR_INTERVAL_MS = 3_000;

@Injectable()
export class ServerIdleShutdownService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private checking = false;
  private emptySince: number | null = null;
  private status: ServerIdleStatusDto | null = null;

  constructor(
    private readonly policyService: ServerIdlePolicyService,
    private readonly playersService: PalworldPlayersService,
    private readonly processService: PalworldProcessService,
    private readonly loggingService: LoggingService
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.evaluate();
    }, MONITOR_INTERVAL_MS);
    this.timer.unref();
    void this.evaluate();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async getStatus(): Promise<ServerIdleStatusDto> {
    if (!this.status) {
      await this.evaluate();
    }
    return this.status ?? this.createStatus(
      await this.policyService.read(),
      'MONITOR_UNAVAILABLE',
      'El monitor todavia no pudo determinar el estado del servidor.'
    );
  }

  async updatePolicy(request: ServerIdlePolicyUpdateRequestDto): Promise<ServerIdleStatusDto> {
    const policy = await this.policyService.update(request);
    this.resetCountdown();
    await this.loggingService.write(
      'manager',
      'INFO',
      policy.enabled
        ? `Apagado automatico habilitado tras ${String(policy.emptySeconds)} segundos sin jugadores.`
        : 'Apagado automatico por inactividad deshabilitado.'
    );
    await this.evaluate();
    return this.status ?? this.createStatus(policy, 'MONITOR_UNAVAILABLE', 'Politica guardada.');
  }

  async evaluate(): Promise<void> {
    if (this.checking) {
      return;
    }

    this.checking = true;
    try {
      const policy = await this.policyService.read();
      if (!policy.enabled) {
        this.resetCountdown();
        this.status = this.createStatus(policy, 'DISABLED', 'Apagado automatico deshabilitado.');
        return;
      }

      const runtime = this.processService.getRuntimeStatus();
      if (runtime.state !== 'RUNNING') {
        this.resetCountdown();
        this.status = this.createStatus(policy, 'SERVER_STOPPED', 'El temporizador comenzara cuando el servidor este activo.');
        return;
      }

      const players = await this.playersService.getStatus();
      if (players.status !== 'READY') {
        this.resetCountdown();
        this.status = this.createStatus(
          policy,
          'MONITOR_UNAVAILABLE',
          'Esperando una lectura valida de jugadores antes de iniciar la cuenta.'
        );
        return;
      }

      if (players.currentPlayers > 0) {
        this.resetCountdown();
        this.status = this.createStatus(
          policy,
          'WAITING_FOR_PLAYERS',
          `${String(players.currentPlayers)} jugador${players.currentPlayers === 1 ? '' : 'es'} conectado${players.currentPlayers === 1 ? '' : 's'}.`
        );
        return;
      }

      this.emptySince ??= Date.now();
      const elapsedSeconds = Math.floor((Date.now() - this.emptySince) / 1000);
      const remainingSeconds = Math.max(0, policy.emptySeconds - elapsedSeconds);
      if (remainingSeconds > 0) {
        this.status = this.createStatus(
          policy,
          'COUNTDOWN',
          `Servidor vacio. Se detendra en ${String(remainingSeconds)} segundos.`,
          remainingSeconds
        );
        return;
      }

      this.status = this.createStatus(policy, 'STOPPING', 'Deteniendo el servidor por inactividad.', 0);
      await this.loggingService.write('palserver', 'INFO', 'Detencion automatica: se cumplio el tiempo sin jugadores.');
      this.processService.stopAutomatically();
      this.resetCountdown();
    } catch (error) {
      this.resetCountdown();
      const policy = await this.policyService.read();
      this.status = this.createStatus(
        policy,
        'MONITOR_UNAVAILABLE',
        `No se pudo evaluar el apagado automatico: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      this.checking = false;
    }
  }

  private resetCountdown(): void {
    this.emptySince = null;
  }

  private createStatus(
    policy: ServerIdleStatusDto['policy'],
    state: ServerIdleStatusDto['state'],
    message: string,
    remainingSeconds?: number
  ): ServerIdleStatusDto {
    return {
      policy,
      state,
      emptySince: this.emptySince ? new Date(this.emptySince).toISOString() : undefined,
      remainingSeconds,
      updatedAt: new Date().toISOString(),
      message
    };
  }
}
