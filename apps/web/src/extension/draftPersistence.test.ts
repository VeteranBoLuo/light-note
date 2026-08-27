import { describe, expect, it, vi } from 'vitest';
import { belongsToExtensionDraftSession, createExtensionDraftPersistence } from './draftPersistence';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('浏览器插件草稿持久化队列', () => {
  it('串行写入，丢弃时等待在途写入后再清除且拒绝后续回写', async () => {
    const first = deferred();
    const started = deferred();
    const calls: string[] = [];
    const persistence = createExtensionDraftPersistence(
      vi.fn(async (value: string) => {
        calls.push(`write:${value}:start`);
        if (value === 'first') {
          started.resolve();
          await first.promise;
        }
        calls.push(`write:${value}:end`);
      }),
      vi.fn(async () => {
        calls.push('clear');
      }),
    );

    void persistence.save('first');
    void persistence.save('second');
    await started.promise;
    const discardPromise = persistence.discard();
    void persistence.save('after-discard');
    first.resolve();
    await discardPromise;

    expect(calls).toEqual(['write:first:start', 'write:first:end', 'clear']);
  });

  it('单次写入失败不会阻断后续草稿保存', async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error('storage unavailable')).mockResolvedValueOnce(undefined);
    const persistence = createExtensionDraftPersistence(
      write,
      vi.fn(async () => undefined),
    );

    await persistence.save('first').catch(() => undefined);
    await persistence.save('second');

    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith('second');
  });
});

describe('浏览器插件草稿会话隔离', () => {
  it('只恢复同一次侧栏实例写入的草稿', () => {
    expect(belongsToExtensionDraftSession('panel-a', 'panel-a')).toBe(true);
    expect(belongsToExtensionDraftSession('panel-a', 'panel-b')).toBe(false);
    expect(belongsToExtensionDraftSession(undefined, 'panel-b')).toBe(false);
  });
});
