export type CgnatStatus = 'LIKELY' | 'UNLIKELY' | 'NEEDS_ROUTER_CHECK' | 'UNKNOWN';
export type PublicPortProbeState = 'OPEN' | 'CLOSED' | 'FILTERED' | 'UNKNOWN';

export interface PublicPortProbeDto {
  port: number;
  tcp: PublicPortProbeState;
  udp: PublicPortProbeState;
  provider: string;
  checkedAt: string;
  message: string;
}

export interface PublicAddressRequestDto {
  port?: number;
}

export interface ExternalAccessEvidenceDto {
  source: 'REMOTE_PLAYER';
  observedAt: string;
  message: string;
}

export interface NetworkDiagnosticsDto {
  publicIp: string | null;
  localIpv4: string[];
  cgnatStatus: CgnatStatus;
  publicPortProbe?: PublicPortProbeDto;
  externalAccessEvidence?: ExternalAccessEvidenceDto;
  message: string;
  recommendation: string;
  updatedAt: string;
}
