import { Injectable } from '@nestjs/common';
import { appendFile, mkdir, readFile, readdir, rename, stat, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { PortablePathService } from '../portable-path/portable-path.service';
import { formatLocalLogTimestamp } from '../../shared/utils/local-time';
import type {
  LogEntryDto,
  LogFileContentDto,
  LogFileReadRequestDto,
  LogFileSummaryDto,
  LogFilesDto,
  LogLevel,
  LogModule,
  LogsRecentDto,
  LogsRecentRequestDto
} from '../../shared/dto/log-status.dto';

const LOG_MODULES: LogModule[] = ['manager', 'steamcmd', 'palserver', 'firewall', 'backup', 'api', 'error'];
const MAX_LOG_BYTES = 5 * 1024 * 1024;
const MAX_LOG_FILES_PER_MODULE = 10;

@Injectable()
export class LoggingService {
  private readonly sessionStartedAt = new Date(Date.now() - 1000);

  constructor(private readonly portablePathService: PortablePathService) {}

  async write(module: LogModule, level: LogLevel, message: string): Promise<void> {
    const line = `[${formatLocalLogTimestamp()}] [${level}] [${module}] ${sanitizeLogMessage(message)}\n`;
    const filePath = this.getLogPath(module);

    await mkdir(this.portablePathService.getLogsRoot(), { recursive: true });
    await this.rotateIfNeeded(filePath);
    await appendFile(filePath, line, 'utf8');

    if (level === 'ERROR' && module !== 'error') {
      await this.write('error', level, `[${module}] ${message}`);
    }
  }

  async readRecent(request: LogsRecentRequestDto = {}): Promise<LogsRecentDto> {
    const modules = normalizeModules(request.modules);
    const maxLines = normalizeMaxLines(request.maxLines);
    const entries = await Promise.all(modules.map((module) => this.readModule(module, maxLines)));

    return {
      entries,
      updatedAt: new Date().toISOString()
    };
  }

  async listFiles(): Promise<LogFilesDto> {
    const logsRoot = this.portablePathService.getLogsRoot();
    if (!existsSync(logsRoot)) {
      return { files: [], updatedAt: new Date().toISOString() };
    }

    const names = await readdir(logsRoot);
    const files = (
      await Promise.all(
        names
          .filter(isKnownLogFilename)
          .map(async (name): Promise<LogFileSummaryDto> => {
            const metadata = await stat(join(logsRoot, name));
            const module = parseLogModule(name);
            return {
              id: createLogFileId(module, name),
              module,
              relativePath: `logs/${name}`,
              sizeBytes: metadata.size,
              updatedAt: metadata.mtime.toISOString(),
              isActiveFile: name === `${module}.log`
            };
          })
      )
    ).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

    return { files, updatedAt: new Date().toISOString() };
  }

  async readFile(request: LogFileReadRequestDto): Promise<LogFileContentDto> {
    const file = (await this.listFiles()).files.find((candidate) => candidate.id === request.id);
    if (!file) {
      throw new Error('LOG_FILE_NOT_FOUND');
    }

    const filename = basename(file.relativePath);
    if (!isKnownLogFilename(filename)) {
      throw new Error('LOG_FILE_INVALID');
    }

    const maxLines = normalizeHistoricalMaxLines(request.maxLines);
    const allLines = (await readFile(join(this.portablePathService.getLogsRoot(), filename), 'utf8'))
      .split(/\r?\n/)
      .filter((line) => line.length > 0);

    return {
      file,
      lines: allLines.slice(-maxLines),
      truncated: allLines.length > maxLines
    };
  }

  getLogPath(module: LogModule): string {
    return join(this.portablePathService.getLogsRoot(), `${module}.log`);
  }

  private async readModule(module: LogModule, maxLines: number): Promise<LogEntryDto> {
    const path = this.getLogPath(module);

    if (!existsSync(path)) {
      return {
        module,
        path,
        lines: [],
        updatedAt: null
      };
    }

    const [content, metadata] = await Promise.all([readFile(path, 'utf8'), stat(path)]);
    const lines = content
      .split(/\r?\n/)
      .filter((line) => line.length > 0)
      .filter((line) => isCurrentSessionLine(line, this.sessionStartedAt))
      .slice(-maxLines);

    return {
      module,
      path,
      lines,
      updatedAt: metadata.mtime.toISOString()
    };
  }

  private async rotateIfNeeded(filePath: string): Promise<void> {
    if (!existsSync(filePath)) {
      return;
    }

    const metadata = await stat(filePath);

    if (metadata.size < MAX_LOG_BYTES) {
      return;
    }

    const oldestPath = `${filePath}.${String(MAX_LOG_FILES_PER_MODULE - 1)}`;

    if (existsSync(oldestPath)) {
      await unlink(oldestPath);
    }

    for (let index = MAX_LOG_FILES_PER_MODULE - 2; index >= 1; index -= 1) {
      const sourcePath = `${filePath}.${String(index)}`;
      const targetPath = `${filePath}.${String(index + 1)}`;

      if (existsSync(sourcePath)) {
        await rename(sourcePath, targetPath);
      }
    }

    await rename(filePath, `${filePath}.1`);
  }
}

function normalizeModules(modules: LogModule[] | undefined): LogModule[] {
  if (!modules || modules.length === 0) {
    return LOG_MODULES;
  }

  return modules.filter((module): module is LogModule => LOG_MODULES.includes(module));
}

function normalizeMaxLines(maxLines: number | undefined): number {
  if (!Number.isFinite(maxLines)) {
    return 200;
  }

  return Math.max(20, Math.min(1000, Math.trunc(maxLines ?? 200)));
}

function normalizeHistoricalMaxLines(maxLines: number | undefined): number {
  if (!Number.isFinite(maxLines)) {
    return 1000;
  }
  return Math.max(100, Math.min(5000, Math.trunc(maxLines ?? 1000)));
}

function isKnownLogFilename(name: string): boolean {
  return /^(manager|steamcmd|palserver|firewall|backup|api|error)\.log(?:\.[1-9])?$/.test(name);
}

function parseLogModule(name: string): LogModule {
  const module = name.split('.')[0] as LogModule;
  if (!LOG_MODULES.includes(module)) {
    throw new Error('LOG_FILE_MODULE_INVALID');
  }
  return module;
}

function createLogFileId(module: LogModule, name: string): string {
  return `${module}:${name}`;
}

function sanitizeLogMessage(message: string): string {
  return message.replace(/(password|token|secret|authorization)\s*[:=]\s*\S+/gi, '$1=<redacted>');
}

function isCurrentSessionLine(line: string, sessionStartedAt: Date): boolean {
  const timestamp = parseLogTimestamp(line);

  return timestamp !== null && timestamp >= sessionStartedAt;
}

function parseLogTimestamp(line: string): Date | null {
  const timestampMatch = line.match(/^\[([^\]]+)]/);
  const timestampValue = timestampMatch?.[1];

  if (!timestampValue) {
    return null;
  }

  const localTimestampMatch = timestampValue.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);

  if (localTimestampMatch) {
    const year = Number(localTimestampMatch[1] ?? '0');
    const month = Number(localTimestampMatch[2] ?? '1') - 1;
    const day = Number(localTimestampMatch[3] ?? '1');
    const hour = Number(localTimestampMatch[4] ?? '0');
    const minute = Number(localTimestampMatch[5] ?? '0');
    const second = Number(localTimestampMatch[6] ?? '0');

    return new Date(year, month, day, hour, minute, second);
  }

  const parsedTimestamp = new Date(timestampValue);

  if (Number.isNaN(parsedTimestamp.getTime())) {
    return null;
  }

  return parsedTimestamp;
}
