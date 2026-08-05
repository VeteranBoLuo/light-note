import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const apiQueryPost = vi.fn();

vi.mock('@/http/request.ts', () => ({
  apiQueryPost: (...args: unknown[]) => apiQueryPost(...args),
}));

import { useTagManage } from './useTagManage';

const tagRow = (id: string) => ({ id, name: `标签${id}` });

beforeEach(() => {
  setActivePinia(createPinia());
  apiQueryPost.mockReset();
});

describe('useTagManage.reload 的静默模式', () => {
  it('静默刷新不触碰 loading，页面因此不会整页闪 Loading', async () => {
    const { loading, refreshing, tags, reload } = useTagManage();
    let loadingDuringRequest: boolean | null = null;
    let refreshingDuringRequest: boolean | null = null;
    apiQueryPost.mockImplementation(() => {
      // 请求进行中的瞬时状态才是关键:整页遮罩由 loading 驱动
      loadingDuringRequest = loading.value;
      refreshingDuringRequest = refreshing.value;
      return Promise.resolve({ status: 200, data: [tagRow('1')] });
    });

    await reload({ silent: true });

    expect(loadingDuringRequest).toBe(false);
    expect(refreshingDuringRequest).toBe(true);
    expect(tags.value).toEqual([tagRow('1')]);
    // 两个状态都要复位，否则下一次下拉会被 externalBusy 挡住
    expect(loading.value).toBe(false);
    expect(refreshing.value).toBe(false);
  });

  it('不传参时行为与改造前一致：走 loading', async () => {
    const { loading, refreshing, reload } = useTagManage();
    let loadingDuringRequest: boolean | null = null;
    let refreshingDuringRequest: boolean | null = null;
    apiQueryPost.mockImplementation(() => {
      loadingDuringRequest = loading.value;
      refreshingDuringRequest = refreshing.value;
      return Promise.resolve({ status: 200, data: [] });
    });

    await reload();

    expect(loadingDuringRequest).toBe(true);
    expect(refreshingDuringRequest).toBe(false);
    expect(loading.value).toBe(false);
  });

  it('静默刷新失败时保留旧标签，不清空成空列表', async () => {
    const { tags, reload } = useTagManage();
    apiQueryPost.mockResolvedValueOnce({ status: 200, data: [tagRow('1'), tagRow('2')] });
    await reload();
    expect(tags.value).toHaveLength(2);

    // 下拉刷新失败必须保留旧数据:清空会让用户的列表凭空消失
    apiQueryPost.mockResolvedValueOnce({ status: 500, data: null });
    await reload({ silent: true });
    expect(tags.value).toHaveLength(2);
  });

  it('请求抛异常时两个状态都复位', async () => {
    const { loading, refreshing, reload } = useTagManage();
    apiQueryPost.mockRejectedValueOnce(new Error('network'));

    await expect(reload({ silent: true })).rejects.toThrow('network');
    expect(loading.value).toBe(false);
    expect(refreshing.value).toBe(false);
  });
});
