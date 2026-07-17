import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getActiveProviderInfo: vi.fn(),
  requestDeepSeek: vi.fn(),
  requestDeepSeekStream: vi.fn(),
  reserve: vi.fn(),
  reconcile: vi.fn(),
  poolQuery: vi.fn(),
}));

vi.mock('../util/common.js', () => ({
  resultData: (data, status = 200, message = '') => ({ data, status, message }),
}));
vi.mock('../db/index.js', () => ({ default: { query: mocks.poolQuery } }));
vi.mock('../util/aiOrganize.js', () => ({ suggestBookmarkMeta: vi.fn() }));
vi.mock('../util/agent/deepseekClient.js', () => ({
  getActiveProviderInfo: mocks.getActiveProviderInfo,
  requestDeepSeek: mocks.requestDeepSeek,
  requestDeepSeekStream: mocks.requestDeepSeekStream,
}));
vi.mock('../util/aiQuota.js', () => ({
  reserve: mocks.reserve,
  reconcile: mocks.reconcile,
}));

const { assistNote } = await import('./chatHandle.js');

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
