import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp, reactive } from 'vue';

const mocks = vi.hoisted(() => ({ user: {} as any, post: vi.fn(), get: vi.fn(), log: vi.fn() }));
vi.mock('@/store', () => ({ useUserStore: () => mocks.user }));
vi.mock('@/api/commonApi', () => ({ recordOperation: mocks.log }));
vi.mock('@/http/request', () => ({ apiBaseGet: mocks.get, apiBasePost: mocks.post }));
import { usePublicResourceWrite } from './usePublicResourceWrite';

let app: ReturnType<typeof createApp>;
function setup() {
  let writer!: ReturnType<typeof usePublicResourceWrite>;
  app = createApp({
    setup() {
      writer = usePublicResourceWrite();
      return () => null;
    },
  });
  app.mount(document.createElement('div'));
  return writer;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.user = reactive({ id: 'one', role: 'user', adminContext: null, adminPreview: false });
  mocks.log.mockResolvedValue(undefined);
  mocks.post.mockResolvedValue({ status: 200, data: { publicId: 'p', version: 2 } });
  mocks.get.mockResolvedValue({ status: 200, data: { found: false, result: null } });
});
afterEach(() => app?.unmount());

it.each([
  ['submit', {}, '提交审核'],
  ['own/p/withdraw', {}, '取消公开'],
  ['p/save', {}, '保存公开资源副本'],
  ['p/report', { reason: 'private reason' }, '举报公开资源'],
  ['moderation/p/decide', { action: 'approve' }, '审核通过'],
  ['moderation/p/decide', { action: 'reject', reason: 'private reason' }, '审核拒绝'],
  ['moderation/p/decide', { action: 'remove' }, '下架公开资源'],
  ['moderation/p/decide', { action: 'unlock' }, '解除下架'],
  ['moderation/reports/r', { action: 'remove' }, '处理举报并下架'],
  ['moderation/reports/r', { action: 'dismiss' }, '驳回举报'],
] as const)('仅在 %s 写入明确成功后记录低敏操作', async (path, body, label) => {
  await setup().execute(path, body);
  expect(mocks.log).toHaveBeenCalledExactlyOnceWith({ module: '公开管理', operation: `${label}【成功】` });
});

it('首次超时且无回执不记成功，重试确认原回执后只记一次', async () => {
  mocks.post.mockRejectedValue(new Error('timeout'));
  const writer = setup();
  await expect(writer.execute('p/save', { expectedVersion: 1 })).rejects.toThrow();
  expect(mocks.log).not.toHaveBeenCalled();
  mocks.get.mockResolvedValue({ status: 200, data: { found: true, result: { id: 'copy' } } });
  await writer.execute('p/save', { expectedVersion: 1 });
  expect(mocks.post).toHaveBeenCalledTimes(1);
  expect(mocks.log).toHaveBeenCalledTimes(1);
});

it.each([
  [{ existing: true }, '已有副本'],
  [{ existing: true, inTrash: true }, '已有副本在回收站'],
  [{ reused: true }, '已处理，无须重复操作'],
])('复用结果 %o 不记作新建成功', async (result, outcome) => {
  mocks.post.mockResolvedValue({ status: 200, data: result });
  await setup().execute('p/save', {});
  expect(mocks.log).toHaveBeenCalledExactlyOnceWith({
    module: '公开管理',
    operation: `保存公开资源副本【${outcome}】`,
  });
});

it('切号后的迟到成功不能归入新账号', async () => {
  let finish!: (value: any) => void;
  mocks.post.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const writer = setup();
  const pending = writer.execute('p/save', {});
  mocks.user.id = 'two';
  finish({ status: 200, data: { id: 'copy' } });
  await expect(pending).rejects.toThrow('PUBLIC_RESOURCE_IDENTITY_CHANGED');
  expect(mocks.log).not.toHaveBeenCalled();
});

it('离开页面后不记录迟到结果，避免后续切号污染归属', async () => {
  let finish!: (value: any) => void;
  mocks.post.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = setup().execute('p/save', {});
  app.unmount();
  finish({ status: 200, data: { id: 'copy' } });
  await expect(pending).rejects.toThrow('PUBLIC_RESOURCE_IDENTITY_CHANGED');
  expect(mocks.log).not.toHaveBeenCalled();
});

it.each(['sync', 'async'])('日志 %s 故障不改变业务成功', async (mode) => {
  if (mode === 'sync')
    mocks.log.mockImplementationOnce(() => {
      throw new Error('log failed');
    });
  else mocks.log.mockRejectedValueOnce(new Error('log failed'));
  const writer = setup();
  await expect(writer.execute('p/save', {})).resolves.toMatchObject({ publicId: 'p' });
  expect(writer.busy.value).toBe(false);
});
