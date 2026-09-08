import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { apiBaseGet, apiBasePost } from '@/http/request';
import { useUserStore } from '@/store';
import { toolboxRecentUseIdentityKey } from '@/utils/toolboxRecentUse';
import { toolboxProjectRevision, invalidateToolboxProjects } from '@/utils/toolboxProjectState';
import type { ToolboxHomeWorkspaceSummary } from '@/api/toolbox';

type Entry = { dismissed: boolean; hasProjects: boolean; projects: ToolboxHomeWorkspaceSummary[] };
const cache = new Map<string, { value?: Entry; at: number; revision: number; pending?: Promise<Entry> }>();
export function useToolboxProjectEntry() {
  const user = useUserStore();
  const owner = computed(() => toolboxRecentUseIdentityKey(user));
  const eligible = computed(() => Boolean(user.id) && !user.adminContext && !user.visitorWorkspace);
  const data = ref<Entry | null>(null);
  const loading = ref(false);
  const failed = ref(false);
  let generation = 0;
  async function load(force = false) {
    if (!eligible.value) return;
    const token = ++generation;
    const key = owner.value;
    const revision = toolboxProjectRevision.value;
    let entry = cache.get(key);
    if (!entry) {
      entry = { at: 0, revision };
      cache.set(key, entry);
    }
    if (!force && entry.value && entry.revision === revision && Date.now() - entry.at < 60_000) {
      data.value = entry.value;
      failed.value = false;
      return;
    }
    loading.value = !data.value;
    try {
      if (!entry.pending) {
        const target = entry;
        target.pending = apiBaseGet('/api/toolbox/project-entry', undefined, { silent: true })
          .then((response) => {
            if (response.status !== 200) throw new Error('project-entry');
            const value = response.data as Entry;
            target.value = value;
            target.at = Date.now();
            target.revision = revision;
            return value;
          })
          .finally(() => {
            target.pending = undefined;
          });
      }
      const value = await entry.pending;
      if (entry.revision !== toolboxProjectRevision.value && token === generation) {
        await load(true);
        return;
      }
      if (token === generation && key === owner.value && eligible.value) {
        data.value = value;
        failed.value = false;
      }
    } catch {
      if (token === generation) failed.value = true;
    } finally {
      if (token === generation) loading.value = false;
    }
  }
  async function dismiss() {
    const key = owner.value;
    if (!eligible.value || user.role === 'visitor') return;
    const response = await apiBasePost('/api/toolbox/project-entry/dismiss', {}, { silent: true });
    if (response.status !== 200) throw new Error('project-entry-dismiss');
    if (key !== owner.value || !eligible.value) return;
    user.preferences.workshopIntroDismissed = true;
    if (data.value) data.value = { ...data.value, dismissed: true };
    invalidateToolboxProjects();
  }
  function onVisible() {
    if (document.visibilityState === 'visible') void load();
  }
  watch(
    [owner, eligible],
    () => {
      generation++;
      data.value = null;
      failed.value = false;
      loading.value = false;
      void load();
    },
    { immediate: true },
  );
  watch(toolboxProjectRevision, () => {
    if (document.visibilityState === 'visible') void load(true);
  });
  onMounted(() => document.addEventListener('visibilitychange', onVisible));
  onBeforeUnmount(() => {
    generation++;
    document.removeEventListener('visibilitychange', onVisible);
  });
  return { data, loading, failed, eligible, owner, load, dismiss };
}
