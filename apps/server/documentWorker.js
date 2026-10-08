import { cleanupLegacyCloudObject } from './util/services/cloudLegacyObjectLifecycle.js';
import { cleanupRenameStage } from './util/services/cloudFileRenameStaging.js';
import {
  runOrganizeInspection,
  runOrganizeDirect,
  reclassifyCachedIcons,
} from './util/services/organizeProcessingPipeline.js';
import { runRuleBatch } from './util/services/organizeSuggestionLifecycle.js';
import { inspectImagePreviewRuntime } from './util/imagePreview/runtime.js';
import { runSingleImagePreviewJob, runSingleVideoPreviewJob, cleanupImageAssets } from './util/imagePreview/worker.js';
import { inspectVideoPreviewRuntime } from './util/imagePreview/videoCover.js';
import { runOrganizeCompletionNotifications } from './util/services/organizeCompletionNotification.js';
import os from 'node:os';
import pool from './db/index.js';
import redisClient from './util/redisClient.js';
import { runSingleSuggestionItem } from './util/services/organizeSuggestionService.js';
import { ensureAiDocumentSchema } from './util/aiDocumentSchema.js';
import { cleanupExpiredDocumentSources, runSingleDocumentJob } from './util/aiDocument/service.js';
import { ensureFilePreviewSchema } from './util/filePreviewSchema.js';
import { ensureCommunityChatSchema } from './util/communityChatSchema.js';
import { cleanupStaleFilePreviewArtifacts, runSingleFilePreviewJob } from './util/filePreview/service.js';
import { inspectAllFilePreviewRuntimes } from './util/filePreview/runtime.js';
import { inspectLocalOcrRuntime } from './util/aiDocument/localOcr.js';
import { stableAgentErrorCode } from './util/agent/logSafety.js';
import { ensureToolboxSchema } from './util/toolboxSchema.js';
import { cleanupExpiredToolboxData, runSingleToolboxJob } from './util/toolbox/worker.js';
import { runSingleOrganizeAiSuggestionBatch } from './util/services/organizeAiSuggestionService.js';
import { ensureOrganizeSchema } from './util/organizeSchema.js';
import { createWorkerResourceGate } from './util/workerResourceGate.js';

const workerId = `${os.hostname()}:${process.pid}`;
let stopping = false;
let lastCleanupAt = 0;
const pipelineLoops = [];
// Preserve the previous ceiling of two media jobs (main loop + video), while
// allowing thumbnails to proceed independently of a long document or AI call.
const runMedia = createWorkerResourceGate(2);

const wakeups = new Set();
const wait = (ms) =>
  new Promise((resolve) => {
    const wake = () => {
      clearTimeout(timer);
      wakeups.delete(wake);
      resolve();
    };
    const timer = setTimeout(wake, ms);
    wakeups.add(wake);
  });

async function pipelineLoop(work) {
  while (!stopping) {
    try {
      const handled = await work();
      if (!handled && !stopping) await wait(1200);
    } catch (error) {
      console.error('[organize-pipeline] code=%s', stableAgentErrorCode(error));
      if (!stopping) await wait(3000);
    }
  }
}

function rotatingQueue(queues) {
  let next = 0;
  return async () => {
    for (let offset = 0; offset < queues.length && !stopping; offset += 1) {
      const index = next;
      next = (next + 1) % queues.length;
      if (await queues[index](workerId)) return true;
    }
    return false;
  };
}

