import type { PalworldSettingDefinition } from './palworld-settings-catalog';

export interface ParsedPalworldSetting {
  key: string;
  value: string;
}

export interface ParsedPalworldSettings {
  originalContent: string;
  prefix: string;
  suffix: string;
  settings: ParsedPalworldSetting[];
}

export function parsePalworldSettings(content: string): ParsedPalworldSettings {
  const marker = 'OptionSettings=(';
  const start = content.indexOf(marker);

  if (start < 0) {
    return {
      originalContent: content,
      prefix: content,
      suffix: '',
      settings: []
    };
  }

  const valueStart = start + marker.length;
  const valueEnd = findOptionSettingsEnd(content, valueStart);
  const body = content.slice(valueStart, valueEnd);

  return {
    originalContent: content,
    prefix: content.slice(0, valueStart),
    suffix: content.slice(valueEnd),
    settings: splitTopLevel(body).map((entry) => {
      const separator = entry.indexOf('=');
      return {
        key: entry.slice(0, separator).trim(),
        value: entry.slice(separator + 1).trim()
      };
    })
  };
}

export function serializePalworldSettings(parsed: ParsedPalworldSettings, values: Map<string, string>): string {
  const nextBody = parsed.settings
    .map((setting) => `${setting.key}=${values.get(setting.key) ?? setting.value}`)
    .join(',');

  return `${parsed.prefix}${nextBody}${parsed.suffix}`;
}

export function formatSettingValue(
  definition: PalworldSettingDefinition,
  value: string,
  originalValue: string
): string {
  if (definition.kind === 'text' && shouldQuoteTextValue(value, originalValue)) {
    return `"${value.replaceAll('"', '\\"')}"`;
  }

  return value;
}

export function unquoteSettingValue(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replaceAll('\\"', '"');
  }

  return value;
}

function findOptionSettingsEnd(content: string, valueStart: number): number {
  let isQuoted = false;
  let depth = 0;

  for (let index = valueStart; index < content.length; index += 1) {
    const char = content[index];

    if (char === '"' && content[index - 1] !== '\\') {
      isQuoted = !isQuoted;
      continue;
    }

    if (!isQuoted && char === '(') {
      depth += 1;
      continue;
    }

    if (!isQuoted && char === ')' && depth > 0) {
      depth -= 1;
      continue;
    }

    if (!isQuoted && char === ')') {
      return index;
    }
  }

  return content.length;
}

function splitTopLevel(value: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  let isQuoted = false;

  for (const char of value) {
    if (char === '"') {
      isQuoted = !isQuoted;
    }

    if (!isQuoted && char === '(') {
      depth += 1;
    }

    if (!isQuoted && char === ')') {
      depth -= 1;
    }

    if (!isQuoted && depth === 0 && char === ',') {
      parts.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim().length > 0) {
    parts.push(current);
  }

  return parts;
}

function shouldQuoteTextValue(value: string, originalValue: string): boolean {
  if (value.startsWith('(') && value.endsWith(')')) {
    return false;
  }

  return originalValue.startsWith('"') || value.length === 0 || /[\s:/\\]/.test(value);
}
