import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findLocalDocumentWorkers } from './localWorkerGuard.mjs';

test('只识别相同仓库的 Node 文档 Worker，忽略其他仓库、命令文本与退出进程', () => {
  const run = (file, args) => {
    if (file === 'ps') return '11 node node documentWorker.js\n12 /bin/node node --watch documentWorker.js\n13 zsh zsh -c node documentWorker.js\n14 node node app.js\n15 node node documentWorker.js';
    if (args[2] === '15') throw new Error('exited');
    return `p${args[2]}\nfcwd\nn${args[2] === '11' ? '/repo/apps/server' : '/other/apps/server'}`;
  };
  assert.deepEqual(findLocalDocumentWorkers('/repo/apps/server', run), [11]);
});
