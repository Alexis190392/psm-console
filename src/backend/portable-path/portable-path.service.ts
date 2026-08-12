import { Inject, Injectable, Optional } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import type { ServerInstancesStatusDto } from '../../shared/dto/server-instance.dto';

export interface ElectronAppPathProvider {
  getPath(name: 'exe'): string;
  isPackaged?: boolean;
}

export const ELECTRON_APP_PATH_PROVIDER = 'ELECTRON_APP_PATH_PROVIDER';

@Injectable()
export class PortablePathService {
  private readonly developmentRoot = process.cwd();
  private selectedInstance: ManagedServerInstance | null = null;

  constructor(
    @Optional()
    @Inject(ELECTRON_APP_PATH_PROVIDER)
    private readonly appPathProvider?: ElectronAppPathProvider
  ) {}

  isMultiServerMode(): boolean {
    return process.env['PALCM_MULTI_SERVER'] === 'true';
  }

  getPortableRoot(): string {
    if (this.isMultiServerMode()) {
      return this.getSelectedInstance()?.rootPath ?? join(this.getApplicationDataRoot(), 'unassigned-server');
    }

    return this.getDefaultPortableRoot();
  }

  getServerInstances(): ServerInstancesStatusDto {
    if (!this.isMultiServerMode()) {
      const rootPath = this.getDefaultPortableRoot();
      return {
        mode: 'PORTABLE',
        instances: [{
          id: 'portable',
          rootPath,
          name: 'Servidor portable',
          isSelected: true,
          isRunning: false,
          addedAt: new Date(0).toISOString()
        }]
      };
    }

    const registry = this.readRegistry();
    const instances = registry.instances
      .filter((instance) => existsSync(instance.rootPath))
      .map((instance) => refreshManagedServerInstance(instance));
    if (JSON.stringify(instances) !== JSON.stringify(registry.instances)) {
      registry.instances = instances;
      if (registry.selectedInstanceId && !instances.some((instance) => instance.id === registry.selectedInstanceId)) {
        registry.selectedInstanceId = undefined;
      }
      this.writeRegistry(registry);
      this.selectedInstance = null;
    }

    return {
      mode: 'MULTI_SERVER',
      selectedInstanceId: registry.selectedInstanceId,
      instances: instances.map((instance) => ({
        id: instance.id,
        rootPath: instance.rootPath,
        name: instance.name,
        isSelected: instance.id === registry.selectedInstanceId,
        isRunning: false,
        addedAt: instance.addedAt
      }))
    };
  }

  addServerFolder(
    folderPath: string,
    options: { displayName?: string; initialServerName?: string } = {}
  ): ServerInstancesStatusDto {
    if (!this.isMultiServerMode()) {
      throw new Error('SERVER_INSTANCES_ONLY_AVAILABLE_IN_INSTALLABLE');
    }

    const rootPath = normalize(resolve(folderPath));
    if (!existsSync(rootPath)) {
      throw new Error('SERVER_INSTANCE_FOLDER_NOT_FOUND');
    }

    const registry = this.readRegistry();
    const existing = registry.instances.find((instance) => normalize(instance.rootPath).toLowerCase() === rootPath.toLowerCase());
    const serverRoot = resolveExistingServerRoot(rootPath);
    const next = existing ?? {
      id: createInstanceId(rootPath),
      rootPath,
      name: readServerName(serverRoot) ?? options.displayName ?? createFolderDisplayName(rootPath),
      serverRoot,
      initialServerName: options.initialServerName,
      addedAt: new Date().toISOString()
    };

    next.serverRoot = serverRoot;
    next.name = readServerName(serverRoot) ?? options.displayName ?? next.name;
    next.initialServerName ??= options.initialServerName;
    if (!existing) {
      registry.instances.push(next);
    }
    registry.selectedInstanceId = next.id;
    this.writeRegistry(registry);
    this.selectedInstance = next;
    return this.getServerInstances();
  }

  createServerFolder(name: string): ServerInstancesStatusDto {
    if (!this.isMultiServerMode()) {
      throw new Error('SERVER_INSTANCES_ONLY_AVAILABLE_IN_INSTALLABLE');
    }

    const folderName = sanitizeServerFolderName(name);
    const rootPath = createUniqueServerFolder(join(this.getServerBaseFolder(), folderName));
    mkdirSync(rootPath, { recursive: true });
    return this.addServerFolder(rootPath, {
      displayName: name.trim(),
      initialServerName: name.trim()
    });
  }

