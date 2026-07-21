import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureNotVisitor: vi.fn(),
  searchTagIcons: vi.fn(),
  resolveTagIcon: vi.fn(),
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
  });

  it('用户触发的中文语义搜索把真实请求上下文交给 Gateway 配额治理', async () => {
    const req = {
      body: { query: '数据库', page: 0 },
      user: { id: 'user-1', role: 'user' },
      billingUser: { id: 'user-1', role: 'user' },
    };
    const res = response();

    await search(req, res);

    expect(mocks.searchTagIcons).toHaveBeenCalledWith({
      query: '数据库',
      page: 0,
      governance: { request: req, quotaPolicy: 'user', taskType: 'tag_icon_search' },
    });
    expect(res.payload).toMatchObject({ status: 200, data: { icons: ['lucide:tag'] } });
  });
});
