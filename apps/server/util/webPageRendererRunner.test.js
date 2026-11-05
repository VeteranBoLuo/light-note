import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ launch: vi.fn(), closeProxy: vi.fn().mockResolvedValue() }));
vi.mock('playwright-core', () => ({ chromium: { launch: mocks.launch } }));
vi.mock('./safeWebProxy.js', () => ({
  startSafeWebProxy: async () => ({ url: 'http://127.0.0.1:1', close: mocks.closeProxy }),
}));
const {
  webPageRendererRunnerInternals: { waitForRenderedDom, run },
} = await import('./webPageRendererRunner.js');

const ready = () => ({
  href: 'https://example.com/article',
  title: '最终网页',
  text: '真实网页内容。'.repeat(12),
  description: '',
  shareTitle: '',
  elements: 1,
});
const waitPage = (snapshot) => ({
  waitForTimeout: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  evaluate: vi.fn(async () => JSON.stringify(snapshot())),
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('browser material readiness', () => {
  it('没有加载文案的空壳保持等待，正文出现并稳定后才结束', async () => {
    vi.useFakeTimers();
    const start = Date.now();
    let done = false;
    const page = waitPage(() => (Date.now() - start < 1800 ? { ...ready(), title: 'Vite App', text: '' } : ready()));
    const pending = waitForRenderedDom(page, start + 12000).then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(1600);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1600);
    await pending;
    expect(done).toBe(true);
  });

  it('关键 GET 请求未结束时不把暂时静止的 DOM 当成完成', async () => {
    vi.useFakeTimers();
    const start = Date.now();
    let done = false;
    const pending = waitForRenderedDom(waitPage(ready), start + 12000, () => (Date.now() - start < 2000 ? 1 : 0)).then(
      () => {
        done = true;
      },
    );
    await vi.advanceTimersByTimeAsync(1600);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(400);
    await pending;
    expect(done).toBe(true);
  });

  it('始终无材料时按剩余总时限结束，不无限等待', async () => {
    vi.useFakeTimers();
    const start = Date.now();
    const page = waitPage(() => ({ ...ready(), title: 'Vite App', text: '' }));
    const pending = waitForRenderedDom(page, start + 1750);
    await vi.runAllTimersAsync();
    await pending;
    expect(Date.now() - start).toBe(1750);
  });

  it('正文提到 loading 不拖延已稳定长文，短分享页可使用作者元信息', async () => {
    vi.useFakeTimers();
    for (const snapshot of [
      { ...ready(), text: 'loading 状态排查教程。'.repeat(100) },
      { ...ready(), text: '', shareTitle: '作者提供的分享标题' },
    ]) {
      const start = Date.now();
      const pending = waitForRenderedDom(
        waitPage(() => snapshot),
        start + 12000,
      );
      await vi.runAllTimersAsync();
      await pending;
      expect(Date.now() - start).toBe(1200);
    }
  });
});

it('页面脚本跳转后采用最终主文档响应，忽略 iframe 状态且不延长总时限', async () => {
  vi.useFakeTimers();
  if (typeof process.getuid === 'function') vi.spyOn(process, 'getuid').mockReturnValue(1000);
  const handlers = new Map();
  const mainFrame = {},
    childFrame = {};
  const response = (status, frame) => ({
    status: () => status,
    allHeaders: async () => ({ 'content-type': 'text/html' }),
    frame: () => frame,
    request: () => ({ isNavigationRequest: () => true }),
  });
  const emit = (name, event) => (handlers.get(name) || []).forEach((handler) => handler(event));
  const initial = response(412, mainFrame),
    final = response(200, mainFrame);
  const page = {
    on(name, handler) {
      handlers.set(name, [...(handlers.get(name) || []), handler]);
    },
    mainFrame: () => mainFrame,
    route: vi.fn(),
    goto: vi.fn(async () => {
      emit('response', initial);
      return initial;
    }),
    async waitForTimeout(ms) {
      await new Promise((resolve) => setTimeout(resolve, ms));
      emit('response', final);
      emit('response', response(403, childFrame));
    },
    evaluate: vi.fn(async (_fn, args) =>
      args
        ? { ok: true, url: ready().href, status: args.responseStatus, bodyText: ready().text, signals: {} }
        : JSON.stringify(ready()),
    ),
  };
  const close = vi.fn().mockResolvedValue();
  mocks.launch.mockImplementation(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return { version: () => '156.0.0.0', newContext: async () => ({ newPage: async () => page }), close };
  });
  const pending = run({ url: 'https://example.com/start', timeout: 4000, bodyLimit: 2000, maxRequests: 80 });
  await vi.runAllTimersAsync();
  const result = await pending;
  expect(page.goto.mock.calls[0][1].timeout).toBe(3000);
  expect(result).toMatchObject({ ok: true, status: 200, bodyText: ready().text });
  expect(close).toHaveBeenCalledOnce();
  expect(mocks.closeProxy).toHaveBeenCalledOnce();
});
