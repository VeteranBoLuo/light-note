<template>
  <aside
    v-if="hasSubitems && !user.preferences.todoSubitemsExpanded && !dismissed && !user.adminContext"
    class="todo-subitems-hint"
  >
    <p>{{ t('todoWorkspace.subitemsHint') }}</p>
    <BButton
      class="todo-subitems-hint__settings"
      @click="router.push({ path: '/settings', query: { section: 'general' } })"
    >
      {{ t('todoWorkspace.subitemsSettings') }}
    </BButton>
    <BButton class="todo-subitems-hint__close" :aria-label="t('todoWorkspace.dismissSubitemsHint')" @click="dismiss">
      {{ t('common.close') }}
    </BButton>
  </aside>
</template>
<script setup lang="ts">
  import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import useUserStore from '@/store/useUser';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  defineProps<{ hasSubitems: boolean }>();
  const user = useUserStore();
  const router = useRouter();
  const { t } = useI18n();
  const key = computed(() => `light-note:todo-subitems-hint-dismissed:v1:${user.id || 'guest'}`);
  const dismissed = ref(false);
  function readDismissed() {
    try {
      dismissed.value = localStorage.getItem(key.value) === '1';
    } catch {
      dismissed.value = false;
    }
  }
  function dismiss() {
    dismissed.value = true;
    try {
      localStorage.setItem(key.value, '1');
    } catch {
      /* Keep the tip dismissed for this mounted session when storage is unavailable. */
    }
  }
  function syncStorage(event: StorageEvent) {
    if (event.key === key.value || event.key === null) readDismissed();
  }
  watch(key, readDismissed, { immediate: true });
  onMounted(() => window.addEventListener('storage', syncStorage));
  onBeforeUnmount(() => window.removeEventListener('storage', syncStorage));
</script>
<style scoped lang="less">
  @import (reference) '@/assets/css/workspace-surfaces.less';
  .todo-subitems-hint {
    .workspace-canvas-surface();
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 4px 8px;
    padding: 8px 12px;
    margin-bottom: 10px;
    border: 1px solid var(--workspace-border);
    border-radius: 8px;
    font-size: 12px;
  }
  p {
    min-width: 0;
    margin: 0;
    line-height: 1.6;
  }
  .todo-subitems-hint__settings.b_btn,
  .todo-subitems-hint__close.b_btn {
    height: 32px;
    padding: 0 8px;
    background: transparent;
    font-size: 12px;
  }
  .todo-subitems-hint__settings.b_btn {
    color: var(--workspace-purple-text);
  }
  .todo-subitems-hint__close.b_btn {
    color: var(--workspace-muted);
  }
</style>
