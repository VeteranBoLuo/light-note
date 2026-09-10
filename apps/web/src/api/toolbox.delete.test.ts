import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ remove: vi.fn(), invalidate: vi.fn() }));
vi.mock('@/http/request', () => ({
  apiBaseGet: vi.fn(),
  apiBasePatch: vi.fn(),
  apiBasePost: vi.fn(),
  apiBaseDelete: mocks.remove,
}));
vi.mock('@/utils/toolboxProjectState', () => ({ invalidateToolboxProjects: mocks.invalidate }));
vi.mock('@/api/aiTelemetry', () => ({ recordAiProductEvent: vi.fn() }));
import { deleteToolboxWorkspace } from './toolbox';
beforeEach(() => vi.clearAllMocks());
describe('项目删除客户端', () => {
  it('删除成功后失效项目缓存', async () => {
    mocks.remove.mockResolvedValue({ status: 200, data: { id: 'project' } });
    await deleteToolboxWorkspace('project');
    expect(mocks.remove).toHaveBeenCalledWith('/api/toolbox/workspaces/project', undefined, { silent: true });
    expect(mocks.invalidate).toHaveBeenCalledOnce();
  });
  it('丢失成功响应后重试可收敛到已删除状态', async () => {
    mocks.remove.mockRejectedValue({
      response: { status: 404, data: { data: { code: 'TOOLBOX_WORKSPACE_NOT_FOUND' } } },
    });
    await deleteToolboxWorkspace('project');
    expect(mocks.invalidate).toHaveBeenCalledOnce();
  });
  it('失败不伪装成功或失效缓存', async () => {
    mocks.remove.mockRejectedValue(new Error('offline'));
    await expect(deleteToolboxWorkspace('project')).rejects.toThrow('offline');
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
});
