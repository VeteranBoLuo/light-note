import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import useUserStore from './useUser';
import { publicGet, type PublicResourceCapabilities } from '@/api/publicResources';
import { logPublicResourceOperation } from '@/utils/publicResourceOperationLog';

const empty = (): PublicResourceCapabilities => ({
  enabled: false,
  submissionsEnabled: false,
  aiEnabled: false,
  moderationEnabled: false,
});
export const usePublicResourceScope = defineStore('publicResourceScope', () => {
  const user = useUserStore(),
    choice = ref(false),
    caps = ref(empty()),
    loaded = ref(false);
  const identity = computed(() =>
    [user.id, user.role, user.adminContext?.id || '', user.adminPreview ? 'preview' : ''].join('|'),
  );
  const eligible = computed(() =>
    Boolean(user.id && ['root', 'user', 'test'].includes(user.role) && !user.adminContext && !user.adminPreview),
  );
  const included = computed(() => eligible.value && choice.value && (!loaded.value || caps.value.enabled));
  const preferenceKey = () => `light-note:public-search:included:v1:${encodeURIComponent(user.id)}`;
  function restoreIncluded() {
    let remembered = false;
    if (eligible.value) {
      try {
        remembered = localStorage.getItem(preferenceKey()) === '1';
      } catch {
        /* Storage may be unavailable; search remains usable within this session. */
      }
    }
    choice.value = remembered;
  }
  let generation = 0,
    pending: Promise<void> | null = null;
  watch(
    identity,
    () => {
      generation++;
      caps.value = empty();
      loaded.value = false;
      pending = null;
      restoreIncluded();
    },
    { flush: 'sync', immediate: true },
  );
  async function ensure(force = false) {
    if (!eligible.value) {
      caps.value = empty();
      return;
    }
    if (pending) return pending;
    if (loaded.value && !force) return;
    const current = generation;
    const task = (async () => {
      try {
        const value = await publicGet<PublicResourceCapabilities>('capabilities');
        if (current === generation) {
          caps.value = value;
          loaded.value = true;
        }
      } catch {
        if (current === generation) {
          caps.value = empty();
          loaded.value = true;
        }
      } finally {
        if (current === generation) pending = null;
      }
    })();
    pending = task;
    await task;
  }
  function setIncluded(value: boolean, { remember = false } = {}) {
    if (!eligible.value) return;
    const changed = choice.value !== value;
    choice.value = value;
    if (remember) {
      try {
        localStorage.setItem(preferenceKey(), value ? '1' : '0');
      } catch {
        /* Do not fail the current search when local persistence is blocked. */
      }
      if (changed) logPublicResourceOperation(`${value ? '开启' : '关闭'}包含全站公开资源`);
    }
  }
  return { included, caps, loaded, identity, eligible, ensure, setIncluded, restoreIncluded };
});
