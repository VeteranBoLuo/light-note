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
        <span class="public-note-tree__chevron" aria-hidden="true">
          <SvgIcon :src="icon.noteTree.chevron" size="14" />
        </span>
      </BButton>
      <span v-else class="public-note-tree__toggle-placeholder" />
      <BButton class="public-note-tree__label" :title="node.title" @click="emit('open', node.id)">
        <SvgIcon :src="noteIcon" size="15" :style="{ color: noteColor }" aria-hidden="true" />
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
  import type { PublicNoteShareTreeItem } from '@/api/noteShare';
  import { getNoteTreePageColor, getNoteTreePageIcon } from '@/utils/noteTreePresentation';

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
  const noteIcon = computed(() => getNoteTreePageIcon(props.node.type));
  const noteColor = computed(() => getNoteTreePageColor(props.node.type));

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
    position: relative;
    display: flex;
    align-items: center;
    min-height: 36px;
    padding-left: calc(var(--tree-depth) * 13px);
    border: 0;
    border-radius: 8px;

    &.is-active {
      color: var(--primary-color);
      background: var(--primary-btn-h-bg-color);
      box-shadow: inset 3px 0 0 var(--primary-color);
    }
  }

  .public-note-tree__toggle,
  .public-note-tree__toggle-placeholder {
    width: 26px;
    min-width: 26px;
    height: 28px;
    padding: 0;
    border: 0 !important;
    background: transparent !important;
  }

  .public-note-tree__toggle {
    margin-right: 6px;
    border-radius: 7px;
    color: var(--desc-color);
  }

  .public-note-tree__toggle:hover {
    color: var(--primary-color);
    background: var(--primary-btn-h-bg-color) !important;
  }

  .public-note-tree__chevron {
    display: inline-flex;
    transform: rotate(-90deg);
    transition: transform 0.15s ease;
  }

  .public-note-tree__toggle.is-expanded .public-note-tree__chevron {
    transform: rotate(0deg);
  }

  .public-note-tree__label {
    display: flex;
    justify-content: flex-start;
    gap: 7px;
    min-width: 0;
    flex: 1;
    padding: 0 6px;
    border: 0 !important;
    color: var(--text-color);
    background: transparent !important;
  }

  .public-note-tree__row.is-active .public-note-tree__label {
    color: var(--primary-color);
    font-weight: 600;
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
