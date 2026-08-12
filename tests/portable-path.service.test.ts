import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PortablePathService } from '../src/backend/portable-path/portable-path.service';

describe('PortablePathService', () => {
  afterEach(() => {
    delete process.env['PALCM_RUNTIME_ENV'];
    delete process.env['PORTABLE_EXECUTABLE_DIR'];
    delete process.env['PALCM_ELECTRON_EXE_PATH'];
    delete process.env['PALCM_ELECTRON_IS_PACKAGED'];
    delete process.env['PALCM_MULTI_SERVER'];
    delete process.env['PALCM_APP_DATA_PATH'];
    rmSync(join(process.cwd(), '.tmp-tests', 'server-instances'), { recursive: true, force: true });
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

  it('persists a selected installed server using its configured name', () => {
    const rootPath = join(process.cwd(), '.tmp-tests', 'server-instances', 'mendoza');
    const serverRoot = join(rootPath, 'server', 'palworld');
    const configPath = join(serverRoot, 'Pal', 'Saved', 'Config', 'WindowsServer', 'PalWorldSettings.ini');
    const appDataPath = join(process.cwd(), '.tmp-tests', 'server-instances', 'app-data');

    mkdirSync(join(serverRoot, 'Pal', 'Saved', 'Config', 'WindowsServer'), { recursive: true });
    writeFileSync(join(serverRoot, 'PalServer.exe'), 'fixture', 'utf8');
    writeFileSync(configPath, 'OptionSettings=(ServerName="PalPeople")', 'utf8');
    process.env['PALCM_MULTI_SERVER'] = 'true';
    process.env['PALCM_APP_DATA_PATH'] = appDataPath;

    const firstService = new PortablePathService();
    const created = firstService.addServerFolder(rootPath);
    const instance = created.instances[0];

    expect(instance).toBeDefined();
    if (!instance) {
      throw new Error('La instancia registrada no esta disponible.');
    }

    expect(instance).toMatchObject({
      name: 'PalPeople',
      isSelected: true,
      rootPath
    });
    expect(firstService.getPalworldServerRoot()).toBe(serverRoot);
    expect(firstService.getServerInstanceExecutablePath(instance.id)).toBe(join(serverRoot, 'PalServer.exe'));

    const restoredService = new PortablePathService();
    expect(restoredService.getServerInstances()).toMatchObject({
      mode: 'MULTI_SERVER',
      selectedInstanceId: instance.id
    });
    expect(restoredService.getSelectedServerInstanceName()).toBe('PalPeople');
  });
});
