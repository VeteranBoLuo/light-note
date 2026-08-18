<template>
  <div class="public-note-tree" :style="{ '--tree-depth': String(depth) }">
    <div class="public-note-tree__row" :class="{ 'is-active': node.id === activeId }">
      <BButton
        v-if="node.hasChildren"
        class="public-note-tree__toggle"
        :class="{ 'is-expanded': expanded }"
        :aria-label="expanded ? t('noteShare.collapseDirectory') : t('noteShare.expandDirectory')"
        :aria-expanded="expanded"
        @click="toggle"
      >
        <SvgIcon :src="icon.noteTree.chevron" size="14" aria-hidden="true" />
      </BButton>
      <span v-else class="public-note-tree__toggle-placeholder" />
      <BButton class="public-note-tree__label" :title="node.title" @click="emit('open', node.id)">
        <SvgIcon :src="noteIcon" size="15" aria-hidden="true" />
        <span>{{ node.title || t('note.untitled') }}</span>
      </BButton>
    </div>
    <div v-if="expanded" class="public-note-tree__children">
      <BLoading v-if="loading" inline loading :title="t('common.loading')" />
      <PublicNoteTree
        v-for="child in children"
        v-else
        :key="child.id"
        :node="child"
        :active-id="activeId"
        :depth="depth + 1"
        :get-children="getChildren"
        @open="emit('open', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import type { PublicNoteShareTreeItem } from '@/api/noteShare';

  const props = withDefaults(
    defineProps<{
      node: PublicNoteShareTreeItem;
      activeId: string;
      depth?: number;
      getChildren: (id: string) => Promise<PublicNoteShareTreeItem[]>;
      defaultExpanded?: boolean;
    }>(),
    { depth: 0, defaultExpanded: false },
  );
  const emit = defineEmits<{ open: [id: string] }>();
  const { t } = useI18n();
  const expanded = ref(props.defaultExpanded);
  const loading = ref(false);
  const loaded = ref(false);
  const children = ref<PublicNoteShareTreeItem[]>([]);
  const noteIcon = computed(() => {
    if (props.node.type === 'drawing') return icon.resource.noteDrawing;
    if (props.node.type === 'markdown') return icon.resource.noteMarkdown;
    return icon.resource.noteHtml;
  });

  async function loadChildren() {
    if (loaded.value) return;
    loading.value = true;
    try {
      children.value = await props.getChildren(props.node.id);
      loaded.value = true;
    } catch {
      children.value = [];
    } finally {
      loading.value = false;
    }
  }

  async function toggle() {
    expanded.value = !expanded.value;
    if (expanded.value) await loadChildren();
  }

  onMounted(() => {
    if (expanded.value) void loadChildren();
  });
</script>

<style scoped lang="less">
  .public-note-tree__row {
    display: flex;
    align-items: center;
    min-height: 36px;
    padding-left: calc(var(--tree-depth) * 13px);
    border: 1px solid transparent;
    border-radius: 8px;

    &.is-active {
      border-color: var(--primary-color);
      background: var(--selected-bg-color);
    }
  }

  .public-note-tree__toggle,
  .public-note-tree__toggle-placeholder {
    width: 26px;
    min-width: 26px;
    height: 28px;
    padding: 0;
  }

  .public-note-tree__toggle :deep(.svg-icon) {
    transform: rotate(-90deg);
    transition: transform 0.15s ease;
  }

  .public-note-tree__toggle.is-expanded :deep(.svg-icon) {
    transform: rotate(0deg);
  }

  .public-note-tree__label {
    display: flex;
    justify-content: flex-start;
    gap: 7px;
    min-width: 0;
    flex: 1;
    padding: 0 6px;
    color: var(--text-color);
  }

  .public-note-tree__label span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .public-note-tree__children {
    min-height: 0;
  }
</style>
