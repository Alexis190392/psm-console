import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PortablePathService } from '../src/backend/portable-path/portable-path.service';

describe('PortablePathService', () => {
  afterEach(() => {
    delete process.env['PALCM_RUNTIME_ENV'];
    delete process.env['PORTABLE_EXECUTABLE_DIR'];
    delete process.env['PALCM_ELECTRON_EXE_PATH'];
    delete process.env['PALCM_ELECTRON_IS_PACKAGED'];
  });

  it('uses the NSIS portable executable directory before any temp extraction cwd', () => {
    process.env['PORTABLE_EXECUTABLE_DIR'] = 'D:\\prueba pall';

    const service = new PortablePathService({
      isPackaged: true,
      getPath: () => 'C:\\Users\\alexi\\AppData\\Local\\Temp\\abc123\\Palworld Server Manager.exe'
    });

    expect(service.getPortableRoot()).toBe('D:\\prueba pall');
  });

  it('uses the executable directory when packaged', () => {
    const service = new PortablePathService({
      isPackaged: true,
      getPath: () => 'C:\\Portable\\PalworldServerManager.exe'
    });

    expect(service.getPortableRoot()).toBe('C:\\Portable');
  });

  it('uses the Electron executable path captured by the main process when packaged', () => {
    process.env['PALCM_ELECTRON_IS_PACKAGED'] = 'true';
    process.env['PALCM_ELECTRON_EXE_PATH'] = 'C:\\Installed\\Palworld Server Manager.exe';

    const service = new PortablePathService();

    expect(service.getPortableRoot()).toBe('C:\\Installed');
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
