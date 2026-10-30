import { afterAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';

// 线上存放目录是 .runtime/data-exports；临时目录里同样放一个点开头的路径段。
const paths = vi.hoisted(() => {
  const nodeFs = require('node:fs');
  const nodeOs = require('node:os');
  const nodePath = require('node:path');
  const base = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'ln-export-route-'));
  return { base, task: nodePath.join(base, '.runtime', 'data-exports', 'task') };
});
vi.mock('../util/auth.js', () => ({ ensureNotVisitor: () => true }));
vi.mock('../util/common.js', () => ({ resultData: (data) => ({ data }), L: (req, zh) => zh }));
vi.mock('../util/dataExport/storage.js', () => ({
  taskDirectory: () => paths.task,
  exportError: (code, status) => Object.assign(new Error(code), { code, status }),
}));
vi.mock('../util/dataExport/service.js', () => ({
  ownedTask: vi.fn(async () => ({ id: 'task', create_time: '2026-10-30T08:15:38Z' })),
  presentTask: () => ({ canDownload: true }),
  presentTaskWithArchive: vi.fn(),
  createTask: vi.fn(),
  latestTask: vi.fn(),
  cancelTask: vi.fn(),
  failurePage: vi.fn(),
  exportSummary: vi.fn(),
}));
const { default: router } = await import('./dataExports.js');

afterAll(() => fs.rmSync(paths.base, { recursive: true, force: true }));

describe('data export download', () => {
  it('serves the archive from a dot-prefixed storage directory with a Chinese file name', async () => {
    fs.mkdirSync(paths.task, { recursive: true });
    fs.writeFileSync(path.join(paths.task, 'export.zip'), 'zip-bytes');
    const app = express();
    app.use((req, _res, next) => {
      req.user = { id: 'u' };
      next();
    });
    app.use('/', router);
    const server = app.listen(0);
    try {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/download/task`);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-disposition')).toContain(
        `filename*=UTF-8''${encodeURIComponent('轻笺导出_2026-10-30.zip')}`,
      );
      expect(await response.text()).toBe('zip-bytes');
    } finally {
      server.close();
    }
  });
});
