import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getHostAgentDashboard } from './hostAgentClient.js';

const cleanups = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe('hostAgentClient', () => {
  it('只接受协议版本一致的本机 Unix Socket 响应', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lightnote-host-client-'));
    const socketPath = path.join(directory, 'agent.sock');
    const server = http.createServer((_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ protocolVersion: 1, ok: true, data: { sampledAt: '2026-08-20T00:00:00.000Z' } }));
    });
    await new Promise((resolve) => server.listen(socketPath, resolve));
    cleanups.push(async () => {
      await new Promise((resolve) => server.close(resolve));
      await fs.rm(directory, { recursive: true, force: true });
    });

    await expect(getHostAgentDashboard({ environment: { HOST_AGENT_SOCKET_PATH: socketPath } })).resolves.toEqual({
      sampledAt: '2026-08-20T00:00:00.000Z',
    });
  });
});
