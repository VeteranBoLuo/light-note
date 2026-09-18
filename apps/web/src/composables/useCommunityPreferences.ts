import { computed, onScopeDispose, ref, watch } from 'vue';
import { useUserStore } from '@/store';
import { getCommunityPreferences, saveCommunityPreferences, type CommunityPreferences } from '@/api/communityApi';

function valid(value: any): value is CommunityPreferences {
  return Boolean(
    value &&
    ['chat', 'feed'].includes(value.defaultView) &&
    Number.isSafeInteger(value.revision) &&
    value.revision >= 0 &&
    Array.isArray(value.availableViews),
  );
}
/** Only confirmed data is cached, under the current account. Never reuses global appearance preferences. */
export function useCommunityPreferences() {
  const user = useUserStore();
  const owner = computed(() => (user.id && user.role !== 'visitor' && !user.adminContext ? String(user.id) : ''));
  const value = ref<CommunityPreferences | null>(null);
  const loading = ref(false),
    saving = ref(false),
    error = ref<'load' | 'save' | ''>('');
  let generation = 0;
  const key = () => `light-note:community-navigation:${owner.value}`;
  function remember(data: CommunityPreferences) {
    value.value = data;
    try {
      sessionStorage.setItem(key(), JSON.stringify(data));
    } catch {
      /* optional cache */
    }
  }
  function reset() {
    generation++;
    value.value = null;
    loading.value = saving.value = false;
    error.value = '';
    if (!owner.value) return;
    try {
      const cached = JSON.parse(sessionStorage.getItem(key()) || 'null');
      if (valid(cached)) value.value = cached;
    } catch {
      /* unavailable */
    }
  }
  watch(owner, reset, { immediate: true, flush: 'sync' });
  onScopeDispose(() => {
    generation++;
  });
  async function load() {
    if (!owner.value || loading.value || saving.value) return;
    const request = ++generation;
    loading.value = true;
    error.value = '';
    try {
      const response = await getCommunityPreferences();
      if (request !== generation) return;
      if (response.status !== 200 || !valid(response.data)) throw new Error('INVALID_PREFERENCES');
      remember(response.data);
    } catch {
      if (request === generation) error.value = 'load';
    } finally {
      if (request === generation) loading.value = false;
    }
  }
  async function save(defaultView: 'chat' | 'feed') {
    if (
      !owner.value ||
      !value.value ||
      loading.value ||
      saving.value ||
      !value.value.availableViews.includes(defaultView)
    )
      return;
    const request = ++generation;
    saving.value = true;
    error.value = '';
    try {
      const response = await saveCommunityPreferences(defaultView, value.value.revision);
      if (request !== generation) return;
      if (response.status !== 200 || !valid(response.data)) throw new Error('SAVE_FAILED');
      remember(response.data);
    } catch {
      if (request === generation) error.value = 'save';
    } finally {
      if (request === generation) saving.value = false;
    }
  }
  const entryPath = computed(() => '/community/chat');
  return { owner, value, loading, saving, error, entryPath, load, save };
}