  selectServerInstance(instanceId: string): ServerInstancesStatusDto {
    if (!this.isMultiServerMode()) {
      return this.getServerInstances();
    }

    const registry = this.readRegistry();
    const instance = registry.instances.find((entry) => entry.id === instanceId && existsSync(entry.rootPath));
    if (!instance) {
      throw new Error('SERVER_INSTANCE_NOT_FOUND');
    }

    instance.serverRoot = resolveExistingServerRoot(instance.rootPath);
    instance.name = readServerName(instance.serverRoot) ?? instance.name;
    registry.selectedInstanceId = instance.id;
    this.writeRegistry(registry);
    this.selectedInstance = instance;
    return this.getServerInstances();
  }

  hasSelectedServerInstance(): boolean {
    return !this.isMultiServerMode() || this.getSelectedInstance() !== null;
  }

  getSelectedServerInstanceName(): string | undefined {
    return this.getSelectedInstance()?.name;
  }

  getSelectedInitialServerName(): string | undefined {
    return this.getSelectedInstance()?.initialServerName;
  }

  getServerBaseFolder(): string {
    return this.readRegistry().baseFolder ?? this.getDefaultManagedServersRoot();
  }

  setServerBaseFolder(folderPath: string): string {
    if (!this.isMultiServerMode()) {
      throw new Error('SERVER_INSTANCES_ONLY_AVAILABLE_IN_INSTALLABLE');
    }

    const baseFolder = normalize(resolve(folderPath));
    if (!existsSync(baseFolder)) {
      throw new Error('SERVER_INSTANCE_FOLDER_NOT_FOUND');
    }

    const registry = this.readRegistry();
    registry.baseFolder = baseFolder;
    this.writeRegistry(registry);
    return baseFolder;
  }

  getServerInstanceExecutablePath(instanceId: string): string {
    const instance = this.readRegistry().instances.find((entry) => entry.id === instanceId);
    const serverRoot = instance?.serverRoot
      ?? (instance ? resolveExistingServerRoot(instance.rootPath) ?? join(instance.rootPath, 'server', 'palworld') : undefined)
      ?? this.getPalworldServerRoot();
    return join(serverRoot, 'PalServer.exe');
  }

  private getDefaultPortableRoot(): string {
    const portableExecutableDirectory = process.env['PORTABLE_EXECUTABLE_DIR'];
    if (portableExecutableDirectory) {
      return portableExecutableDirectory;
    }

    const electronExecutablePath = process.env['PALCM_ELECTRON_EXE_PATH'];
    if (process.env['PALCM_ELECTRON_IS_PACKAGED'] === 'true' && electronExecutablePath) {
      return dirname(electronExecutablePath);
    }

    if (this.appPathProvider?.isPackaged === true) {
      return dirname(this.appPathProvider.getPath('exe'));
    }

    if (process.env['PALCM_RUNTIME_ENV'] === 'development') {
      return join(this.developmentRoot, 'ejecucionPruebas');
    }

    return this.developmentRoot;
  }

  getToolsRoot(): string {
    return join(this.getPortableRoot(), 'tools');
  }

  getSteamCmdRoot(): string {
    return join(this.getToolsRoot(), 'steamcmd');
  }

  getPalworldServerRoot(): string {
    const selectedInstance = this.getSelectedInstance();
    if (selectedInstance?.serverRoot) {
      return selectedInstance.serverRoot;
    }
    return join(this.getPortableRoot(), 'server', 'palworld');
  }

  getConfigRoot(): string {
    return join(this.getPortableRoot(), 'config');
  }

  getApplicationConfigRoot(): string {
    return this.isMultiServerMode()
      ? join(this.getApplicationDataRoot(), 'config')
      : this.getConfigRoot();
  }

  getLogsRoot(): string {
    return join(this.getPortableRoot(), 'logs');
  }

  ensurePortableLayout(): void {
    if (!this.hasSelectedServerInstance()) {
      return;
    }
    [
      this.getPortableRoot(),
      this.getToolsRoot(),
      this.getSteamCmdRoot(),
      this.getPalworldServerRoot(),
      this.getConfigRoot(),
      join(this.getPortableRoot(), 'backups', 'configuration'),
      join(this.getPortableRoot(), 'backups', 'world'),
      join(this.getPortableRoot(), 'backups', 'maintenance'),
      this.getLogsRoot()
    ].forEach((directory) => {
      mkdirSync(directory, { recursive: true });
    });
  }

