import { computed, onScopeDispose, ref, watch, type Ref } from 'vue';
import { fetchToolboxPinnedTools, saveToolboxPinnedTools } from '@/api/toolbox';
import { readToolboxPinnedTools, toggleToolboxPinnedTool } from '@/utils/toolboxPinnedTools';
import { toolboxRecentUseIdentityKey, type ToolboxRecentUseIdentity } from '@/utils/toolboxRecentUse';

export function useToolboxPinnedTools(
  user: ToolboxRecentUseIdentity,
  allowedToolIds: Ref<ReadonlySet<string>>,
  onError: (kind: 'load' | 'save' | 'limit') => void,
) {
  const toolIds = ref<string[]>([]);
  const savingToolId = ref('');
  const loading = ref(false);
  const identity = computed(() => toolboxRecentUseIdentityKey(user));
  const account = computed(
    () =>
      !!user.id && ['user', 'test', 'root'].includes(user.role || '') && !user.adminContext && !user.visitorWorkspace,
  );
  let generation = 0;
  let ready = false;
  async function refresh() {
    // A same-account catalog refresh must not invalidate the pending write or its loading cleanup.
    if (savingToolId.value) return;
    const version = ++generation;
    ready = false;
    if (!account.value) {
      toolIds.value = readToolboxPinnedTools(user, { allowedToolIds: allowedToolIds.value });
      ready = true;
      loading.value = false;
      return;
    }
    loading.value = true;
    // Capture only this account's legacy record before any asynchronous identity change.
    const legacy = readToolboxPinnedTools(user);
    try {
      let result = await fetchToolboxPinnedTools();
      if (version !== generation) return;
      if (!result.initialized) result = await saveToolboxPinnedTools({ action: 'migrate', toolIds: legacy });
      if (version !== generation) return;
      toolIds.value = result.toolIds;
      ready = true;
    } catch {
      if (version === generation) onError('load');
    } finally {
      if (version === generation) loading.value = false;
    }
  }
  async function toggle(toolId: string) {
    if (savingToolId.value || loading.value || !allowedToolIds.value.has(toolId)) return;
    if (!account.value) {
      const result = toggleToolboxPinnedTool(user, toolId, { allowedToolIds: allowedToolIds.value });
      toolIds.value = result.toolIds;
      if (result.limitReached) onError('limit');
      else if (!result.changed) onError('save');
      return;
    }
    if (!ready) {
      await refresh();
      // Retry only the read on this click; a second click operates against the recovered state.
      return;
    }
    const version = generation;
    savingToolId.value = toolId;
    try {
      const result = await saveToolboxPinnedTools({ toolId, pinned: !toolIds.value.includes(toolId) });
      if (version === generation) toolIds.value = result.toolIds;
    } catch (error) {
      const failure = error as { code?: string; response?: { data?: { data?: { code?: string } } } };
      const code = failure?.response?.data?.data?.code || failure?.code;
      if (version === generation) onError(code === 'TOOLBOX_PIN_LIMIT' ? 'limit' : 'save');
    } finally {
      if (version === generation) savingToolId.value = '';
    }
  }
  watch(
    identity,
    () => {
      ++generation;
      toolIds.value = [];
      savingToolId.value = '';
      loading.value = false;
      ready = false;
    },
    { flush: 'sync' },
  );
  onScopeDispose(() => {
    ++generation;
  });
  return { toolIds, savingToolId, loading, refresh, toggle };
}
