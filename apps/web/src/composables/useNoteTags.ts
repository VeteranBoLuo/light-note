import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { apiBasePost } from '@/http/request';

export interface NoteTag {
  id?: string | number;
  name: string;
}

export function normalizeNoteTags(raw: unknown): NoteTag[] {
  let source = raw;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(source)) return [];
  return source.flatMap((item) => {
    if (typeof item === 'string' && item.trim()) return [{ id: item, name: item }];
    if (item && typeof item.name === 'string' && item.name.trim()) return [{ id: item.id, name: item.name }];
    return [];
  });
}

export function useNoteTags(noteId: () => unknown, seed: () => unknown) {
  const loaded = ref<NoteTag[] | null>(null);
  let generation = 0;
  const tags = computed(() => loaded.value ?? normalizeNoteTags(seed()));
  async function refresh() {
    const id = noteId();
    const current = ++generation;
    if (!id) {
      loaded.value = null;
      return;
    }
    try {
      const result = await apiBasePost('/api/note/getNoteTags', { id });
      if (current === generation && result.status === 200 && Array.isArray(result.data)) {
        loaded.value = normalizeNoteTags(result.data);
      }
    } catch {
      // 请求层处理错误；保留当前笔记已有的标签快照。
    }
  }
  watch(
    noteId,
    () => {
      loaded.value = null;
      void refresh();
    },
    { immediate: true },
  );
  onBeforeUnmount(() => {
    generation += 1;
  });
  return { tags, refresh };
}
