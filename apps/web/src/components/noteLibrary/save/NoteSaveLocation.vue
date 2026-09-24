<template>
  <BPopover v-model:open="open" class="note-location" :disabled="disabled">
    <BButton
      ref="triggerButton"
      class="note-location-trigger"
      :disabled="disabled"
      :aria-expanded="open"
      :aria-label="t('saveAsNote.location')"
      :title="selectedPath"
    >
      <span>{{ selectedPath }}</span
      ><SvgIcon :src="icon.noteTree.chevron" size="16" />
    </BButton>
    <template #content>
      <div class="note-location-panel" role="group" :aria-label="t('saveAsNote.location')">
        <BInput
          v-model:value="search"
          :placeholder="t('saveAsNote.searchLocation')"
          :aria-label="t('saveAsNote.searchLocation')"
        />
        <BButton class="note-location-choice" :class="{ selected: !value }" :aria-pressed="!value" @click="select('')">
          {{ t('saveAsNote.root') }}
        </BButton>
        <BLoading v-if="loading" inline loading :title="t('common.loading')" />
        <div v-else-if="error" class="note-location-error" role="alert">
          <span>{{ t('note.treeLoadFailed') }}</span
          ><BButton @click="loadTree">{{ t('common.retry') }}</BButton>
        </div>
        <template v-else>
          <div
            v-for="item in visibleItems"
            :key="item.id"
            class="note-location-row"
            :style="{ paddingLeft: `${(item.depth - 1) * dimension(16)}px` }"
          >
            <BButton
              v-if="item.children?.length"
              class="note-location-expand"
              type="text"
              :aria-expanded="expanded.has(item.id)"
              :aria-label="`${t(expanded.has(item.id) ? 'common.collapse' : 'common.expand')} ${item.title || t('note.untitled')}`"
              @click="toggle(item.id)"
            >
              <SvgIcon :src="icon.noteTree.chevron" size="16" :class="{ collapsed: !expanded.has(item.id) }" />
            </BButton>
            <span v-else class="note-location-spacer" />
            <BButton
              class="note-location-choice"
              :class="{ selected: value === item.id }"
              :aria-pressed="value === item.id"
              :disabled="item.invalidParent || item.depth >= maxDepth"
              :title="item.depth >= maxDepth ? t('ai.noteTargetDirectory.depthLimit') : item.title"
              @click="select(item.id)"
            >
              <span>{{ item.title || t('note.untitled') }}</span>
            </BButton>
          </div>
        </template>
      </div>
    </template>
  </BPopover>
