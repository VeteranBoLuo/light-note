import { describe, expect, it, vi } from "vitest";
import { SnapshotCache } from "./snapshotCache.js";

describe("SnapshotCache", () => {
  it("合并同一缓存窗口的并发慢检查", async () => {
    let resolve;
    const loader = vi.fn(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const cache = new SnapshotCache(loader, 60_000);
    const first = cache.get();
    const second = cache.get();
    await Promise.resolve();
    expect(loader).toHaveBeenCalledTimes(1);
    resolve({ ok: true });
    await expect(Promise.all([first, second])).resolves.toEqual([
      { ok: true },
      { ok: true },
    ]);
    await expect(cache.get()).resolves.toEqual({ ok: true });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("失败不污染缓存，下一次请求仍可重新采集", async () => {
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error("failed"))
      .mockResolvedValueOnce({ ok: true });
    const cache = new SnapshotCache(loader, 60_000);
    await expect(cache.get()).rejects.toThrow("failed");
    await expect(cache.get()).resolves.toEqual({ ok: true });
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
