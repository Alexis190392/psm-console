export type LogModule = 'manager' | 'steamcmd' | 'palserver' | 'firewall' | 'backup' | 'api' | 'error';
export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface LogEntryDto {
  module: LogModule;
  path: string;
  lines: string[];
  updatedAt: string | null;
}

export interface LogsRecentDto {
  entries: LogEntryDto[];
  updatedAt: string;
}

export interface LogsRecentRequestDto {
  modules?: LogModule[];
  maxLines?: number;
}

