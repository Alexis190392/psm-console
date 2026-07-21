import { Injectable, Optional } from '@nestjs/common';
import { spawn, spawnSync, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { createSocket } from 'node:dgram';
import { existsSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { OperationManagerService } from '../operations/operation-manager.service';
import { LoggingService } from '../logging/logging.service';
import { PalworldInstallationService } from '../palworld-installation/palworld-installation.service';
import type { OperationAcceptedDto } from '../../shared/dto/operation-progress.dto';
import type {
  PalworldRuntimeState,
  PalworldRuntimeStatusDto,
  PalworldStartRequestDto,
  PalworldStopRequestDto
} from '../../shared/dto/palworld-runtime-status.dto';

interface DetectedPalServerProcess {
  pid: number;
  executablePath: string;
}

interface PalworldRuntimeExecutable {
  executablePath: string;
  workingDirectory: string;
  displayName: string;
}

interface PowerShellProcessRow {
  Id?: unknown;
  Path?: unknown;
}

const STEAM_QUERY_PORT = 27015;
const PROCESS_SCAN_CACHE_MS = 2_500;

@Injectable()
export class PalworldProcessService {
  private process: ChildProcess | null = null;
  private state: PalworldRuntimeState = 'STOPPED';
  private startedAt: string | undefined;
  private stoppedAt: string | undefined;
  private updatedAt = new Date().toISOString();
  private message = 'Servidor detenido.';
  private readonly logs: string[] = [];
  private activeOperationId: string | null = null;
  private observedProcess: DetectedPalServerProcess | null = null;
  private lastProcessScanAt = 0;
  private cachedProcessScan: DetectedPalServerProcess[] = [];
  private stopRequestedAt = 0;

  constructor(
    private readonly palworldInstallationService: PalworldInstallationService,
    private readonly operationManagerService: OperationManagerService,
    @Optional() private readonly loggingService?: LoggingService
  ) {}

  getRuntimeStatus(): PalworldRuntimeStatusDto {
    const installation = this.palworldInstallationService.getStatus();
    this.reconcileRuntimeStatus(installation.executablePath);

    return {
      state: this.state,
      executablePath: installation.executablePath,
      pid: this.process?.pid ?? this.observedProcess?.pid,
      startedAt: this.startedAt,
      stoppedAt: this.stoppedAt,
      updatedAt: this.updatedAt,
      message: this.message,
      logs: [...this.logs]
    };
  }

  start(request: PalworldStartRequestDto): OperationAcceptedDto {
    if (!request.confirmed) {
      throw new Error('PALWORLD_START_REQUIRES_CONFIRMATION');
    }

    const installation = this.palworldInstallationService.getStatus();
    this.reconcileRuntimeStatus(installation.executablePath);

    if (['STARTING', 'RUNNING', 'STOPPING'].includes(this.state)) {
      throw new Error('PALWORLD_SERVER_ALREADY_RUNNING');
    }

    if (installation.status !== 'READY' || !existsSync(installation.executablePath)) {
      throw new Error('PALWORLD_SERVER_NOT_READY');
    }

    const operation = this.operationManagerService.create(
      'Ejecucion de Palworld Dedicated Server',
      'Preparando inicio de PalServer.exe.'
    );
    this.activeOperationId = operation.operationId;
    this.setRuntimeState('STARTING', 'Iniciando Palworld Dedicated Server.');

    this.startAsync(operation.operationId, installation.executablePath);

    return {
      operationId: operation.operationId
    };
  }

  stop(request: PalworldStopRequestDto): OperationAcceptedDto {
    if (!request.confirmed) {
      throw new Error('PALWORLD_STOP_REQUIRES_CONFIRMATION');
    }

    const installation = this.palworldInstallationService.getStatus();
    this.reconcileRuntimeStatus(installation.executablePath);
    const targetProcesses = this.getActiveProcesses(installation.executablePath);
    const operation = this.operationManagerService.create(
      'Detencion de Palworld Dedicated Server',
      'Preparando detencion de PalServer.exe.'
    );

    if (targetProcesses.length === 0 || this.state === 'STOPPED') {
      this.setRuntimeState('STOPPED', 'No hay un servidor activo para detener.');
      this.operationManagerService.update(operation.operationId, {
        status: 'COMPLETED',
        percent: 100,
        message: 'No hay un servidor activo para detener.'
      });
      return {
        operationId: operation.operationId
      };
    }

    this.activeOperationId = operation.operationId;
    this.setRuntimeState('STOPPING', `Deteniendo Palworld Dedicated Server. PID ${targetProcesses.map((process) => String(process.pid)).join(', ')}.`);
    this.stopAsync(operation.operationId, targetProcesses, installation.executablePath);

    return {
      operationId: operation.operationId
    };
  }

  private startAsync(operationId: string, executablePath: string): void {
    void this.startProcessAsync(operationId, executablePath);
  }

  private async startProcessAsync(operationId: string, executablePath: string): Promise<void> {
    try {
      this.operationManagerService.update(operationId, {
        status: 'RUNNING',
        percent: 10,
        message: 'Verificando puertos requeridos antes de iniciar.',
        canCancel: false
      });
      const runtimeExecutable = resolvePalworldRuntimeExecutable(executablePath);
      this.appendLog(operationId, `"${runtimeExecutable.executablePath}"`);
      await assertUdpPortAvailable(STEAM_QUERY_PORT);

      this.operationManagerService.update(operationId, {
        status: 'RUNNING',
        percent: 20,
        message: `Lanzando ${runtimeExecutable.displayName} oculto para capturar logs en la app.`,
        canCancel: false
      });
      const child = spawn(
        runtimeExecutable.executablePath,
        [],
        createHiddenProcessOptions(runtimeExecutable.workingDirectory)
      );
      this.process = child;

      child.once('spawn', () => {
        this.startedAt = new Date().toISOString();
        this.stoppedAt = undefined;
        this.observedProcess = null;
        this.setRuntimeState('RUNNING', `Servidor en ejecucion. PID ${String(child.pid ?? 'desconocido')}.`);
        this.operationManagerService.update(operationId, {
          status: 'COMPLETED',
          percent: 100,
          message: this.message,
          logMessage: true
        });
        this.activeOperationId = null;
      });

      child.stdout?.on('data', (chunk: Buffer) => {
        this.handleProcessOutput(operationId, chunk);
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        this.handleProcessOutput(operationId, chunk);
      });

      child.once('error', (error) => {
        this.process = null;
        this.observedProcess = null;
        this.stoppedAt = new Date().toISOString();
        this.setRuntimeState('ERROR', `No se pudo iniciar PalServer.exe: ${error.message}`);
        this.failActiveOperation(operationId, error.message);
      });

      child.once('close', (code) => {
        const wasStopping = this.state === 'STOPPING' || Date.now() - this.stopRequestedAt < 30_000;
        this.process = null;
        this.observedProcess = null;
        this.stoppedAt = new Date().toISOString();

        if (wasStopping || code === 0 || code === 3221225786 || code === 3221225794) {
          this.setRuntimeState('STOPPED', 'Servidor detenido.');
          this.completeActiveOperation(operationId, 'PalServer.exe se detuvo.');
          return;
        }

        const exitMessage = `PalServer.exe finalizo con codigo ${String(code)}.`;
        this.setRuntimeState('ERROR', exitMessage);
        this.failActiveOperation(operationId, exitMessage);
      });
    } catch (error) {
      this.process = null;
      this.stoppedAt = new Date().toISOString();
      const message = error instanceof Error ? error.message : String(error);
      this.setRuntimeState('ERROR', `No se pudo iniciar PalServer.exe: ${message}`);
      this.failActiveOperation(operationId, message);
    }
  }

  private stopAsync(operationId: string, processes: DetectedPalServerProcess[], executablePath: string): void {
    const pids = processes.map((process) => process.pid);
    this.stopRequestedAt = Date.now();
    this.operationManagerService.update(operationId, {
      status: 'RUNNING',
      percent: 20,
      message: `Solicitando cierre de procesos Palworld. PID ${pids.map((pid) => String(pid)).join(', ')}.`,
      canCancel: false
    });

    const result = killProcessTree(pids);

    if (!result.ok) {
      this.operationManagerService.appendLog(operationId, result.message);
    }

    this.waitForStop(operationId, executablePath, 0);
  }

  private waitForStop(operationId: string, executablePath: string, attempt: number): void {
    const detected = this.getActiveProcesses(executablePath, { forceScan: true });
    const isStillRunning = detected.length > 0;

    if (!isStillRunning) {
      this.process = null;
      this.observedProcess = null;
      this.activeOperationId = null;
      this.stoppedAt = new Date().toISOString();
      this.setRuntimeState('STOPPED', 'Servidor detenido desde la app.');
      this.operationManagerService.update(operationId, {
        status: 'COMPLETED',
        percent: 100,
        message: 'PalServer.exe se detuvo.'
      });
      return;
    }

    if (attempt >= 20) {
      this.operationManagerService.update(operationId, {
        status: 'RUNNING',
        percent: 95,
        message: 'PalServer.exe sigue cerrando. Esperando confirmacion del sistema.',
        logMessage: false
      });
      windowlessTimeout(() => {
        this.waitForStop(operationId, executablePath, 0);
      }, 1000);
      return;
    }

    this.operationManagerService.update(operationId, {
      status: 'RUNNING',
      percent: Math.min(95, 20 + attempt * 4),
      message: 'Esperando que PalServer.exe termine.',
      logMessage: false
    });
    windowlessTimeout(() => {
      this.waitForStop(operationId, executablePath, attempt + 1);
    }, 500);
  }

  private reconcileRuntimeStatus(executablePath: string): void {
    if (this.process && this.process.pid && !isPidRunning(this.process.pid)) {
      this.process = null;
    }

    const previousObservedPid = this.observedProcess?.pid ?? this.process?.pid;
    const detectedProcesses = this.getActiveProcesses(executablePath);
    const detected = detectedProcesses[0] ?? null;
    this.observedProcess = detected;

    if (detected) {
      if (this.state !== 'STOPPING') {
        this.startedAt ??= new Date().toISOString();
        this.stoppedAt = undefined;
        const message = `Servidor activo detectado. PID ${String(detected.pid)}.`;
        if (this.state !== 'RUNNING' || previousObservedPid !== detected.pid || this.message !== message) {
          this.setRuntimeState('RUNNING', message);
        }
      }
      return;
    }

    if (['STARTING', 'RUNNING', 'STOPPING'].includes(this.state)) {
      this.process = null;
      this.stoppedAt = new Date().toISOString();
      this.setRuntimeState('STOPPED', 'Servidor detenido.');
    }
  }

  private getActiveProcesses(
    executablePath: string,
    options?: { forceScan?: boolean }
  ): DetectedPalServerProcess[] {
    if (this.process?.pid && isPidRunning(this.process.pid)) {
      return [
        {
          pid: this.process.pid,
          executablePath
        }
      ];
    }

    const now = Date.now();
    if (!options?.forceScan && now - this.lastProcessScanAt < PROCESS_SCAN_CACHE_MS) {
      return [...this.cachedProcessScan];
    }

    const processes = findPalServerProcesses(executablePath);
    this.lastProcessScanAt = now;
    this.cachedProcessScan = processes;
    return [...processes];
  }

  private handleProcessOutput(operationId: string, chunk: Buffer): void {
    const lines = chunk
      .toString('utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    lines.forEach((line) => {
      this.appendLog(operationId, line);
    });
  }

  private appendLog(operationId: string, line: string): void {
    this.logs.push(line);

    if (this.logs.length > 500) {
      this.logs.splice(0, this.logs.length - 500);
    }

    if (this.activeOperationId === operationId) {
      this.operationManagerService.appendLog(operationId, line);
    }
    void this.loggingService?.write('palserver', 'INFO', line);
  }

  private setRuntimeState(state: PalworldRuntimeState, message: string): void {
    if (this.state === state && this.message === message) {
      return;
    }

    this.state = state;
    this.message = message;
    this.updatedAt = new Date().toISOString();

    this.logs.push(message);
    if (this.logs.length > 500) {
      this.logs.splice(0, this.logs.length - 500);
    }

    void this.loggingService?.write('palserver', state === 'ERROR' ? 'ERROR' : 'INFO', message);
  }

  private completeActiveOperation(operationId: string, message: string): void {
    if (this.activeOperationId !== operationId) {
      return;
    }

    this.operationManagerService.update(operationId, {
      status: 'COMPLETED',
      percent: 100,
      message
    });
    this.activeOperationId = null;
  }

  private failActiveOperation(operationId: string, error: string): void {
    if (this.activeOperationId !== operationId) {
      return;
    }

    this.operationManagerService.update(operationId, {
      status: 'FAILED',
      percent: 100,
      message: this.message,
      error
    });
    this.activeOperationId = null;
  }
}

function createHiddenProcessOptions(workingDirectory: string): SpawnOptions {
  return {
    cwd: workingDirectory,
    windowsHide: true,
    detached: false,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe']
  };
}

export function resolvePalworldRuntimeExecutable(executablePath: string): PalworldRuntimeExecutable {
  const installRoot = dirname(executablePath);
  const commandExecutablePath = join(
    installRoot,
    'Pal',
    'Binaries',
    'Win64',
    'PalServer-Win64-Shipping-Cmd.exe'
  );

  if (existsSync(commandExecutablePath)) {
    return {
      executablePath: commandExecutablePath,
      workingDirectory: installRoot,
      displayName: 'PalServer-Win64-Shipping-Cmd.exe'
    };
  }

  return {
    executablePath,
    workingDirectory: installRoot,
    displayName: 'PalServer.exe'
  };
}

function findPalServerProcesses(expectedExecutablePath: string): DetectedPalServerProcess[] {
  const result = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      "$names = @('PalServer','PalServer-Win64-Shipping','PalServer-Win64-Shipping-Cmd'); Get-Process -Name $names -ErrorAction SilentlyContinue | Select-Object Id,Path | ConvertTo-Json -Compress"
    ],
    {
      encoding: 'utf8',
      windowsHide: true,
      shell: false,
      timeout: 2000
    }
  );

  if (result.error || result.status !== 0 || !result.stdout) {
    return [];
  }

  const expectedPaths = createExpectedRuntimePaths(expectedExecutablePath);
  return parsePowerShellProcesses(result.stdout)
    .filter((process) => expectedPaths.has(normalizePath(process.executablePath)))
    .map((process) => ({
      pid: process.pid,
      executablePath: process.executablePath
    }));
}

function isPidRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function normalizePath(value: string): string {
  return normalize(value).toLowerCase();
}

function createExpectedRuntimePaths(executablePath: string): Set<string> {
  const installRoot = dirname(executablePath);

  return new Set([
    normalizePath(executablePath),
    normalizePath(join(installRoot, 'Pal', 'Binaries', 'Win64', 'PalServer-Win64-Shipping-Cmd.exe'))
  ]);
}

function killProcessTree(pids: number[]): { ok: boolean; message: string } {
  const uniquePids = Array.from(new Set(pids));
  let ok = true;
  const messages: string[] = [];

  uniquePids.forEach((pid) => {
    const result = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
      encoding: 'utf8',
      windowsHide: true,
      shell: false,
      timeout: 5000
    });

    if (result.status !== 0) {
      ok = false;
      messages.push(result.stderr.trim() || result.stdout.trim() || `No se pudo detener PID ${String(pid)}.`);
      return;
    }

    messages.push(result.stdout.trim() || `PID ${String(pid)} detenido.`);
  });

  return {
    ok,
    message: messages.join('\n')
  };
}

function parsePowerShellProcesses(output: string): DetectedPalServerProcess[] {
  const trimmedOutput = output.trim();

  if (!trimmedOutput) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmedOutput) as unknown;
    const rows = Array.isArray(parsed) ? parsed : [parsed];

    return rows
      .map((row) => normalizePowerShellProcessRow(row))
      .filter((row): row is DetectedPalServerProcess => row !== null);
  } catch {
    return [];
  }
}

function normalizePowerShellProcessRow(row: unknown): DetectedPalServerProcess | null {
  if (!row || typeof row !== 'object') {
    return null;
  }

  const processRow = row as PowerShellProcessRow;
  const pid = Number(processRow.Id);
  const executablePath = typeof processRow.Path === 'string' ? processRow.Path : '';

  if (!Number.isInteger(pid) || executablePath.length === 0) {
    return null;
  }

  return {
    pid,
    executablePath
  };
}

function windowlessTimeout(callback: () => void, milliseconds: number): void {
  setTimeout(callback, milliseconds);
}

async function assertUdpPortAvailable(port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = createSocket('udp4');
    let settled = false;

    const finish = (error?: Error): void => {
      if (settled) {
        return;
      }

      settled = true;
      socket.close();

      if (error) {
        reject(error);
        return;
      }

      resolve();
    };

    socket.once('error', () => {
      finish(
        new Error(
          `SERVER_QUERY_PORT_IN_USE: el puerto UDP ${String(port)} esta ocupado. Cierra otra instancia del servidor o cambia el puerto query antes de iniciar.`
        )
      );
    });
    socket.once('listening', () => {
      finish();
    });
    socket.bind(port);
  });
}
