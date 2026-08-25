import { beforeEach, describe, expect, it, vi } from 'vitest';
import { submitAndroidBatchDownload } from './androidBatchDownload';

/*
 * 这条链路的失败都是「部分成功」：取地址可能单个失败、桥可能拒收、用户可能中途取消，
 * 而已经交给 DownloadManager 的下载撤不回来。所以计数和收尾语义必须锁住 —— 报错报少了
 * 用户会以为文件都在，报多了又会以为全军覆没。
 */
describe('submitAndroidBatchDownload', () => {
  const files = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const resolveMeta = async (file: { id: string }) => ({
    downloadUrl: `https://obs.example.com/${file.id}`,
    fileName: `${file.id}.pdf`,
  });

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('全部成功:每个文件都交给桥一次,带上各自的地址和文件名', async () => {
    const submit = vi.fn().mockReturnValue(true);

    const outcome = await submitAndroidBatchDownload({ files, resolveMeta, submit });

    expect(outcome).toEqual({ succeeded: 3, failed: 0, unconfirmed: 0, cancelled: false });
    expect(submit).toHaveBeenCalledTimes(3);
    expect(submit).toHaveBeenNthCalledWith(1, 'https://obs.example.com/a', 'a.pdf');
    expect(submit).toHaveBeenNthCalledWith(3, 'https://obs.example.com/c', 'c.pdf');
  });

  it('单个取地址失败不影响其余文件:仍然跑完并计入 failed', async () => {
    const submit = vi.fn().mockReturnValue(true);
    const flaky = async (file: { id: string }, index: number) => {
      if (index === 1) throw new Error('signing failed');
      return resolveMeta(file);
    };

    const outcome = await submitAndroidBatchDownload({ files, resolveMeta: flaky, submit });

    expect(outcome).toEqual({ succeeded: 2, failed: 1, unconfirmed: 0, cancelled: false });
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it('桥拒收算失败:postMessage 返回 false 不能当成已下载', async () => {
    const submit = vi.fn().mockReturnValueOnce(true).mockReturnValue(false);

    const outcome = await submitAndroidBatchDownload({ files, resolveMeta, submit });

    expect(outcome).toEqual({ succeeded: 1, failed: 2, unconfirmed: 0, cancelled: false });
  });

  it('异步原生回执会并行收口，并把 enqueue 失败如实计入 failed', async () => {
    const submit = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    const outcome = await submitAndroidBatchDownload({ files, resolveMeta, submit });

    expect(outcome).toEqual({ succeeded: 2, failed: 1, unconfirmed: 0, cancelled: false });
    expect(submit).toHaveBeenCalledTimes(3);
  });

  it('旧版 App 超时回执单独计为 unconfirmed，不能冒充 DownloadManager 已入队', async () => {
    const submit = vi.fn().mockResolvedValue({ ok: true, confirmed: false });

    const outcome = await submitAndroidBatchDownload({ files, resolveMeta, submit });

    expect(outcome).toEqual({ succeeded: 0, failed: 0, unconfirmed: 3, cancelled: false });
  });

  it('取消只停后续提交:已交出去的仍要如实计入 succeeded', async () => {
    const submit = vi.fn().mockReturnValue(true);
    let submitted = 0;

    const outcome = await submitAndroidBatchDownload({
      files,
      resolveMeta,
      submit,
      // 第一个提交完就取消，模拟用户点了「取消」
      isCancelled: () => submitted >= 1,
      onSubmitted: () => {
        submitted += 1;
      },
    });

    expect(outcome).toEqual({ succeeded: 1, failed: 0, unconfirmed: 0, cancelled: true });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('一开始就处于取消态:一个都不提交', async () => {
    const submit = vi.fn().mockReturnValue(true);

    const outcome = await submitAndroidBatchDownload({
      files,
      resolveMeta,
      submit,
      isCancelled: () => true,
    });

    expect(outcome).toEqual({ succeeded: 0, failed: 0, unconfirmed: 0, cancelled: true });
    expect(submit).not.toHaveBeenCalled();
  });

  it('进度按已提交件数递增,总数是选中的文件数', async () => {
    const submit = vi.fn().mockReturnValue(true);
    const seen: Array<[number, number]> = [];

    await submitAndroidBatchDownload({
      files,
      resolveMeta,
      submit,
      onSubmitted: (done, total) => seen.push([done, total]),
    });

    expect(seen).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it('相对路径先拼成绝对地址:原生只认绝对 http(s),老文件的 directory+fileName 也要能下', async () => {
    const submit = vi.fn().mockReturnValue(true);

    const outcome = await submitAndroidBatchDownload({
      files: [{ id: 'legacy' }],
      resolveMeta: async () => ({ downloadUrl: '/upload/legacy.pdf', fileName: 'legacy.pdf' }),
      submit,
    });

    expect(outcome).toEqual({ succeeded: 1, failed: 0, unconfirmed: 0, cancelled: false });
    expect(submit).toHaveBeenCalledWith(`${window.location.origin}/upload/legacy.pdf`, 'legacy.pdf');
  });

  it('非 http(s) 地址不交给桥:postMessage 会返回 true 但原生落不了盘,不能误计成功', async () => {
    const submit = vi.fn().mockReturnValue(true);

    const outcome = await submitAndroidBatchDownload({
      files: [{ id: 'blob' }, { id: 'data' }],
      resolveMeta: async (file: { id: string }) => ({
        downloadUrl: file.id === 'blob' ? 'blob:https://boluo66.top/abc' : 'data:text/plain;base64,aGk=',
        fileName: `${file.id}.txt`,
      }),
      submit,
    });

    expect(outcome).toEqual({ succeeded: 0, failed: 2, unconfirmed: 0, cancelled: false });
    expect(submit).not.toHaveBeenCalled();
  });

  it('空选择不炸也不提交', async () => {
    const submit = vi.fn().mockReturnValue(true);

    const outcome = await submitAndroidBatchDownload({ files: [], resolveMeta, submit });

    expect(outcome).toEqual({ succeeded: 0, failed: 0, unconfirmed: 0, cancelled: false });
    expect(submit).not.toHaveBeenCalled();
  });
});
