import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  parseUdpPortOwner,
  resolvePalworldRuntimeExecutable
} from '../src/backend/palworld-process/palworld-process.service';

describe('PalworldProcessService runtime executable', () => {
  const portableRoot = join(process.cwd(), '.tmp-tests', 'palworld-process');
  const serverRoot = join(portableRoot, 'server', 'palworld');
  const palServerPath = join(serverRoot, 'PalServer.exe');
  const commandServerPath = join(
    serverRoot,
    'Pal',
    'Binaries',
    'Win64',
    'PalServer-Win64-Shipping-Cmd.exe'
  );

  afterEach(async () => {
    await rm(portableRoot, { recursive: true, force: true });
  });

  it('prefers the command runtime executable so stdout can be captured in-app', async () => {
    await mkdir(join(serverRoot, 'Pal', 'Binaries', 'Win64'), { recursive: true });
    await writeFile(palServerPath, '');
    await writeFile(commandServerPath, '');

    expect(resolvePalworldRuntimeExecutable(palServerPath)).toEqual({
      executablePath: commandServerPath,
      workingDirectory: serverRoot,
      displayName: 'PalServer-Win64-Shipping-Cmd.exe'
    });
  });

  it('falls back to PalServer.exe when the command runtime is not available', async () => {
    await mkdir(serverRoot, { recursive: true });
    await writeFile(palServerPath, '');

    expect(resolvePalworldRuntimeExecutable(palServerPath)).toEqual({
      executablePath: palServerPath,
      workingDirectory: serverRoot,
      displayName: 'PalServer.exe'
    });
  });
});

describe('PalworldProcessService query port owner parser', () => {
  it('reads the process that owns the Steam Query UDP port', () => {
    const owner = parseUdpPortOwner(
      '{"OwningProcess":1234,"ProcessName":"PalServer-Win64-Shipping-Cmd","Path":"D:\\\\PalCM\\\\PalServer-Win64-Shipping-Cmd.exe"}'
    );

    expect(owner).toEqual({
      pid: 1234,
      processName: 'PalServer-Win64-Shipping-Cmd',
      executablePath: 'D:\\PalCM\\PalServer-Win64-Shipping-Cmd.exe'
    });
  });

  it('returns an empty owner when Windows reports no UDP endpoint', () => {
    expect(parseUdpPortOwner('')).toEqual({});
  });
});
