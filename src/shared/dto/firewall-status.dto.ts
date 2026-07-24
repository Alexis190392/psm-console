import type { NetworkDiagnosticsDto } from './network-diagnostics.dto';

export type FirewallPortProtocol = 'TCP' | 'UDP';
export type FirewallCheckState = 'READY' | 'MISSING' | 'UNKNOWN' | 'UNSUPPORTED' | 'ERROR';
export type FirewallDiagnosticStepId =
  | 'configuration'
  | 'windows-firewall'
  | 'public-network'
  | 'query-port'
  | 'summary';
export type FirewallDiagnosticStepState = 'active' | 'done' | 'error';

export interface FirewallDiagnosticRequestDto {
  requestId: string;
}

export interface FirewallDiagnosticProgressDto {
  requestId: string;
  step: FirewallDiagnosticStepId;
  state: FirewallDiagnosticStepState;
  title: string;
  detail: string;
}

export interface FirewallPortRequirementDto {
  key: string;
  label: string;
  port: number;
  protocol: FirewallPortProtocol;
  enabled: boolean;
  source: string;
}

export interface FirewallPortCheckDto extends FirewallPortRequirementDto {
  state: FirewallCheckState;
  message: string;
}

export interface FirewallStatusDto {
  local: {
    state: FirewallCheckState;
    ports: FirewallPortCheckDto[];
    message: string;
  };
  external: {
    state: FirewallCheckState;
    ports: FirewallPortCheckDto[];
    message: string;
    network: NetworkDiagnosticsDto;
  };
  updatedAt: string;
}

export interface FirewallApplyRulesRequestDto {
  confirmed: boolean;
}
