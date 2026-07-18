import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getActiveProviderInfo: vi.fn(),
  requestDeepSeek: vi.fn(),
  requestDeepSeekStream: vi.fn(),
  reserve: vi.fn(),
  reconcile: vi.fn(),
  poolQuery: vi.fn(),
  suggestBookmarkMeta: vi.fn(),
}));

vi.mock('../util/common.js', () => ({
  resultData: (data, status = 200, message = '') => ({ data, status, message }),
}));
vi.mock('../db/index.js', () => ({ default: { query: mocks.poolQuery } }));
vi.mock('../util/aiOrganize.js', () => ({ suggestBookmarkMeta: mocks.suggestBookmarkMeta }));
vi.mock('../util/agent/deepseekClient.js', () => ({
  getActiveProviderInfo: mocks.getActiveProviderInfo,
  requestDeepSeek: mocks.requestDeepSeek,
  requestDeepSeekStream: mocks.requestDeepSeekStream,
}));
vi.mock('../util/aiQuota.js', () => ({
  reserve: mocks.reserve,
  reconcile: mocks.reconcile,
}));

const { assistNote, generateBookmarkMeta } = await import('./chatHandle.js');

class MockResponse extends EventEmitter {
  writableEnded = false;
  destroyed = false;
  headersSent = false;
  statusCode = 200;
  writes = [];

  setTimeout() {}

  writeHead(statusCode, headers) {
    this.statusCode = statusCode;
    this.headers = headers;
    this.headersSent = true;
  }

  write(chunk) {
    this.writes.push(String(chunk));
    return true;
  }

  end(chunk) {
    if (chunk) this.write(chunk);
    this.writableEnded = true;
  }

  status(statusCode) {
    this.statusCode = statusCode;
    return this;
  }

  send(payload) {
    this.payload = payload;
    this.writableEnded = true;
  }
}

function parseSseEvents(writes) {
  return writes
    .filter((chunk) => chunk.startsWith('data: {'))
    .map((chunk) => JSON.parse(chunk.slice(5).trim()));
}

describe('assistNote SSE', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActiveProviderInfo.mockReturnValue({
      provider: 'deepseek',
      model: 'test-model',
      price: { input: 1, output: 2 },
      noteAssistMaxTokens: 8192,
    });
    mocks.reserve.mockResolvedValue({ exempt: true, blocked: false });
    mocks.reconcile.mockResolvedValue(undefined);
    mocks.poolQuery.mockResolvedValue([{}]);
  });

  it('把真实完成原因回传给前端，并采用笔记助手的输出预算', async () => {
    const heartbeatSpy = vi.spyOn(global, 'setInterval');
    mocks.requestDeepSeekStream.mockImplementation(async (_messages, options) => {
      options.onDelta('【正文】这是被截断前的内容');
      return {
        usage: { promptTokens: 20, completionTokens: 8192, totalTokens: 8212 },
        usageStatus: 'reported',
        finishReason: 'length',
      };
    });
    const req = {
      body: { message: '请润色这篇笔记', stream: true, responseFormat: 'body' },
      user: { id: 'user-1', role: 'user', alias: 'tester' },
      setTimeout: vi.fn(),
    };
    const res = new MockResponse();

    await assistNote(req, res);

    expect(mocks.requestDeepSeekStream).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ maxTokens: 8192, signal: expect.any(AbortSignal) }),
    );
    const events = parseSseEvents(res.writes);
    expect(events.map((event) => event.event)).toEqual(['start', 'delta', 'done']);
    expect(events.at(-1)).toMatchObject({ event: 'done', finishReason: 'length' });
    expect(res.writes.at(-1)).toBe('data: [DONE]\n\n');
    expect(heartbeatSpy).toHaveBeenCalledWith(expect.any(Function), 12_000);
    heartbeatSpy.mockRestore();
  });
});

describe('generateBookmarkMeta URL gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.poolQuery.mockResolvedValue([[]]);
    mocks.suggestBookmarkMeta.mockResolvedValue({ name: '示例', description: '示例站点' });
  });

  it('非法地址不调用数据库、网页抓取或 AI', async () => {
    const res = new MockResponse();
    await generateBookmarkMeta({ body: { url: 'javascript:alert(1)' }, user: { id: 'u1' } }, res);
    expect(res.payload).toMatchObject({ status: 400 });
    expect(mocks.poolQuery).not.toHaveBeenCalled();
    expect(mocks.suggestBookmarkMeta).not.toHaveBeenCalled();
  });

  it('分享文案返回候选选择，不让 AI 私自决定最终 URL', async () => {
    const res = new MockResponse();
    await generateBookmarkMeta(
      { body: { url: '网址放这里：https:// boluo66.top，欢迎体验' }, user: { id: 'u1' } },
      res,
    );
    expect(res.payload).toMatchObject({
      status: 200,
      data: {
        requiresUrlConfirmation: true,
        urlResolution: {
          state: 'needs_confirmation',
          candidates: [{ url: 'https://boluo66.top' }],
        },
      },
    });
    expect(mocks.suggestBookmarkMeta).not.toHaveBeenCalled();
  });

  it('确定地址规范化后才进入智能识别', async () => {
    const res = new MockResponse();
    await generateBookmarkMeta({ body: { url: 'boluo66.top' }, user: { id: 'u1' } }, res);
    expect(mocks.suggestBookmarkMeta).toHaveBeenCalledWith({
      url: 'https://boluo66.top',
      userTags: [],
    });
    expect(res.payload).toMatchObject({ status: 200, data: { resolvedUrl: 'https://boluo66.top' } });
  });
});
