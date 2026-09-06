import { computed, onScopeDispose, ref, watch, type Ref } from 'vue';
import {
  fetchImagePreviews,
  imagePreviewsEnabled,
  type ImagePreviewSource,
  type ImagePreviewState,
  type ImagePreviewStrategy,
} from '@/api/imagePreviewApi';
import { useUserStore } from '@/store';

type Listener = {
  identity: string;
  source: ImagePreviewSource;
  id: string;
  strategy: ImagePreviewStrategy;
  started: number;
  prepared: boolean;
  retry: boolean;
  running: boolean;
  state: Ref<ImagePreviewState | null>;
  disabled: Ref<boolean>;
};
const listeners = new Set<Listener>();
let timer: ReturnType<typeof setTimeout> | undefined;
let listening = false;
function schedule(delay = 0) {
  if (timer || !listeners.size || document.hidden) return;
  timer = setTimeout(() => {
    timer = undefined;
    void flush();
  }, delay);
}
async function flush() {
  if (document.hidden) return;
  const groups = new Map<string, Listener[]>();
  for (const item of listeners) {
    if (item.running || item.disabled.value || ['ready', 'failed'].includes(item.state.value?.status || '')) continue;
    if (Date.now() - item.started >= 30_000) {
      item.state.value = { id: item.id, status: 'failed', errorCode: 'IMAGE_PREVIEW_TIMEOUT' };
      continue;
    }
    const key = `${item.identity}:${item.source}:${item.strategy}:${item.prepared}:${item.retry}`;
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  for (const group of groups.values()) {
    const ids = [...new Set(group.map((item) => item.id))];
    for (let offset = 0; offset < ids.length; offset += 40) {
      if (document.hidden) break;
      const batchIds = ids.slice(offset, offset + 40);
      const batch = group.filter((item) => listeners.has(item) && batchIds.includes(item.id));
      if (!batch.length) continue;
      batch.forEach((item) => {
        item.running = true;
      });
      const first = batch[0];
      try {
        const response = await fetchImagePreviews(first.source, batchIds, first.strategy, !first.prepared, first.retry);
        for (const item of batch) {
          if (!listeners.has(item)) continue;
          item.disabled.value = !response.enabled;
          item.state.value = response.items.find((state) => state.id === item.id) || { id: item.id, status: 'failed' };
          item.prepared = true;
        }
      } catch {
        batch.forEach((item) => {
          if (listeners.has(item))
            item.state.value = { id: item.id, status: 'failed', errorCode: 'IMAGE_PREVIEW_UNAVAILABLE' };
        });
      } finally {
        batch.forEach((item) => {
          item.running = false;
        });
      }
    }
  }
  if (
    [...listeners].some((item) => !item.disabled.value && !['ready', 'failed'].includes(item.state.value?.status || ''))
  )
    schedule(2000);
}
function visibilityChanged() {
  if (document.hidden) {
    clearTimeout(timer);
    timer = undefined;
  } else schedule();
}
export function useImagePreview(
  source: () => ImagePreviewSource,
  id: () => string,
  active: () => boolean,
  strategy: ImagePreviewStrategy = 'image_thumbnail',
) {
  const user = useUserStore();
  const state = ref<ImagePreviewState | null>(null);
  const disabled = ref(false);
  let entry: Listener | undefined;
  let refreshed = false;
  const identity = computed(() => `${user.id}:${user.role}:${user.adminContext?.id || ''}:${user.visitorWorkspace}`);
  function detach() {
    if (entry) listeners.delete(entry);
    entry = undefined;
    if (!listeners.size) {
      clearTimeout(timer);
      timer = undefined;
      document.removeEventListener('visibilitychange', visibilityChanged);
      listening = false;
    }
  }
  function attach(retry = false) {
    detach();
    if (!id() || !active() || !imagePreviewsEnabled(source())) return;
    entry = {
      source: source(),
      id: id(),
      strategy,
      identity: identity.value,
      started: Date.now(),
      prepared: false,
      retry,
      running: false,
      state,
      disabled,
    };
    listeners.add(entry);
    if (!listening) {
      document.addEventListener('visibilitychange', visibilityChanged);
      listening = true;
    }
    schedule();
  }
  watch(
    [id, source, active, identity],
    () => {
      state.value = null;
      disabled.value = false;
      refreshed = false;
      attach();
    },
    { immediate: true },
  );
  onScopeDispose(detach);
  function retry() {
    state.value = null;
    attach(true);
  }
  function refreshOnce() {
    if (refreshed) {
      state.value = { id: id(), status: 'failed', errorCode: 'IMAGE_PREVIEW_LOAD_FAILED' };
      return;
    }
    refreshed = true;
    state.value = null;
    attach();
  }
  return { state, disabled, retry, refreshOnce, identity };
}
