import { ref, onBeforeUnmount, watch, type Ref } from 'vue';
import { resolveImagePreviews, type ImagePreviewSource, type ImagePreviewState } from '@/api/imagePreview';
type Entry = {
  source: ImagePreviewSource;
  listeners: Set<(s: ImagePreviewState) => void>;
  state: ImagePreviewState;
  start: number;
  next: number;
  attempts: number;
  busy: boolean;
};
const entries = new Map<string, Entry>();
let timer: ReturnType<typeof setTimeout> | undefined;
let listening = false;
const keyOf = (s: ImagePreviewSource) => `${s.sourceType}:${s.sourceId}`;
function schedule() {
  if (timer) clearTimeout(timer);
  timer = undefined;
  if (typeof document === 'undefined' || document.hidden) return;
  const times = [...entries.values()].filter((e) => !e.busy && Number.isFinite(e.next)).map((e) => e.next);
  if (times.length) timer = setTimeout(tick, Math.max(0, Math.min(...times) - Date.now()));
}
async function tick() {
  timer = undefined;
  if (document.hidden) return;
  const batch = [...entries.values()].filter((e) => !e.busy && e.next <= Date.now()).slice(0, 50);
  batch.forEach((e) => {
    e.busy = true;
  });
  try {
    const states = await resolveImagePreviews(batch.map((e) => e.source));
    batch.forEach((e) => {
      if (entries.get(keyOf(e.source)) !== e) return;
      const state = states.find((s) => keyOf(s) === keyOf(e.source));
      if (state) {
        e.state = state;
        e.listeners.forEach((fn) => fn(state));
      }
    });
  } catch {
    batch.forEach((e) => {
      if (Date.now() - e.start >= 60000) {
        e.state = { ...e.source, status: 'failed' };
        e.listeners.forEach((fn) => fn(e.state));
      }
    });
  } finally {
    batch.forEach((e) => {
      e.busy = false;
      e.attempts++;
      const pending = ['queued', 'processing'].includes(e.state.status);
      e.next =
        e.state.status === 'ready' && e.state.expiresAt
          ? Math.max(Date.now() + 1000, e.state.expiresAt - 5000)
          : pending && Date.now() - e.start < 60000
            ? Date.now() + [2000, 5000, 10000][Math.min(e.attempts - 1, 2)]
            : Infinity;
    });
    schedule();
  }
}
function visibilityChanged() {
  if (!document.hidden)
    for (const e of entries.values()) {
      if (['queued', 'processing'].includes(e.state.status)) {
        e.start = Date.now();
        e.next = Date.now();
        e.attempts = 0;
      }
    }
  schedule();
}
export function useImagePreview(
  source: Ref<ImagePreviewSource | null>,
  visible: Ref<boolean>,
  initial?: Ref<ImagePreviewState | undefined>,
) {
  const state = ref<ImagePreviewState | null>(null);
  let release = () => {};
  watch(
    [source, visible, () => initial?.value],
    () => {
      release();
      release = () => {};
      state.value = null;
      if (!source.value || !visible.value) return;
      const key = keyOf(source.value);
      let entry = entries.get(key);
      if (!entry) {
        const seed = initial?.value || { ...source.value, status: 'queued' as const };
        const next =
          seed.status === 'ready' && seed.expiresAt && seed.expiresAt > Date.now() + 5000
            ? seed.expiresAt - 5000
            : Date.now();
        entry = {
          source: source.value,
          listeners: new Set(),
          state: seed,
          start: Date.now(),
          next,
          attempts: 0,
          busy: false,
        };
        entries.set(key, entry);
      }
      const listener = (s: ImagePreviewState) => {
        state.value = s;
      };
      entry.listeners.add(listener);
      listener(entry.state);
      if (!listening) {
        document.addEventListener('visibilitychange', visibilityChanged);
        listening = true;
      }
      const current = entry;
      release = () => {
        current.listeners.delete(listener);
        if (!current.listeners.size && entries.get(key) === current) entries.delete(key);
        if (!entries.size && listening) {
          document.removeEventListener('visibilitychange', visibilityChanged);
          listening = false;
        }
        schedule();
      };
      schedule();
    },
    { immediate: true },
  );
  onBeforeUnmount(() => release());
  return state;
}
