import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';
import {
  resetAndroidDownloadProgressForTest,
  useAndroidDownloadProgress,
} from './useAndroidDownloadProgress';

/*
 * 进度聚合 + 两种移除时机（终态短暂停留 / 失联清理）都靠定时器，
 * 改动时最容易悄悄坏掉的就是「进度条不消失」和「刚出现就消失」这两头。
 */
function push(progress: Record<string, unknown>) {
  window.__lightNoteAndroidDownloadProgress!(progress);
}

describe('useAndroidDownloadProgress', () => {
  let scope: ReturnType<typeof effectScope>;
  let downloads: ReturnType<typeof useAndroidDownloadProgress>['downloads'];

  beforeEach(() => {
    vi.useFakeTimers();
    resetAndroidDownloadProgressForTest();
    scope = effectScope();
    scope.run(() => {
      downloads = useAndroidDownloadProgress().downloads;
    });
  });

  afterEach(() => {
    scope.stop();
    resetAndroidDownloadProgressForTest();
    vi.useRealTimers();
  });

  it('同一个 id 只占一条,按 id 就地更新而不是不断追加', () => {
    push({ id: '1', fileName: 'a.pdf', status: 'running', percent: 10 });
    push({ id: '1', fileName: 'a.pdf', status: 'running', percent: 60 });
    expect(downloads.value).toHaveLength(1);
    expect(downloads.value[0].percent).toBe(60);
  });

  it('多个下载并存', () => {
    push({ id: '1', fileName: 'a.pdf', status: 'running', percent: 10 });
    push({ id: '2', fileName: 'b.zip', status: 'running', percent: 20 });
    expect(downloads.value.map((item) => item.id)).toEqual(['1', '2']);
  });

  it('成功后短暂停留再消失,让人看得到 100%', () => {
    push({ id: '1', fileName: 'a.pdf', status: 'success', percent: 100 });
    expect(downloads.value).toHaveLength(1);
    vi.advanceTimersByTime(1999);
    expect(downloads.value).toHaveLength(1);
    vi.advanceTimersByTime(2);
    expect(downloads.value).toHaveLength(0);
  });

  it('失败同样短暂停留后消失', () => {
    push({ id: '1', fileName: 'a.pdf', status: 'failed', percent: -1 });
    vi.advanceTimersByTime(2001);
    expect(downloads.value).toHaveLength(0);
  });

  it('原生停止推送(轮询超时)后按失联清理,不留永久卡住的进度条', () => {
    push({ id: '1', fileName: 'big.iso', status: 'running', percent: 30 });
    // 远超终态停留时间但还没到失联阈值：仍应留在界面上
    vi.advanceTimersByTime(30_000);
    expect(downloads.value).toHaveLength(1);
    vi.advanceTimersByTime(60_001);
    expect(downloads.value).toHaveLength(0);
  });

  it('持续有进度时失联计时被不断重置,长下载不会被误清', () => {
    push({ id: '1', fileName: 'big.iso', status: 'running', percent: 10 });
    for (let i = 0; i < 5; i += 1) {
      vi.advanceTimersByTime(60_000);
      push({ id: '1', fileName: 'big.iso', status: 'running', percent: 10 + i });
    }
    vi.advanceTimersByTime(60_000);
    expect(downloads.value).toHaveLength(1);
  });

  it('作用域销毁后解绑,不再改状态', () => {
    push({ id: '1', fileName: 'a.pdf', status: 'running', percent: 10 });
    scope.stop();
    push({ id: '2', fileName: 'b.pdf', status: 'running', percent: 10 });
    expect(downloads.value).toHaveLength(0);
  });
});
