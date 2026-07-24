import { Injectable } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PalworldConfigurationService } from '../palworld-configuration/palworld-configuration.service';
import { PalworldInstallationService } from '../palworld-installation/palworld-installation.service';
import { resolvePalworldRuntimeExecutable } from '../palworld-process/palworld-process.service';
import { OperationManagerService } from '../operations/operation-manager.service';
import { NetworkService } from '../network/network.service';
import type {
  FirewallApplyRulesRequestDto,
  FirewallDiagnosticProgressDto,
  FirewallPortCheckDto,
  FirewallPortRequirementDto,
  FirewallStatusDto
} from '../../shared/dto/firewall-status.dto';
import type { OperationAcceptedDto } from '../../shared/dto/operation-progress.dto';

const execFileAsync = promisify(execFile);
const FIREWALL_QUERY_TIMEOUT_MS = 8_000;
const ELEVATED_POWERSHELL_TIMEOUT_MS = 5 * 60_000;
type FirewallDiagnosticReporter = (progress: Omit<FirewallDiagnosticProgressDto, 'requestId'>) => void;

@Injectable()
export class FirewallService {
  constructor(
    private readonly palworldConfigurationService: PalworldConfigurationService,
    private readonly palworldInstallationService: PalworldInstallationService,
    private readonly operationManagerService: OperationManagerService,
    private readonly networkService: NetworkService
  ) {}

  async getStatus(reportProgress: FirewallDiagnosticReporter = () => undefined): Promise<FirewallStatusDto> {
    reportProgress({
      step: 'configuration',
      state: 'active',
      title: 'Leyendo configuracion activa',
      detail: 'Abriendo PalWorldSettings.ini y localizando PublicPort, RCONEnabled y RCONPort.'
    });
    const requirements = await this.getRequiredPorts();
    reportProgress({
      step: 'configuration',
      state: 'done',
      title: 'Configuracion leida',
      detail: createRequiredPortsDetail(requirements)
    });
    reportProgress({
      step: 'windows-firewall',
      state: 'active',
      title: 'Consultando Firewall de Windows',
      detail: 'Leyendo las reglas nativas por protocolo y puerto, y validando el ejecutable real del servidor.'
    });
    reportProgress({
      step: 'public-network',
      state: 'active',
      title: 'Detectando conectividad',
      detail: 'Enumerando IPv4 LAN y consultando proveedores de IP publica con tiempo limite.'
    });

    const localPortsPromise = this.checkLocalPorts(requirements).then((ports) => {
      reportProgress({
        step: 'windows-firewall',
        state: 'done',
        title: 'Firewall de Windows revisado',
        detail: createLocalPortsDetail(ports)
      });
      return ports;
    });
    const networkPromise = this.networkService.getDiagnostics().then((network) => {
      reportProgress({
        step: 'public-network',
        state: 'done',
        title: 'Direcciones de red detectadas',
        detail: createNetworkDetail(network.publicIp, network.localIpv4)
      });
      return network;
    });
    const [localPorts, network] = await Promise.all([localPortsPromise, networkPromise]);
    reportProgress({
      step: 'summary',
      state: 'active',
      title: 'Preparando resultado',
      detail: 'Consolidando reglas faltantes y advertencias informativas sin bloquear el servidor.'
    });
    const missingLocalPorts = localPorts.filter((port) => port.enabled && port.state === 'MISSING');
    const hasLocalError = localPorts.some((port) => ['ERROR', 'UNSUPPORTED'].includes(port.state));
    const externalPorts = requirements.map((requirement) => this.createExternalCheck(requirement));

    const status: FirewallStatusDto = {
      local: {
        state: hasLocalError ? 'ERROR' : missingLocalPorts.length > 0 ? 'MISSING' : 'READY',
        ports: localPorts,
        message:
          missingLocalPorts.length > 0
            ? 'Faltan reglas de entrada en el Firewall de Windows.'
            : 'Las reglas locales necesarias estan configuradas.'
      },
      external: {
        state: 'UNKNOWN',
        ports: externalPorts,
        message:
          'La exposicion externa depende del router, NAT/CGNAT y del servidor en ejecucion. Prueba los puertos configurados desde otra red antes de cambiar mas valores.',
        network
      },
      updatedAt: new Date().toISOString()
    };

    reportProgress({
      step: 'summary',
      state: 'done',
      title: 'Diagnostico completado',
      detail: missingLocalPorts.length > 0
        ? `Faltan ${String(missingLocalPorts.length)} reglas locales; el acceso publico queda como informacion.`
        : 'Windows local esta listo; el acceso publico queda informado por separado.'
    });

    return status;
  }

