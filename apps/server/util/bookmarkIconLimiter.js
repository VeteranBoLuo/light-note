/**
 * 轻笺书签图标抓取 - 全局并发限制器
 *
 * 控制整个后端进程同时向 favicon-api 请求的最大 Origin 数。
 * 注意：此限制器必须跨 HTTP 请求共享，不能每个请求单独限制。
 */

const CONCURRENCY = parseInt(process.env.BOOKMARK_ICON_FETCH_CONCURRENCY || "6", 10);

class BookmarkIconLimiter {
  #active = 0;
  #queue = [];

  /** 尝试获取执行许可，队列满时阻塞 */
  async acquire() {
    if (this.#active < CONCURRENCY) {
      this.#active++;
      return () => this.#release();
    }
    return new Promise((resolve) => {
      this.#queue.push(resolve);
    }).then(() => {
      this.#active++;
      return () => this.#release();
    });
  }

  #release() {
    this.#active--;
    if (this.#queue.length > 0) {
      const next = this.#queue.shift();
      next();
    }
  }

  get active() {
    return this.#active;
  }

  get queued() {
    return this.#queue.length;
  }
}

export const bookmarkIconLimiter = new BookmarkIconLimiter();