</template>
<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useUserStore } from '@/store';
  import { apiBasePost } from '@/http/request';
  import { buildNoteDetailRequestScope } from '@/api/noteDetailPrefetch';
  import { flattenNoteTree } from '@/utils/noteTree';
  import type { NoteTreeItem, NoteTreeQueryResult } from '@/types/noteTree';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { useUiDensity } from '@/composables/useUiDensity';
  const { dimension } = useUiDensity();
  const triggerButton = ref<{ $el: HTMLButtonElement } | null>(null);
  const props = defineProps<{ disabled?: boolean }>();
  const value = defineModel<string>('value', { default: '' });
  const { t } = useI18n();
  const user = useUserStore();
  const search = ref('');
  const open = ref(false),
    loading = ref(false),
    loaded = ref(false),
    error = ref(false);
  const items = ref<NoteTreeItem[]>([]),
    maxDepth = ref(0),
    expanded = ref(new Set<string>());
  let sequence = 0;
  const flat = computed(() => flattenNoteTree(items.value));
  const byId = computed(() => new Map(flat.value.map((item) => [item.id, item])));
  const visibleItems = computed(() =>
    flat.value.filter((item) => {
      if (search.value.trim())
        return String(item.title || '')
          .toLowerCase()
          .includes(search.value.trim().toLowerCase());
      let parent = byId.value.get(item.parentId || '');
      const seen = new Set<string>([item.id]);
      while (parent && !seen.has(parent.id)) {
        if (!expanded.value.has(parent.id)) return false;
        seen.add(parent.id);
        parent = byId.value.get(parent.parentId || '');
      }
      return true;
    }),
  );
  const selectedPath = computed(() => {
    const path: string[] = [],
      seen = new Set<string>();
    let item = byId.value.get(value.value);
    while (item && !seen.has(item.id)) {
      path.unshift(item.title || t('note.untitled'));
      seen.add(item.id);
      item = byId.value.get(item.parentId || '');
    }
    return path.join(' / ') || t('saveAsNote.root');
  });
  function toggle(id: string) {
    const next = new Set(expanded.value);
    next.has(id) ? next.delete(id) : next.add(id);
    expanded.value = next;
  }
  function select(id: string) {
    if (props.disabled) return;
    const item = byId.value.get(id);
    if (id && (!item || item.invalidParent || item.depth >= maxDepth.value)) return;
    value.value = id;
    open.value = false;
    void nextTick(() => triggerButton.value?.$el.focus());
  }
  async function loadTree() {
    const seq = ++sequence;
    loading.value = true;
    error.value = false;
    try {
      const response = await apiBasePost('/api/note/queryNoteTree', { parentId: null, depth: 'all' }, { silent: true });
      if (seq !== sequence) return;
      const data = response.data as NoteTreeQueryResult;
      if (
        response.status !== 200 ||
        !Array.isArray(data?.items) ||
        !Number.isInteger(data.maxDepth) ||
        data.maxDepth < 1
      )
        throw new Error();
      items.value = data.items;
      maxDepth.value = data.maxDepth;
      loaded.value = true;
    } catch {
      if (seq === sequence) error.value = true;
    } finally {
      if (seq === sequence) loading.value = false;
    }
  }
  watch(open, (next) => {
    if (next && !loaded.value && !loading.value) void loadTree();
  });
  watch(
    () => props.disabled,
    (disabled) => {
      if (disabled) open.value = false;
    },
  );
  watch(
    () => buildNoteDetailRequestScope(user),
    () => {
      sequence++;
      open.value = loaded.value = loading.value = error.value = false;
      items.value = [];
      expanded.value = new Set();
      value.value = '';
    },
  );
  onBeforeUnmount(() => {
    sequence++;
  });
</script>
<style scoped>
  .note-location {
    display: flex;
    width: 100%;
    min-width: 0;
  }
  .note-location-trigger {
    width: 100%;
    min-width: 0;
    justify-content: space-between;
    border: 1px solid var(--card-border-color);
    background: var(--background-color);
    font-weight: 400;
  }
  .note-location-trigger > span,
  .note-location-choice > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .note-location-panel {
    width: min(var(--ui-layout-520, 520px), calc(100vw - var(--ui-layout-48, 48px)));
    max-height: min(var(--ui-layout-320, 320px), 50vh);
    overflow-y: auto;
    padding: var(--ui-space-8, 8px);
    box-sizing: border-box;
  }
  .note-location-row {
    display: flex;
    align-items: center;
    min-width: 0;
  }
  .note-location-choice {
    flex: 1;
    min-width: 0;
    width: 100%;
    justify-content: flex-start;
    text-align: left;
    background: transparent;
    border: 1px solid transparent;
    font-weight: 400;
  }
  .note-location-choice.selected {
    color: var(--text-color);
    font-weight: 500;
    border-color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 12%, transparent);
  }
  .note-location-expand,
  .note-location-spacer {
    flex: 0 0 var(--ui-layout-32, 32px);
    width: var(--ui-layout-32, 32px);
    padding: 0;
  }
  .collapsed {
    transform: rotate(-90deg);
  }
  .note-location-error {
    display: grid;
    gap: var(--ui-space-8, 8px);
    padding: var(--ui-space-8, 8px);
    color: var(--desc-color);
  }
  @media (max-width: 768px) {
    .note-location-choice,
    .note-location-expand {
      /* ui-density-fixed: Mobile touch target remains 44px at every desktop density. */
      min-height: 44px;
    }
    .note-location-expand,
    .note-location-spacer {
      /* ui-density-fixed: Mobile touch target remains 44px at every desktop density. */
      flex-basis: 44px;
      /* ui-density-fixed: Mobile touch target remains 44px at every desktop density. */
      width: 44px;
    }
  }
</style>
