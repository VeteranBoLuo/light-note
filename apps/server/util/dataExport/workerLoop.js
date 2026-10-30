const SCHEMA_ERRORS = ['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'];

const errorCode = (e) => String(e?.code || e?.name || 'UNKNOWN').slice(0, 64);

/**
 * 导出 Worker 主循环。单次轮询失败（数据库连接中断、锁等待等）只记稳定错误码并退避重试，
 * 不能让循环悄悄结束：进程里还有 Redis 等长连接，循环停了进程也不会退出，pm2 会一直显示在线，任务却无人处理。
 */
export async function runExportWorker({
  assertSchema,
  cleanup,
  processTask,
  isStopping,
  sleep,
  runtime,
  log = console,
  now = Date.now,
}) {
  let lastCleanup = 0,
    warned = false,
    failures = 0;
  while (!isStopping()) {
    try {
      await assertSchema();
      if (now() - lastCleanup > 60000) {
        await cleanup();
        lastCleanup = now();
      }
      const worked = await processTask();
      failures = 0;
      if (worked) continue;
    } catch (e) {
      if (runtime === 'local' && SCHEMA_ERRORS.includes(e?.code)) {
        if (!warned) log.warn('[data-export-worker] DATA_EXPORT_SCHEMA_NOT_READY');
        warned = true;
        await sleep(30000);
        continue;
      }
      failures++;
      log.error('[data-export-worker] DATA_EXPORT_WORKER_RETRY code=%s attempt=%d', errorCode(e), failures);
      await sleep(Math.min(30000, 1500 * 2 ** Math.min(failures, 5)));
      continue;
    }
    await sleep(1500);
  }
}
