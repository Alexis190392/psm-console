import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('renderer action wiring', () => {
  const rendererRoot = join(process.cwd(), 'src', 'renderer');
  const source = collectTypeScript(rendererRoot)
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');

  it('keeps every static button id connected to another renderer reference', () => {
    const ids = Array.from(source.matchAll(/<button[^>]*\bid="([^"$]+)"/g), (match) => match[1] ?? '');
    const uniqueIds = [...new Set(ids)].filter(Boolean);

    expect(uniqueIds.length).toBeGreaterThan(0);
    uniqueIds.forEach((id) => {
      const references = source.match(new RegExp(escapeRegex(id), 'g'))?.length ?? 0;
      expect(references, `El boton #${id} no tiene binding ni actualizacion asociada`).toBeGreaterThan(1);
    });
  });

  it('keeps every rendered admin form kind handled by the action resolver', () => {
    const renderedKinds = Array.from(
      source.matchAll(/data-admin-form="([^"$]+)"/g),
      (match) => match[1] ?? ''
    );

    for (const kind of new Set(renderedKinds.filter(Boolean))) {
      if (kind === 'player') {
        expect(source).toContain("playerAction === 'kick'");
        expect(source).toContain("playerAction === 'ban'");
        expect(source).toContain("playerAction === 'unban'");
        continue;
      }
      expect(source, `El formulario administrativo ${kind} no se resuelve`).toContain(`formKind === '${kind}'`);
    }
  });

  it('refreshes the desktop runtime state after remote server actions', () => {
    expect(source).toContain('palcmApi.server.onRuntimeStatusChanged(scheduleRuntimeStateRefresh)');
    expect(source).toContain('await refreshStatusChrome()');
  });
});

function collectTypeScript(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectTypeScript(path);
    }
    return extname(entry.name) === '.ts' ? [path] : [];
  });
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
