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

export interface LogFileSummaryDto {
  id: string;
  module: LogModule;
  relativePath: string;
  sizeBytes: number;
  updatedAt: string;
  isActiveFile: boolean;
}

export interface LogFilesDto {
  files: LogFileSummaryDto[];
  updatedAt: string;
}

export interface LogFileReadRequestDto {
  id: string;
  maxLines?: number;
}

export interface LogFileContentDto {
  file: LogFileSummaryDto;
  lines: string[];
  truncated: boolean;
}
