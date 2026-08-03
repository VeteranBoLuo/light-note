import { onBeforeUnmount, ref, type Ref } from 'vue';

interface CursorPage<T> {
  items?: T[];
  total?: number;
  nextCursor?: string | null;
  hasMore?: boolean;
}

interface CursorResponse<T> {
  status?: number | boolean;
  msg?: string;
  data?: CursorPage<T>;
}

interface LoadOptions {
  reset?: boolean;
  silent?: boolean;
}

interface AdminCursorListOptions<T> {
  request: (cursor: string | null, limit: number) => Promise<CursorResponse<T>>;
  limit?: number;
  itemKey?: keyof T | ((item: T) => unknown);
  mapItems?: (items: T[]) => T[];
  onError?: (message: string, silent: boolean) => void;
}

export function useAdminCursorList<T>(options: AdminCursorListOptions<T>) {
  const items = ref<T[]>([]) as Ref<T[]>;
  const total = ref(0);
  const loading = ref(false);
  const hasMore = ref(true);
  const nextCursor = ref<string | null>(null);
  const limit = Math.min(100, Math.max(1, Math.trunc(options.limit || 50)));
  let requestSeq = 0;

  const getKey = (item: T) => {
    if (typeof options.itemKey === 'function') return options.itemKey(item);
    return item?.[(options.itemKey || 'id') as keyof T];
  };

  async function load(loadOptions: LoadOptions = {}) {
    const reset = Boolean(loadOptions.reset);
    if (!reset && (loading.value || !hasMore.value)) return false;
    if (reset) {
      requestSeq += 1;
      items.value = [];
      nextCursor.value = null;
      hasMore.value = true;
    }
    const seq = requestSeq;
    const cursor = reset ? null : nextCursor.value;
    loading.value = true;
    try {
      const response = await options.request(cursor, limit);
      if (seq !== requestSeq) return false;
      if (response?.status !== 200 && response?.status !== true) {
        throw new Error(response?.msg || '列表加载失败');
      }
      const page = response.data || {};
      const mapped = options.mapItems ? options.mapItems(page.items || []) : page.items || [];
      if (reset) {
        items.value = mapped;
      } else {
        const existing = new Set(items.value.map(getKey));
        items.value = [...items.value, ...mapped.filter((item) => !existing.has(getKey(item)))];
      }
      if (Number.isFinite(Number(page.total))) total.value = Number(page.total);
      nextCursor.value = page.nextCursor || null;
      hasMore.value = Boolean(page.hasMore && nextCursor.value);
      return true;
    } catch (error: any) {
      if (seq !== requestSeq) return false;
      options.onError?.(error?.message || '列表加载失败', Boolean(loadOptions.silent));
      return false;
    } finally {
      if (seq === requestSeq) loading.value = false;
    }
  }

  function reload(options: Omit<LoadOptions, 'reset'> = {}) {
    return load({ ...options, reset: true });
  }

  function cancel() {
    requestSeq += 1;
    loading.value = false;
  }

  onBeforeUnmount(cancel);

  return { items, total, loading, hasMore, nextCursor, loadMore: () => load(), reload, cancel };
}