async function run() {
  await ensureAiDocumentSchema();
  await ensureCommunityChatSchema();
  await ensureFilePreviewSchema();
  await ensureToolboxSchema();
  await ensureOrganizeSchema();
  const ocrRuntime = await inspectLocalOcrRuntime();
  if (ocrRuntime.ready) {
    console.log(`[AI 文档] 本地 OCR 已就绪: ${ocrRuntime.languages.join('+')}`);
  } else {
    const detail = ocrRuntime.missingLanguages?.length
      ? `缺少语言模型 ${ocrRuntime.missingLanguages.join(', ')}`
      : ocrRuntime.errorCode || '运行环境不可用';
    console.warn(`[AI 文档] 本地 OCR 暂不可用: ${detail}`);
  }
  const imageRuntime = await inspectImagePreviewRuntime();
  if (!imageRuntime.ready) console.warn('[image-preview] runtime unavailable');
  const videoRuntime = await inspectVideoPreviewRuntime();
  if (!videoRuntime.ready) console.warn('[video-preview] runtime unavailable');
  const previewRuntime = await inspectAllFilePreviewRuntimes();
  for (const [name, state] of Object.entries({ archive: previewRuntime.archive, office: previewRuntime.office })) {
    if (state.errorCode === 'FILE_PREVIEW_DISABLED') console.log('[文件预览] %s 预览已通过配置关闭', name);
    else if (!state.ready) console.warn('[文件预览] %s 运行时暂不可用 code=%s', name, state.errorCode);
  }
  console.log(`[AI 文档/文件预览/知识工具箱/整理建议] 解析 Worker 已启动: ${workerId}`);
  pipelineLoops.push(
    ...(videoRuntime.ready
      ? [
          pipelineLoop(() =>
            runMedia(
              () => runSingleVideoPreviewJob(workerId),
              () => stopping,
            ),
          ),
        ]
      : []),
    pipelineLoop(async () => (await runOrganizeInspection(workerId)) || runRuleBatch(pool)),
    ...Array.from({ length: 2 }, () =>
      pipelineLoop(async () => {
        await reclassifyCachedIcons(workerId);
        return runOrganizeDirect(workerId);
      }),
    ),
    pipelineLoop(() => runSingleSuggestionItem(workerId, pool, { skipRules: true, pipeline: 'v3' })),
    pipelineLoop(() => runMedia(rotatingDocumentQueue, () => stopping)),
    pipelineLoop(() =>
      runMedia(
        () => runSingleImagePreviewJob(workerId),
        () => stopping,
      ),
    ),
    pipelineLoop(
      rotatingQueue([
        (worker) => runSingleToolboxJob(worker, pool, { runLocalProcessing: runMedia }),
        runSingleOrganizeAiSuggestionBatch,
        (worker) => runSingleSuggestionItem(worker, pool, { skipRules: true, pipeline: 'legacy' }),
      ]),
    ),
    pipelineLoop(() => runOrganizeCompletionNotifications(workerId)),
    pipelineLoop(rotatingQueue([() => cleanupRenameStage(), () => cleanupLegacyCloudObject()])),
  );
  while (!stopping) {
    try {
      const now = Date.now();
      if (now - lastCleanupAt > 60 * 60 * 1000) {
        await cleanupExpiredDocumentSources();
        await cleanupStaleFilePreviewArtifacts();
        await cleanupImageAssets();
        await cleanupExpiredToolboxData();
        lastCleanupAt = now;
      }
      if (!stopping) await wait(60 * 60 * 1000);
    } catch (error) {
      console.error('[AI 文档] Worker 循环异常 code=%s', stableAgentErrorCode(error));
      await wait(3000);
    }
  }
  console.log('[AI 文档/文件预览/知识工具箱/整理建议] 解析 Worker 已停止');
}

const rotatingDocumentQueue = rotatingQueue([runSingleDocumentJob, runSingleFilePreviewJob]);

function stop() {
  stopping = true;
  for (const wake of wakeups) wake();
}

process.on('SIGTERM', stop);
process.on('SIGINT', stop);

run()
  .catch((error) => {
    console.error('[AI 文档] Worker 启动失败 code=%s', stableAgentErrorCode(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    stopping = true;
    await Promise.allSettled(pipelineLoops);
    try {
      await pool.end();
    } catch (error) {
      console.error('[AI 文档] Worker 关闭连接失败 code=%s', stableAgentErrorCode(error));
      process.exitCode = 1;
    } finally {
      // 队列循环及在途任务均已结束，同时释放间接导入的 Redis 长连接。
      if (redisClient.isOpen) redisClient.destroy();
    }
  });
