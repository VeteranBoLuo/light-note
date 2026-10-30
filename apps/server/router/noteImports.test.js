import { afterAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';

// 线上存放目录是 .runtime/note-imports；临时目录里同样放一个点开头的路径段。
const paths = vi.hoisted(() => {
  const nodeFs = require('node:fs');
  const nodeOs = require('node:os');
  const nodePath = require('node:path');
  const base = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'ln-import-route-'));
  return { base, task: nodePath.join(base, '.runtime', 'note-imports', 'task') };
});
vi.mock('../db/index.js', () => ({ default: {} }));
vi.mock('../util/auth.js', () => ({ ensureNotVisitor: () => true }));
vi.mock('../util/common.js', () => ({ resultData: (data) => ({ data }), L: (req, zh) => zh }));
vi.mock('../util/noteImport/upload.js', () => ({ receiveImportUpload: vi.fn() }));
vi.mock('../util/noteImport/storage.js', () => ({
  taskDirectory: () => paths.task,
  importError: (code, status) => Object.assign(new Error(code), { code, status }),
  readJson: vi.fn(),
  writeJson: vi.fn(),
}));
vi.mock('../util/noteImport/service.js', () => ({
  ownedTask: vi.fn(async () => ({ id: 'task', status: 'review' })),
  createImportTask: vi.fn(),
  clearImportHistory: vi.fn(),
  dismissImport: vi.fn(),
  getImportTask: vi.fn(),
  startImport: vi.fn(),
  transaction: vi.fn(),
}));
const { default: router } = await import('./noteImports.js');

afterAll(() => fs.rmSync(paths.base, { recursive: true, force: true }));

describe('note import image preview', () => {
  it('serves extracted images from a dot-prefixed storage directory', async () => {
    const key = `${'a'.repeat(64)}.png`;
    fs.mkdirSync(path.join(paths.task, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(paths.task, 'assets', key), 'png-bytes');
    const app = express();
    app.use((req, _res, next) => {
      req.user = { id: 'u' };
      next();
    });
    app.use('/', router);
    const server = app.listen(0);
    try {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/image?id=task&key=${key}`);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('png-bytes');
    } finally {
      server.close();
    }
  });
});
