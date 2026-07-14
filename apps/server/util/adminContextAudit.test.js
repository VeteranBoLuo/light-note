import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
vi.mock('../db/index.js', () => ({ default: { query } }));

const { attachAdminContextRequestAudit, recordAdminContextAudit } = await import('./adminContextAudit.js');

describe('adminContextAudit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('缺少 actor 或 action 时不写库', async () => {
    await recordAdminContextAudit({ actorUserId: '', action: 'start' });
    await recordAdminContextAudit({ actorUserId: 'root-1', action: '' });
    expect(query).not.toHaveBeenCalled();
  });

  it('审计写入失败不阻断业务', async () => {
    query.mockRejectedValueOnce(new Error('table missing'));
    await expect(recordAdminContextAudit({ actorUserId: 'root-1', action: 'start' })).resolves.toBeUndefined();
  });

  it('请求完成时记录 actor、subject、策略和状态码', async () => {
    query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    let finish;
    const req = {
      adminContext: {
        id: 'ctx-1',
        actorUserId: 'root-1',
        subjectUserId: 'user-1',
        mode: 'readonly',
      },
      adminCapability: { policy: 'read', resourceType: 'bookmark' },
      originalUrl: '/api/bookmark/list?page=1',
      method: 'POST',
      ip: '127.0.0.1',
      headers: { 'user-agent': 'vitest' },
    };
    const res = {
      statusCode: 200,
      once: vi.fn((event, callback) => {
        expect(event).toBe('finish');
        finish = callback;
      }),
    };
    attachAdminContextRequestAudit(req, res);
    finish();
    await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(1));
    const params = query.mock.calls[0][1];
    expect(params).toEqual(expect.arrayContaining(['ctx-1', 'root-1', 'user-1', 'readonly', 'request', '/api/bookmark/list', 'bookmark', 200]));
    expect(JSON.parse(params.at(-1))).toMatchObject({ policy: 'read' });
  });
});
