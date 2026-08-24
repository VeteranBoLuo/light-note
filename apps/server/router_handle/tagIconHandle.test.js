import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureNotVisitor: vi.fn(),
  searchTagIcons: vi.fn(),
  resolveTagIcon: vi.fn(),
  runAiExecution: vi.fn(),
}));

vi.mock('../util/common.js', () => ({
  L: (_req, zh) => zh,
  resultData: (data, status = 200, message = '') => ({ data, status, message }),
}));
vi.mock('../util/auth.js', () => ({ ensureNotVisitor: mocks.ensureNotVisitor }));
vi.mock('../util/tagIconService.js', () => ({
  searchTagIcons: mocks.searchTagIcons,
  resolveTagIcon: mocks.resolveTagIcon,
}));
vi.mock('../util/aiExecution/service.js', () => ({ runAiExecution: mocks.runAiExecution }));

const { search } = await import('./tagIconHandle.js');

function response() {
  return {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(payload) {
      this.payload = payload;
      return this;
    },
  };
}

describe('tagIconHandle Gateway governance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureNotVisitor.mockReturnValue(true);
    mocks.searchTagIcons.mockResolvedValue({ icons: ['lucide:tag'] });
    mocks.runAiExecution.mockImplementation(async (_config, operation) => operation());
  });

  it('用户触发的中文语义搜索把真实请求上下文交给 Gateway 配额治理', async () => {
    const req = {
      body: { query: '数据库', page: 0 },
      user: { id: 'user-1', role: 'user' },
      billingUser: { id: 'user-1', role: 'user' },
    };
    const res = response();

    await search(req, res);

    expect(mocks.searchTagIcons).toHaveBeenCalledWith(
      expect.objectContaining({
        query: '数据库',
        page: 0,
        trace: expect.objectContaining({ taskType: 'tag_icon_search' }),
      }),
    );
    expect(mocks.runAiExecution).toHaveBeenCalledWith(
      expect.objectContaining({ request: req, billingPolicy: 'user', skillId: 'tag.icon_keywords' }),
      expect.any(Function),
    );
    expect(res.payload).toMatchObject({ status: 200, data: { icons: ['lucide:tag'] } });
  });

  it.each([
    ['AI_QUOTA_EXCEEDED', 429],
    ['AI_ACCESS_RESTRICTED', 403],
  ])('统一映射根执行错误 %s', async (code, status) => {
    mocks.runAiExecution.mockRejectedValueOnce(Object.assign(new Error('internal'), { code }));
    const req = {
      body: { query: '数据库', page: 0 },
      user: { id: 'user-1', role: 'user' },
      billingUser: { id: 'user-1', role: 'user' },
    };
    const res = response();

    await search(req, res);

    expect(res.statusCode).toBe(status);
    expect(res.payload).toMatchObject({ status, data: { code } });
  });
});
