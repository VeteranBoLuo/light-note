<template>
  <section class="ai-workspace-shell" :class="`is-${activeMode}`">
    <div class="ai-workspace-shell__surface">
      <ChatContainer
        ref="chatRef"
        @source-navigate="emit('source-navigate')"
        @open-memory-ledger="emit('open-memory-ledger')"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
  import { nextTick, ref } from 'vue';
  import ChatContainer from '@/view/aiAssistant/ChatContainer.vue';
  import type { AiAssistantLaunchPayload } from '@/utils/aiEntry';

  // 工作台只有「问答」一种界面,不需要模式切换 UI;组件退化为 ChatContainer 的薄壳,
  // 仅保留 activeMode/switchMode 供全屏偏好(mode-change)与 change-set 打开等既有对接使用。
  export type AiWorkspaceMode = 'ask' | 'organize';

  const emit = defineEmits<{
    'source-navigate': [];
    'mode-change': [mode: AiWorkspaceMode];
    'open-memory-ledger': [];
  }>();
  const activeMode = ref<AiWorkspaceMode>('ask');
  const changeSetId = ref('');
  const organizeInstruction = ref('');
  const chatRef = ref<{
    clearHistory?: () => Promise<boolean>;
    focusInput?: () => void;
    applyLaunchContext?: (payload: AiAssistantLaunchPayload) => void;
    openConversation?: (conversationId: string) => Promise<void>;
  } | null>(null);

  function switchMode(mode: AiWorkspaceMode) {
    activeMode.value = mode;
    emit('mode-change', mode);
    if (mode === 'ask') nextTick(() => chatRef.value?.focusInput?.());
  }

  async function clearHistory() {
    switchMode('ask');
    await nextTick();
    return (await chatRef.value?.clearHistory?.()) ?? true;
  }

  function focusInput() {
    if (activeMode.value !== 'ask') return;
    chatRef.value?.focusInput?.();
  }

  async function applyLaunchContext(payload: AiAssistantLaunchPayload) {
    if (payload.suggestedIntent === 'organize') {
      organizeInstruction.value = payload.query || '';
      switchMode('organize');
    } else {
      switchMode('ask');
    }
    await nextTick();
    chatRef.value?.applyLaunchContext?.(payload);
  }

  async function openConversation(cloudConversationId: string) {
    switchMode('ask');
    await nextTick();
    await chatRef.value?.openConversation?.(cloudConversationId);
  }

  function openWorkItem(kind: 'change-set', id: string) {
    changeSetId.value = id;
    switchMode('organize');
  }

  defineExpose({ applyLaunchContext, clearHistory, focusInput, openConversation, openWorkItem, switchMode });
</script>

<style scoped lang="less">
  .ai-workspace-shell {
    display: flex;
    width: 100%;
    height: 100%;
    min-height: 0;
    flex-direction: column;
    background: var(--background-color);
  }

  .ai-workspace-shell__surface {
    min-width: 0;
    min-height: 0;
    flex: 1;
  }

  .ai-workspace-shell__surface > * {
    width: 100%;
    height: 100%;
  }
</style>
