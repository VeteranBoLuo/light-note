import os from 'node:os';
import { ensureAiDocumentSchema } from './util/aiDocumentSchema.js';
import { cleanupExpiredDocumentSources, runSingleDocumentJob } from './util/aiDocument/service.js';

const workerId = `${os.hostname()}:${process.pid}`;
let stopping = false;
let lastCleanupAt = 0;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  await ensureAiDocumentSchema();
  console.log(`[AI 文档] 解析 Worker 已启动: ${workerId}`);
  while (!stopping) {
    try {
      const now = Date.now();
      if (now - lastCleanupAt > 60 * 60 * 1000) {
        await cleanupExpiredDocumentSources();
        lastCleanupAt = now;
      }
      const handled = await runSingleDocumentJob(workerId);
      if (!handled) await wait(1200);
    } catch (error) {
      console.error('[AI 文档] Worker 循环异常:', error.message);
      await wait(3000);
    }
  }
  console.log('[AI 文档] 解析 Worker 已停止');
}

function stop() {
  stopping = true;
}

process.on('SIGTERM', stop);
process.on('SIGINT', stop);

run().catch((error) => {
  console.error('[AI 文档] Worker 启动失败:', error);
  process.exitCode = 1;
});
