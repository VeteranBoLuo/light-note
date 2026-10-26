import { computed, onScopeDispose, ref, watch } from 'vue';
import { useUserStore } from '@/store';
import { applyPreferenceLocally } from '@/utils/savePreference';
import { getCloudSpacePreference, saveCloudSpacePreference } from '@/api/cloudSpacePreferenceApi';

/** A display preference only: file mutations continue to use their explicit targets. */
export function useCloudFileScope() {
  const user = useUserStore();
  const owner = computed(() =>
    [user.id, user.role, user.visitorWorkspace, user.adminContext?.id, user.adminContext?.mode].join('|'),
  );
  const localOnly = computed(() => !user.id || user.role === 'visitor' || Boolean(user.adminContext));
  const includeDescendants = computed(() => user.preferences.cloudIncludeDescendants === true);
  const loading = ref(false),
    saving = ref(false),
    error = ref<'load' | 'save' | ''>('');
  let generation = 0;
  let retryValue = false;
  const localKey = () => `light-note:cloud-file-scope:${owner.value}`;
  function apply(value: boolean) {
    if (localOnly.value) {
      user.preferences.cloudIncludeDescendants = value;
      try {
        localStorage.setItem(localKey(), JSON.stringify(value));
      } catch {
        /* session only */
      }
    } else applyPreferenceLocally({ cloudIncludeDescendants: value });
  }
  watch(
    owner,
    () => {
      generation++;
      loading.value = saving.value = false;
      error.value = '';
      if (localOnly.value) {
        let stored = false;
        try {
          stored = JSON.parse(localStorage.getItem(localKey()) || 'false') === true;
        } catch {
          /* default */
        }
        user.preferences.cloudIncludeDescendants = stored;
      }
    },
    { immediate: true, flush: 'sync' },
  );
  onScopeDispose(() => {
    generation++;
  });

  async function load() {
    if (localOnly.value || loading.value || saving.value) return;
    const request = ++generation;
    loading.value = true;
    error.value = '';
    try {
      const response = await getCloudSpacePreference();
      if (request !== generation) return;
      if (response?.status !== 200 || typeof response.data?.includeDescendants !== 'boolean')
        throw new Error('INVALID_PREFERENCE');
      apply(response.data.includeDescendants);
    } catch {
      if (request === generation) error.value = 'load';
    } finally {
      if (request === generation) loading.value = false;
    }
  }
  async function save(value: boolean) {
    if (loading.value || saving.value || error.value === 'load' || value === includeDescendants.value) return;
    const request = ++generation;
    retryValue = value;
    saving.value = true;
    error.value = '';
    try {
      if (!localOnly.value) {
        const response = await saveCloudSpacePreference(value);
        if (request !== generation) return;
        if (response?.status !== 200 || response.data?.includeDescendants !== value) throw new Error('SAVE_FAILED');
      }
      if (request !== generation) return;
      // Apply only confirmed writes. A failed save retains the previous list and scope.
      apply(value);
    } catch {
      if (request === generation) error.value = 'save';
    } finally {
      if (request === generation) saving.value = false;
    }
  }
  const retry = () => (error.value === 'load' ? load() : save(retryValue));
  return { includeDescendants, localOnly, loading, saving, error, load, save, retry };
}
