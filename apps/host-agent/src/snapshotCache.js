export class SnapshotCache {
  constructor(loader, ttlMs) {
    this.loader = loader;
    this.ttlMs = ttlMs;
    this.value = null;
    this.loadedAt = 0;
    this.pending = null;
  }

  async get() {
    if (this.value && Date.now() - this.loadedAt < this.ttlMs)
      return this.value;
    if (this.pending) return this.pending;
    this.pending = Promise.resolve()
      .then(() => this.loader())
      .then((value) => {
        this.value = value;
        this.loadedAt = Date.now();
        return value;
      })
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  }
}
