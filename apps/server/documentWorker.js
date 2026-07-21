import os from 'node:os';
import { ensureAiDocumentSchema } from './util/aiDocumentSchema.js';
import { cleanupExpiredDocumentSources, runSingleDocumentJob } from './util/aiDocument/service.js';
import { inspectLocalOcrRuntime } from './util/aiDocument/localOcr.js';
import { stableAgentErrorCode } from './util/agent/logSafety.js';

const workerId = `${os.hostname()}:${process.pid}`;
let stopping = false;
let lastCleanupAt = 0;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  await ensureAiDocumentSchema();
  const ocrRuntime = await inspectLocalOcrRuntime();
  if (ocrRuntime.ready) {
    console.log(`[AI 文档] 本地 OCR 已就绪: ${ocrRuntime.languages.join('+')}`);
  } else {
    const detail = ocrRuntime.missingLanguages?.length
      ? `缺少语言模型 ${ocrRuntime.missingLanguages.join(', ')}`
      : ocrRuntime.errorCode || '运行环境不可用';
    console.warn(`[AI 文档] 本地 OCR 暂不可用: ${detail}`);
  }
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
      console.error('[AI 文档] Worker 循环异常 code=%s', stableAgentErrorCode(error));
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
  console.error('[AI 文档] Worker 启动失败 code=%s', stableAgentErrorCode(error));
  process.exitCode = 1;
});
