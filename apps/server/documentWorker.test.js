vi.mock('./util/services/organizeProcessingPipeline.js', () => ({
  runOrganizeInspection: async () => false,
  runOrganizeDirect: async () => false,
  reclassifyCachedIcons: async () => false,
}));
vi.mock('./util/services/organizeSuggestionLifecycle.js', () => ({ runRuleBatch: async () => false }));
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  end: vi.fn(),
  item: vi.fn(),
  ensure: vi.fn(),
  destroy: vi.fn(),
  document: vi.fn(async () => false),
}));
vi.mock('./util/redisClient.js', () => ({ default: { isOpen: true, destroy: mocks.destroy } }));
vi.mock('./db/index.js', () => ({ default: { end: mocks.end } }));
vi.mock('./util/aiDocumentSchema.js', () => ({ ensureAiDocumentSchema: mocks.ensure }));
vi.mock('./util/communityChatSchema.js', () => ({ ensureCommunityChatSchema: async () => {} }));
vi.mock('./util/filePreviewSchema.js', () => ({ ensureFilePreviewSchema: async () => {} }));
vi.mock('./util/toolboxSchema.js', () => ({ ensureToolboxSchema: async () => {} }));
vi.mock('./util/organizeSchema.js', () => ({ ensureOrganizeSchema: async () => {} }));
vi.mock('./util/aiDocument/localOcr.js', () => ({
  inspectLocalOcrRuntime: async () => ({ ready: true, languages: [] }),
}));
vi.mock('./util/filePreview/runtime.js', () => ({
  inspectAllFilePreviewRuntimes: async () => ({ archive: { ready: true }, office: { ready: true } }),
}));
vi.mock('./util/aiDocument/service.js', () => ({
  cleanupExpiredDocumentSources: async () => {},
  runSingleDocumentJob: mocks.document,
}));
vi.mock('./util/filePreview/service.js', () => ({
  cleanupStaleFilePreviewArtifacts: async () => {},
  runSingleFilePreviewJob: async () => false,
}));
vi.mock('./util/toolbox/worker.js', () => ({
  cleanupExpiredToolboxData: async () => {},
  runSingleToolboxJob: async () => false,
}));
vi.mock('./util/services/organizeAiSuggestionService.js', () => ({
  runSingleOrganizeAiSuggestionBatch: async () => false,
}));
vi.mock('./util/services/organizeSuggestionService.js', () => ({ runSingleSuggestionItem: mocks.item }));
vi.mock('./util/services/organizeCompletionNotification.js', () => ({
  runOrganizeCompletionNotifications: async () => false,
}));
const signals = ['SIGTERM', 'SIGINT'];
const previous = signals.map((s) => new Set(process.listeners(s)));
const exitCode = process.exitCode;
afterEach(() => {
  signals.forEach((s, i) =>
    process.listeners(s).forEach((fn) => {
      if (!previous[i].has(fn)) process.removeListener(s, fn);
    }),
  );
  process.exitCode = exitCode;
  vi.resetModules();
  vi.clearAllMocks();
});
it('停止领取新任务，等待在途任务完成后关闭数据库连接', async () => {
  let complete;
  mocks.item.mockImplementation(async () => {
    process.emit('SIGTERM');
    await new Promise((resolve) => {
      complete = resolve;
    });
    return true;
  });
  await import('./documentWorker.js');
  await vi.waitFor(() => expect(mocks.item).toHaveBeenCalledOnce());
  expect(mocks.end).not.toHaveBeenCalled();
  expect(mocks.destroy).not.toHaveBeenCalled();
  complete();
  await vi.waitFor(() => {
    expect(mocks.end).toHaveBeenCalledOnce();
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });
  expect(mocks.item).toHaveBeenCalledOnce();
});
it('启动失败也释放连接池', async () => {
  mocks.ensure.mockRejectedValueOnce(new Error('fixture startup failure'));
  await import('./documentWorker.js');
  await vi.waitFor(() => {
    expect(mocks.end).toHaveBeenCalledOnce();
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });
  expect(process.exitCode).toBe(1);
  expect(mocks.item).not.toHaveBeenCalled();
});

vi.mock('./util/imagePreview/worker.js', () => ({
  runSingleImagePreviewJob: vi.fn(async () => false),
  cleanupImageAssets: vi.fn(),
}));
vi.mock('./util/imagePreview/runtime.js', () => ({ inspectImagePreviewRuntime: vi.fn(async () => ({ ready: true })) }));

it('数据库关闭失败仍释放 Redis 连接', async () => {
  mocks.ensure.mockRejectedValueOnce(new Error('fixture startup failure'));
  mocks.end.mockRejectedValueOnce(new Error('fixture close failure'));
  await import('./documentWorker.js');
  await vi.waitFor(() => expect(mocks.destroy).toHaveBeenCalledOnce());
  expect(process.exitCode).toBe(1);
});

it('V3 AI proceeds while the document parser is still occupied', async () => {
  let releaseParser;
  let parserStarted = false;
  mocks.document.mockImplementationOnce(async () => {
    parserStarted = true;
    await new Promise((resolve) => {
      releaseParser = resolve;
    });
    return true;
  });
  mocks.item.mockImplementation(async (_worker, _db, options) => {
    if (options.pipeline !== 'v3') return false;
    await vi.waitFor(() => expect(parserStarted).toBe(true));
    process.emit('SIGTERM');
    releaseParser();
    return true;
  });
  await import('./documentWorker.js');
  await vi.waitFor(() => expect(mocks.end).toHaveBeenCalledOnce());
  expect(mocks.document).toHaveBeenCalledOnce();
  expect(mocks.item.mock.calls.some(([, , options]) => options.pipeline === 'v3')).toBe(true);
});
