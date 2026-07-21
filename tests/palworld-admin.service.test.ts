import { createServer, type IncomingMessage } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { PalworldAdminService } from '../src/backend/palworld-admin/palworld-admin.service';
import type { PalworldConfigurationService } from '../src/backend/palworld-configuration/palworld-configuration.service';
import type { PalworldProcessService } from '../src/backend/palworld-process/palworld-process.service';

let closeServer: (() => Promise<void>) | null = null;

describe('PalworldAdminService', () => {
  afterEach(async () => {
    await closeServer?.();
    closeServer = null;
  });

  it('reports missing admin password before enabling actions', async () => {
    const service = createService('RUNNING', 'OptionSettings=(RESTAPIEnabled=True,RESTAPIPort=8212,AdminPassword="")');

    await expect(service.getStatus()).resolves.toMatchObject({
      status: 'ADMIN_PASSWORD_MISSING'
    });
  });

  it('requires explicit confirmation before executing admin actions', async () => {
    const service = createService('RUNNING', 'OptionSettings=(RESTAPIEnabled=True,RESTAPIPort=8212,AdminPassword="secret")');

    await expect(service.execute({ confirmed: false, action: 'save' })).rejects.toThrow('PALWORLD_ADMIN_REQUIRES_CONFIRMATION');
  });

  it('reads server info settings and metrics from the local REST API', async () => {
    const port = await startMockServer(() => undefined);
    const service = createService(
      'RUNNING',
      `OptionSettings=(RESTAPIEnabled=True,RESTAPIPort=${String(port)},AdminPassword="secret")`
    );

    await expect(service.getStatus()).resolves.toMatchObject({
      status: 'READY',
      info: {
        servername: 'PSM Test',
        version: 'v1'
      },
      settings: {
        ServerPlayerMaxNum: 32
      },
      metrics: {
        serverfps: 60
      }
    });
  });

  it('sends an announce action to the local REST API', async () => {
    const calls: Array<{
      method: string | undefined;
      path: string | undefined;
      authorization: string | undefined;
      body: string;
    }> = [];
    const port = await startMockServer(async (request) => {
      calls.push({
        method: request.method,
        path: request.url,
        authorization: request.headers.authorization,
        body: await readRequestBody(request)
      });
    });
    const service = createService(
      'RUNNING',
      `OptionSettings=(RESTAPIEnabled=True,RESTAPIPort=${String(port)},AdminPassword="secret")`
    );

    await expect(service.execute({
      confirmed: true,
      action: 'announce',
      message: 'Servidor reinicia en 5 minutos'
    })).resolves.toMatchObject({
      action: 'announce',
      status: 'OK'
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: 'POST',
      path: '/v1/api/announce',
      authorization: `Basic ${Buffer.from('admin:secret').toString('base64')}`,
      body: '{"message":"Servidor reinicia en 5 minutos"}'
    });
  });

  it('sends force stop to the local REST API', async () => {
    const calls: Array<{ path: string | undefined }> = [];
    const port = await startMockServer((request) => {
      calls.push({ path: request.url });
    });
    const service = createService(
      'RUNNING',
      `OptionSettings=(RESTAPIEnabled=True,RESTAPIPort=${String(port)},AdminPassword="secret")`
    );

    await expect(service.execute({ confirmed: true, action: 'stop' })).resolves.toMatchObject({
      action: 'stop',
      status: 'OK'
    });
    expect(calls).toContainEqual({ path: '/v1/api/stop' });
  });
});

async function startMockServer(onRequest: (request: IncomingMessage) => void | Promise<void>): Promise<number> {
  const server = createServer((request, response) => {
    void Promise.resolve(onRequest(request)).then(() => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(createMockResponse(request.url)));
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  closeServer = () => new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('TEST_SERVER_PORT_UNAVAILABLE');
  }

  return address.port;
}

function createMockResponse(path: string | undefined): Record<string, unknown> {
  if (path === '/v1/api/info') {
    return {
      servername: 'PSM Test',
      version: 'v1',
      nested: {
        ignored: true
      }
    };
  }

  if (path === '/v1/api/settings') {
    return {
      ServerPlayerMaxNum: 32
    };
  }

  if (path === '/v1/api/metrics') {
    return {
      serverfps: 60
    };
  }

  return {};
}

function readRequestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    request.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
  });
}

function createService(runtimeState: 'STOPPED' | 'RUNNING', content: string): PalworldAdminService {
  return new PalworldAdminService(
    {
      readActive: () => Promise.resolve({
        path: 'C:\\portable\\PalWorldSettings.ini',
        content,
        updatedAt: new Date().toISOString()
      })
    } as PalworldConfigurationService,
    {
      getRuntimeStatus: () => ({
        state: runtimeState,
        executablePath: 'C:\\portable\\server\\palworld\\PalServer.exe',
        updatedAt: new Date().toISOString(),
        message: runtimeState,
        logs: []
      })
    } as unknown as PalworldProcessService
  );
}
