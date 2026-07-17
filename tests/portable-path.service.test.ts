import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PortablePathService } from '../src/backend/portable-path/portable-path.service';

describe('PortablePathService', () => {
  afterEach(() => {
    delete process.env['PALCM_RUNTIME_ENV'];
  });

  it('uses the executable directory when packaged', () => {
    const service = new PortablePathService({
      isPackaged: true,
      getPath: () => 'C:\\Portable\\PalworldServerManager.exe'
    });

    expect(service.getPortableRoot()).toBe('C:\\Portable');
  });

  it('uses ejecucionPruebas as portable root in development mode', () => {
    process.env['PALCM_RUNTIME_ENV'] = 'development';

    const service = new PortablePathService();

    expect(service.getPortableRoot()).toBe(join(process.cwd(), 'ejecucionPruebas'));
  });

  it('creates the development portable layout', () => {
    process.env['PALCM_RUNTIME_ENV'] = 'development';
    const service = new PortablePathService();

    service.ensurePortableLayout();

    expect(existsSync(join(process.cwd(), 'ejecucionPruebas', 'tools', 'steamcmd'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'ejecucionPruebas', 'server', 'palworld'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'ejecucionPruebas', 'backups', 'world'))).toBe(true);
  });
});
