<template>
  <BDrawer
    :open="open"
    placement="bottom"
    height="min(82dvh, 720px)"
    body-padding="0"
    :title="t('note.navigationTitle')"
    :close-label="t('common.close')"
    @close="emit('update:open', false)"
  >
    <BTabs v-model:active-tab="activeTab" class="note-mobile-navigation-drawer__tabs" variant="segment" :options="tabs" />
    <NoteMobilePageLevelList
      v-if="activeTab === 'pages'"
      :open="open"
      mode="navigation"
      :current-page-id="currentPageId"
      :initial-parent-id="initialParentId"
      :write-enabled="writeEnabled"
      @open-page="openPage"
      @create="forwardPageAction('create', $event)"
      @attach="forwardPageAction('attach', $event)"
      @toggle-top="forwardPageAction('toggleTop', $event)"
      @move="forwardPageAction('move', $event)"
      @rename="forwardPageAction('rename', $event)"
      @copy-link="forwardPageAction('copyLink', $event)"
      @delete="forwardPageAction('delete', $event)"
    />
    <Catalog
      v-else
      class="note-mobile-navigation-drawer__outline"
      variant="embedded"
      :content="content"
      :note-type="noteType"
      @markdown-heading-click="emit('markdownHeadingClick', $event)"
    />
  </BDrawer>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import Catalog from '@/components/noteLibrary/detail/Catalog.vue';
  import NoteMobilePageLevelList from './NoteMobilePageLevelList.vue';
  import type { NoteTreeItem } from '@/types/noteTree';

  const props = withDefaults(
    defineProps<{
      open: boolean;
      currentPageId?: string | null;
      initialParentId?: string | null;
      content?: string;
      noteType?: string;
      initialTab?: 'pages' | 'outline';
      writeEnabled?: boolean;
    }>(),
    {
      currentPageId: null,
      initialParentId: null,
      content: '',
      noteType: 'html',
      initialTab: 'pages',
      writeEnabled: false,
    },
  );

  const emit = defineEmits<{
    'update:open': [value: boolean];
    openPage: [id: string];
    markdownHeadingClick: [index: number];
    create: [node: NoteTreeItem];
    attach: [node: NoteTreeItem];
    toggleTop: [node: NoteTreeItem];
    move: [node: NoteTreeItem];
    rename: [node: NoteTreeItem];
    copyLink: [node: NoteTreeItem];
    delete: [node: NoteTreeItem];
  }>();
  const { t } = useI18n();
  const activeTab = ref<'pages' | 'outline'>(props.initialTab);
  const tabs = computed(() => [
    { key: 'pages', label: t('note.pagesTab') },
    { key: 'outline', label: t('note.outlineTab') },
  ]);

  function openPage(id: string) {
    emit('update:open', false);
    emit('openPage', id);
  }

  function forwardPageAction(
    action: 'create' | 'attach' | 'toggleTop' | 'move' | 'rename' | 'copyLink' | 'delete',
    node: NoteTreeItem,
  ) {
    emit('update:open', false);
    emit(action, node);
  }

  watch(
    () => props.open,
    (open) => {
      if (open) activeTab.value = props.initialTab;
    },
  );
</script>

<style scoped lang="less">
  .note-mobile-navigation-drawer__tabs {
    margin: 0 16px 10px;
  }

  .note-mobile-navigation-drawer__tabs :deep(.tab-container) {
    width: 100%;
  }

  .note-mobile-navigation-drawer__tabs :deep(.tab) {
    flex: 1;
    justify-content: center;
  }

  .note-mobile-navigation-drawer__outline {
    height: calc(100% - 56px);
    padding: 0 16px 16px;
    box-sizing: border-box;
  }
</style>