  private getSelectedInstance(): ManagedServerInstance | null {
    if (!this.isMultiServerMode()) {
      return null;
    }

    if (this.selectedInstance && existsSync(this.selectedInstance.rootPath)) {
      return this.selectedInstance;
    }

    const registry = this.readRegistry();
    const selected = registry.instances.find((instance) => instance.id === registry.selectedInstanceId && existsSync(instance.rootPath)) ?? null;
    this.selectedInstance = selected;
    return selected;
  }

  private getApplicationDataRoot(): string {
    return process.env['PALCM_APP_DATA_PATH'] ?? join(this.getDefaultPortableRoot(), 'app-data');
  }

  private getDefaultManagedServersRoot(): string {
    const documentsPath = process.env['PALCM_DOCUMENTS_PATH'];
    return join(documentsPath ?? this.getApplicationDataRoot(), 'PSM Console Servers');
  }

  private getRegistryPath(): string {
    return join(this.getApplicationDataRoot(), 'server-instances.json');
  }

  private readRegistry(): ServerInstanceRegistry {
    const path = this.getRegistryPath();
    if (!existsSync(path)) {
      return { version: 1, instances: [] };
    }

    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<ServerInstanceRegistry>;
      return {
        version: 1,
        baseFolder: typeof parsed.baseFolder === 'string' ? parsed.baseFolder : undefined,
        selectedInstanceId: typeof parsed.selectedInstanceId === 'string' ? parsed.selectedInstanceId : undefined,
        instances: Array.isArray(parsed.instances)
          ? parsed.instances.filter(isManagedServerInstance)
          : []
      };
    } catch {
      return { version: 1, instances: [] };
    }
  }

  private writeRegistry(registry: ServerInstanceRegistry): void {
    const path = this.getRegistryPath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
  }
}

interface ManagedServerInstance {
  id: string;
  rootPath: string;
  name: string;
  serverRoot?: string;
  initialServerName?: string;
  addedAt: string;
}

interface ServerInstanceRegistry {
  version: 1;
  selectedInstanceId?: string;
  baseFolder?: string;
  instances: ManagedServerInstance[];
}

function isManagedServerInstance(value: unknown): value is ManagedServerInstance {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<ManagedServerInstance>;
  return typeof candidate.id === 'string'
    && typeof candidate.rootPath === 'string'
    && typeof candidate.name === 'string'
    && typeof candidate.addedAt === 'string';
}

function resolveExistingServerRoot(rootPath: string): string | undefined {
  const candidates = [
    rootPath,
    join(rootPath, 'server', 'palworld')
  ];
  return candidates.find((candidate) => existsSync(join(candidate, 'PalServer.exe')) || existsSync(join(candidate, 'Pal', 'Saved', 'Config', 'WindowsServer', 'PalWorldSettings.ini')));
}

function readServerName(serverRoot: string | undefined): string | undefined {
  if (!serverRoot) {
    return undefined;
  }
  const configurationPath = join(serverRoot, 'Pal', 'Saved', 'Config', 'WindowsServer', 'PalWorldSettings.ini');
  if (!existsSync(configurationPath)) {
    return undefined;
  }
  try {
    const content = readFileSync(configurationPath, 'utf8');
    const quoted = content.match(/ServerName\s*=\s*"([^"]*)"/i)?.[1];
    const unquoted = content.match(/ServerName\s*=\s*([^,\)\r\n]+)/i)?.[1];
    return (quoted ?? unquoted)?.trim() || undefined;
  } catch {
    return undefined;
  }
}

function createFolderDisplayName(rootPath: string): string {
  return rootPath.split(/[\\/]/).filter(Boolean).at(-1) || 'Nuevo servidor';
}

function createInstanceId(rootPath: string): string {
  const normalized = rootPath.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${normalized || 'server'}-${Date.now().toString(36)}`;
}

function sanitizeServerFolderName(name: string): string {
  const normalized = name.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').replace(/[. ]+$/g, '');
  if (!normalized || normalized === '.' || normalized === '..') {
    return 'Nuevo servidor';
  }
  return normalized.slice(0, 80);
}

function createUniqueServerFolder(basePath: string): string {
  if (!existsSync(basePath)) {
    return basePath;
  }
  for (let index = 2; index < 10_000; index += 1) {
    const candidate = `${basePath} (${String(index)})`;
    if (!existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error('SERVER_INSTANCE_FOLDER_CREATION_FAILED');
}

function refreshManagedServerInstance(instance: ManagedServerInstance): ManagedServerInstance {
  const serverRoot = resolveExistingServerRoot(instance.rootPath);
  const name = readServerName(serverRoot) ?? instance.name;

  return {
    ...instance,
    serverRoot,
    name
  };
}
