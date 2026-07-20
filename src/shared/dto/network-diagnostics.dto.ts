export type CgnatStatus = 'LIKELY' | 'UNLIKELY' | 'NEEDS_ROUTER_CHECK' | 'UNKNOWN';

export interface NetworkDiagnosticsDto {
  publicIp: string | null;
  localIpv4: string[];
  cgnatStatus: CgnatStatus;
  message: string;
  recommendation: string;
  updatedAt: string;
}