  applyRequiredRules(request: FirewallApplyRulesRequestDto): OperationAcceptedDto {
    if (!request.confirmed) {
      throw new Error('FIREWALL_RULES_REQUIRE_CONFIRMATION');
    }

    const operation = this.operationManagerService.create(
      'Configuracion de Firewall',
      'Preparando reglas de entrada para Palworld.'
    );

    void this.applyRequiredRulesAsync(operation.operationId);

    return {
      operationId: operation.operationId
    };
  }

  private async applyRequiredRulesAsync(operationId: string): Promise<void> {
    try {
      const requirements = (await this.getRequiredPorts()).filter((requirement) => requirement.enabled);
      const server = this.palworldInstallationService.getStatus();

      if (server.status !== 'READY') {
        throw new Error('PALSERVER_NOT_INSTALLED');
      }
      const firewallExecutablePath = resolvePalworldRuntimeExecutable(server.executablePath).executablePath;

      this.operationManagerService.update(operationId, {
        status: 'RUNNING',
        percent: 20,
        message: 'Verificando reglas existentes.'
      });
      const checks = await this.checkLocalPorts(requirements);
      const missing = checks.filter((check) => check.state === 'MISSING');

      if (missing.length === 0) {
        this.operationManagerService.update(operationId, {
          status: 'COMPLETED',
          percent: 100,
          message: 'Firewall local ya estaba configurado.'
        });
        return;
      }

      const ruleScripts: string[] = [];

      for (const [index, port] of missing.entries()) {
        this.operationManagerService.update(operationId, {
          status: 'RUNNING',
          percent: 30 + Math.round((index / missing.length) * 55),
          message: `Preparando regla local ${port.protocol} ${String(port.port)}.`
        });
        this.operationManagerService.appendLog(
          operationId,
          `New-NetFirewallRule ${port.protocol} ${String(port.port)} "${firewallExecutablePath}"`
        );
        ruleScripts.push(buildFirewallRuleScript(port, firewallExecutablePath));
      }

      this.operationManagerService.update(operationId, {
        status: 'RUNNING',
        percent: 90,
        message: 'Solicitando permisos de Windows para crear reglas.'
      });
      await runPowerShellElevated(ruleScripts.join('\n'));

      this.operationManagerService.update(operationId, {
        status: 'COMPLETED',
        percent: 100,
        message: 'Reglas de Firewall creadas correctamente.'
      });
    } catch (error) {
      this.operationManagerService.update(operationId, {
        status: 'FAILED',
        percent: 100,
        message: 'No se pudieron configurar las reglas de Firewall.',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async getRequiredPorts(): Promise<FirewallPortRequirementDto[]> {
    const configuration = await this.palworldConfigurationService.readActive();
    return resolveFirewallPortRequirements(configuration.content);
  }

  private async checkLocalPorts(requirements: FirewallPortRequirementDto[]): Promise<FirewallPortCheckDto[]> {
    if (process.platform !== 'win32') {
      return requirements.map((requirement) => ({
        ...requirement,
        state: 'UNSUPPORTED',
        message: 'La verificacion local del Firewall solo aplica en Windows.'
      }));
    }

    const disabledChecks = requirements
      .filter((requirement) => !requirement.enabled)
      .map((requirement) => ({
        ...requirement,
        state: 'READY' as const,
        message: 'No requiere regla porque esta desactivado en la configuracion.'
      }));
    const enabledRequirements = requirements.filter((requirement) => requirement.enabled);

    if (enabledRequirements.length === 0) {
      return disabledChecks;
    }

    try {
      const server = this.palworldInstallationService.getStatus();
      const executablePath =
        server.status === 'READY'
          ? resolvePalworldRuntimeExecutable(server.executablePath).executablePath
          : '';
      const output = await runPowerShell(buildFirewallCheckScript(enabledRequirements, executablePath));
      const parsed = parsePowerShellChecks(output);
      const enabledChecks = enabledRequirements.map((requirement) => {
        const result = parsed.get(requirement.key);
        return {
          ...requirement,
          state: result?.ok ? 'READY' as const : 'MISSING' as const,
          message: result?.ok
            ? `Regla local encontrada: ${result.rules.join(', ')}`
            : 'Falta una regla de entrada permitida en Windows.'
        };
      });

      return mergeChecks(requirements, [...disabledChecks, ...enabledChecks]);
    } catch (error) {
      const errorChecks = enabledRequirements.map((requirement) => ({
        ...requirement,
        state: 'ERROR' as const,
        message: createFirewallCheckErrorMessage(error)
      }));

      return mergeChecks(requirements, [...disabledChecks, ...errorChecks]);
    }
  }

  private createExternalCheck(requirement: FirewallPortRequirementDto): FirewallPortCheckDto {
    if (!requirement.enabled) {
      return {
        ...requirement,
        state: 'READY',
        message: 'No se expone porque esta desactivado en la configuracion.'
      };
    }

    return {
      ...requirement,
      state: 'UNKNOWN',
      message: 'Pendiente de prueba externa. Inicia el servidor y verifica este puerto desde otra red o una herramienta online.'
    };
  }

}

export function buildFirewallCheckScript(
  requirements: FirewallPortRequirementDto[],
  executablePath: string
): string {
  const requirementJson = JSON.stringify(
    requirements.map((requirement) => ({
      key: requirement.key,
      port: requirement.port,
      protocolNumber: requirement.protocol === 'UDP' ? 17 : 6
    }))
  );
  const escapedExecutablePath = escapePowerShellSingleQuoted(executablePath);

  return `
$requirements = '${escapePowerShellSingleQuoted(requirementJson)}' | ConvertFrom-Json
$policy = New-Object -ComObject HNetCfg.FwPolicy2
$results = @()
foreach ($requirement in $requirements) {
  $matches = @()
  foreach ($rule in $policy.Rules) {
    if (-not [bool]$rule.Enabled) { continue }
    if ([int]$rule.Direction -ne 1) { continue }
    if ([int]$rule.Action -ne 1) { continue }
    if ([int]$rule.Protocol -ne [int]$requirement.protocolNumber) { continue }
    $localPorts = @([string]$rule.LocalPorts -split ',' | ForEach-Object { $_.Trim() })
    if ($localPorts -notcontains [string]$requirement.port) { continue }
    $applicationPath = [string]$rule.ApplicationName
    if ('${escapedExecutablePath}' -ne '' -and $applicationPath -ne '' -and $applicationPath -ne '${escapedExecutablePath}') { continue }
    $matches += [string]$rule.Name
  }
  $results += @{ key = $requirement.key; ok = ($matches.Count -gt 0); rules = @($matches | Select-Object -Unique) }
}
$results | ConvertTo-Json -Compress
`;
}

function createRequiredPortsDetail(requirements: FirewallPortRequirementDto[]): string {
  return requirements
    .map((requirement) => `${requirement.protocol} ${String(requirement.port)} (${requirement.enabled ? 'activo' : 'desactivado'})`)
    .join('; ');
}

function createLocalPortsDetail(ports: FirewallPortCheckDto[]): string {
  const enabled = ports.filter((port) => port.enabled);
  const ready = enabled.filter((port) => port.state === 'READY').length;
  const missing = enabled.filter((port) => port.state === 'MISSING').length;

  return `${String(ready)} reglas encontradas y ${String(missing)} pendientes entre los puertos activos.`;
}

function createNetworkDetail(publicIp: string | null, localIpv4: string[]): string {
  const local = localIpv4.length > 0 ? localIpv4.join(', ') : 'sin IPv4 LAN';
  return `LAN: ${local}; IP publica: ${publicIp ?? 'no disponible'}.`;
}

export function resolveFirewallPortRequirements(configurationContent: string): FirewallPortRequirementDto[] {
  const values = parseOptionSettings(configurationContent);
  const publicPort = parsePort(values.get('PublicPort')) ?? 8211;
  const rconEnabled = parseBoolean(values.get('RCONEnabled'));
  const rconPort = parsePort(values.get('RCONPort')) ?? 25575;

  return [
    {
      key: 'PublicPort',
      label: 'Jugadores',
      port: publicPort,
      protocol: 'UDP',
      enabled: true,
      source: 'PublicPort'
    },
    {
      key: 'RCONPort',
      label: 'RCON',
      port: rconPort,
      protocol: 'TCP',
      enabled: rconEnabled,
      source: 'RCONEnabled + RCONPort'
    }
  ];
}

function buildFirewallRuleScript(port: FirewallPortCheckDto, executablePath: string): string {
  const displayName = `PalCM Palworld ${port.protocol} ${String(port.port)}`;
  return `
$existing = Get-NetFirewallRule -DisplayName '${escapePowerShellSingleQuoted(displayName)}' -ErrorAction SilentlyContinue
if ($existing) {
  Remove-NetFirewallRule -DisplayName '${escapePowerShellSingleQuoted(displayName)}'
}
New-NetFirewallRule -DisplayName '${escapePowerShellSingleQuoted(displayName)}' -Direction Inbound -Action Allow -Protocol ${port.protocol} -LocalPort ${String(port.port)} -Program '${escapePowerShellSingleQuoted(executablePath)}' | Out-Null
`;
}

async function runPowerShell(script: string): Promise<string> {
  return runPowerShellWithTimeout(script, FIREWALL_QUERY_TIMEOUT_MS);
}

async function runPowerShellElevated(script: string): Promise<void> {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const launcher = `
$process = Start-Process -FilePath powershell.exe -Verb RunAs -Wait -PassThru -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand','${encoded}'
if ($process.ExitCode -ne 0) { throw "Elevated PowerShell exited with code $($process.ExitCode)" }
`;
  await runPowerShellWithTimeout(launcher, ELEVATED_POWERSHELL_TIMEOUT_MS);
}

async function runPowerShellWithTimeout(script: string, timeout: number): Promise<string> {
  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script
  ], {
    timeout,
    windowsHide: true,
    maxBuffer: 1024 * 1024
  });

  return stdout.trim();
}

export function createFirewallCheckErrorMessage(error: unknown): string {
  if (isPowerShellTimeout(error)) {
    return `Windows Firewall no respondio dentro de ${String(FIREWALL_QUERY_TIMEOUT_MS / 1000)} segundos. Reintenta el diagnostico.`;
  }

  return error instanceof Error ? error.message : String(error);
}

function isPowerShellTimeout(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { code?: unknown; killed?: unknown; signal?: unknown };
  return candidate.code === 'ETIMEDOUT' || candidate.killed === true || candidate.signal === 'SIGTERM';
}

function parsePowerShellChecks(output: string): Map<string, { ok: boolean; rules: string[] }> {
  const parsed = JSON.parse(output || '[]') as
    | { key?: string; ok?: boolean; rules?: string | string[] }
    | Array<{ key?: string; ok?: boolean; rules?: string | string[] }>;
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  const checks = new Map<string, { ok: boolean; rules: string[] }>();

  rows.forEach((row) => {
    if (!row.key) {
      return;
    }

    checks.set(row.key, {
      ok: row.ok === true,
      rules: Array.isArray(row.rules) ? row.rules : row.rules ? [row.rules] : []
    });
  });

  return checks;
}

function mergeChecks(
  requirements: FirewallPortRequirementDto[],
  checks: FirewallPortCheckDto[]
): FirewallPortCheckDto[] {
  return requirements.map((requirement) => {
    const check = checks.find((item) => item.key === requirement.key);

    return (
      check ?? {
        ...requirement,
        state: 'ERROR',
        message: 'No se recibio resultado para este puerto.'
      }
    );
  });
}

function parseOptionSettings(content: string): Map<string, string> {
  const values = new Map<string, string>();
  const match = content.match(/OptionSettings=\(([\s\S]*)\)/);

  const body = match?.[1];

  if (!body) {
    return values;
  }

  body.split(',').forEach((entry) => {
    const separator = entry.indexOf('=');

    if (separator < 0) {
      return;
    }

    values.set(entry.slice(0, separator).trim(), entry.slice(separator + 1).trim().replace(/^"|"$/g, ''));
  });

  return values;
}

function parsePort(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
}

function parseBoolean(value: string | undefined): boolean {
  return value?.toLowerCase() === 'true';
}

function escapePowerShellSingleQuoted(value: string): string {
  return value.replaceAll("'", "''");
}
