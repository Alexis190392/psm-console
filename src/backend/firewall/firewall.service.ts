import { Injectable } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PalworldConfigurationService } from '../palworld-configuration/palworld-configuration.service';
import { PalworldInstallationService } from '../palworld-installation/palworld-installation.service';
import { OperationManagerService } from '../operations/operation-manager.service';
import { NetworkService } from '../network/network.service';
import type {
  FirewallApplyRulesRequestDto,
  FirewallPortCheckDto,
  FirewallPortRequirementDto,
  FirewallStatusDto
} from '../../shared/dto/firewall-status.dto';
import type { OperationAcceptedDto } from '../../shared/dto/operation-progress.dto';

const execFileAsync = promisify(execFile);

@Injectable()
export class FirewallService {
  constructor(
    private readonly palworldConfigurationService: PalworldConfigurationService,
    private readonly palworldInstallationService: PalworldInstallationService,
    private readonly operationManagerService: OperationManagerService,
    private readonly networkService: NetworkService
  ) {}

  async getStatus(): Promise<FirewallStatusDto> {
    const requirements = await this.getRequiredPorts();
    const [localPorts, network] = await Promise.all([
      this.checkLocalPorts(requirements),
      this.networkService.getDiagnostics()
    ]);
    const missingLocalPorts = localPorts.filter((port) => port.enabled && port.state === 'MISSING');
    const hasLocalError = localPorts.some((port) => ['ERROR', 'UNSUPPORTED'].includes(port.state));
    const externalPorts = requirements.map((requirement) => this.createExternalCheck(requirement));

    return {
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
          `New-NetFirewallRule ${port.protocol} ${String(port.port)} "${server.executablePath}"`
        );
        ruleScripts.push(buildFirewallRuleScript(port, server.executablePath));
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
    const values = parseOptionSettings(configuration.content);
    const publicPort = parsePort(values.get('PublicPort')) ?? 8211;
    const rconEnabled = parseBoolean(values.get('RCONEnabled'));
    const rconPort = parsePort(values.get('RCONPort')) ?? 25575;
    const restApiEnabled = parseBoolean(values.get('RESTAPIEnabled'));
    const restApiPort = parsePort(values.get('RESTAPIPort')) ?? 8212;

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
      },
      {
        key: 'RESTAPIPort',
        label: 'REST API',
        port: restApiPort,
        protocol: 'TCP',
        enabled: restApiEnabled,
        source: 'RESTAPIEnabled + RESTAPIPort'
      }
    ];
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
      const executablePath = server.status === 'READY' ? server.executablePath : '';
      const requirementJson = JSON.stringify(
        enabledRequirements.map((requirement) => ({
          key: requirement.key,
          port: requirement.port,
          protocol: requirement.protocol
        }))
      );
      const script = `
$requirements = '${escapePowerShellSingleQuoted(requirementJson)}' | ConvertFrom-Json
$rules = Get-NetFirewallRule -Direction Inbound -Action Allow -Enabled True -ErrorAction SilentlyContinue
$results = @()
foreach ($requirement in $requirements) {
  $matches = @()
  foreach ($rule in $rules) {
    $port = $rule | Get-NetFirewallPortFilter -ErrorAction SilentlyContinue
    $app = $rule | Get-NetFirewallApplicationFilter -ErrorAction SilentlyContinue
    if ($null -eq $port) { continue }
    if ($port.Protocol -ne $requirement.protocol) { continue }
    if ([string]$port.LocalPort -ne [string]$requirement.port) { continue }
    if ('${escapePowerShellSingleQuoted(executablePath)}' -ne '' -and $null -ne $app -and $app.Program -ne 'Any' -and $app.Program -ne '${escapePowerShellSingleQuoted(executablePath)}') { continue }
    $matches += $rule.DisplayName
  }
  $results += @{ key = $requirement.key; ok = ($matches.Count -gt 0); rules = $matches }
}
$results | ConvertTo-Json -Compress
`;
      const output = await runPowerShell(script);
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
        message: error instanceof Error ? error.message : String(error)
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
  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script
  ]);

  return stdout.trim();
}

async function runPowerShellElevated(script: string): Promise<void> {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const launcher = `
$process = Start-Process -FilePath powershell.exe -Verb RunAs -Wait -PassThru -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand','${encoded}'
if ($process.ExitCode -ne 0) { throw "Elevated PowerShell exited with code $($process.ExitCode)" }
`;
  await runPowerShell(launcher);
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
