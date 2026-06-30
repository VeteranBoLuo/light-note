const buckets = new Map();

const now = () => Date.now();

const getBucket = (key) => {
  if (!buckets.has(key)) {
    buckets.set(key, []);
  }
  return buckets.get(key);
};

const prune = (bucket, windowMs) => {
  const cutoff = now() - windowMs;
  while (bucket.length && bucket[0].time < cutoff) {
    bucket.shift();
  }
};

export const addWindowEvent = (key, data = {}, windowMs = 24 * 60 * 60 * 1000) => {
  const bucket = getBucket(key);
  bucket.push({ time: now(), data });
  prune(bucket, windowMs);
  return bucket.length;
};

export const countWindowEvents = (key, windowMs) => {
  const bucket = getBucket(key);
  prune(bucket, windowMs);
  return bucket.length;
};

export const uniqueWindowValues = (key, field, windowMs) => {
  const bucket = getBucket(key);
  prune(bucket, windowMs);
  return new Set(bucket.map((item) => item.data?.[field]).filter(Boolean)).size;
};

setInterval(
  () => {
    const cutoff = now() - 24 * 60 * 60 * 1000;
    for (const [key, bucket] of buckets.entries()) {
      const compacted = bucket.filter((item) => item.time >= cutoff);
      if (compacted.length === 0) {
        buckets.delete(key);
      } else {
        buckets.set(key, compacted);
      }
    }
  },
  10 * 60 * 1000,
).unref?.();
