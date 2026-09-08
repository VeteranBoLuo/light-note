<template>
  <section class="todo-organization-fields">
    <label v-if="showList">
      <span>{{ t('todoWorkspace.list') }}</span>
      <BSelect
        :value="listId || ''"
        :options="listOptions"
        :placeholder="t('todoWorkspace.unassigned')"
        :disabled="disabled || loading"
        @change="emit('update:listId', $event || null)"
      />
    </label>
    <div v-if="showTags" class="todo-organization-fields__tags">
      <span>{{ t('todoWorkspace.tags') }} · {{ t('todoWorkspace.tagLimit') }}</span>
      <BSelect
        :value="tagIds"
        mode="multiple"
        chip-tone="tag"
        :max-tag-count="3"
        :options="tagOptions"
        :placeholder="t('bookmarkEditor.tagPlaceholder')"
        :aria-label="t('todoWorkspace.tags')"
        show-search
        :loading="loading"
        :disabled="disabled || loading || failed || tagDialogOpen"
        @change="changeTags"
      >
        <template #dropdown-footer>
          <BButton class="todo-organization-fields__add-tag" :disabled="disabled || tagIds.length >= 4" @click="tagDialogOpen = true">
            <SvgIcon :src="icon.common.add" size="16" />
            <span>{{ t('navigation.newTag') }}</span>
          </BButton>
        </template>
      </BSelect>
      <TagEditorDialog v-if="tagDialogOpen" v-model:visible="tagDialogOpen" tag-id="add" @saved="tagCreated" />
    </div>
    <p v-if="failed" role="alert"
      >{{ t('todoWorkspace.loadFailed') }} <BButton size="small" @click="load">{{ t('common.retry') }}</BButton></p
    >
  </section>
</template>
<script setup lang="ts">
  import { computed, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import TagEditorDialog from '@/components/manage/tagEditMg/TagEditorDialog.vue';
  import useUserStore from '@/store/useUser';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { getTodoLists, type TodoList } from '@/api/todoApi';
  import { fetchSelectableTags } from '@/api/tagSpace';

  const props = withDefaults(
    defineProps<{
      listId?: string | null;
      tagIds?: string[];
      disabled?: boolean;
      showList?: boolean;
      showTags?: boolean;
    }>(),
    { tagIds: () => [], showList: true, showTags: true },
  );
  const emit = defineEmits<{
    'update:listId': [value: string | null];
    'update:tagIds': [value: string[]];
    'selection-summary': [value: { listName: string; tags: Array<{ id: string; name: string }> }];
  }>();
  const { t } = useI18n();
  const lists = ref<TodoList[]>([]),
    tags = ref<Array<{ id: string; name: string }>>([]);
  watch(
    () => ({
      listName: lists.value.find((list) => list.id === props.listId)?.name || '',
      tags: tags.value.filter((tag) => props.tagIds.includes(tag.id)),
    }),
    (summary) => emit('selection-summary', summary),
    { immediate: true },
  );
  const loading = ref(false),
    failed = ref(false),
    tagDialogOpen = ref(false);
  const user = useUserStore();
  let sequence = 0;
  const listOptions = computed(() => [
    { value: '', label: t('todoWorkspace.unassigned') },
    ...lists.value.map((list) => ({ value: list.id, label: list.name })),
  ]);
  const tagOptions = computed(() => tags.value.map((tag) => ({
    value: tag.id, label: tag.name, disabled: props.tagIds.length >= 4 && !props.tagIds.includes(tag.id),
  })));
  function changeTags(value: string[]) {
    if (!props.disabled && (value.length <= 4 || value.length < props.tagIds.length)) emit('update:tagIds', value);
  }
  async function load() {
    const current = ++sequence;
    loading.value = true;
    failed.value = false;
    try {
      const [response, tagRows] = await Promise.all([getTodoLists(), fetchSelectableTags()]);
      if (current !== sequence) return;
      if (response.status !== 200) throw new Error('load');
      lists.value = response.data.items;
      tags.value = tagRows;
    } catch {
      if (current === sequence) failed.value = true;
    } finally {
      if (current === sequence) loading.value = false;
    }
  }
  async function tagCreated(id: string) {
    const owner = user.id;
    await load();
    if (owner === user.id && !props.disabled && props.tagIds.length < 4) emit('update:tagIds', [...new Set([...props.tagIds, id])]);
  }
  watch(
    () => user.id,
    () => {
      tagDialogOpen.value = false;
      lists.value = [];
      tags.value = [];
      void load();
    },
  );
  onMounted(load);
</script>
<style scoped lang="less">
  .todo-organization-fields {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 16px;
    min-width: 0;
  }
  .todo-organization-fields > label,
  .todo-organization-fields__tags {
    flex: 1 1 260px;
    min-width: 0;
    font-size: 13px;
    font-weight: 500;
  }
  .todo-organization-fields__tags {
    display: grid;
    gap: 8px;
  }
  .todo-organization-fields :deep(.b-select .select-trigger),
  .todo-organization-fields :deep(.b-select.is-multiple .select-trigger) {
    box-sizing: border-box;
    min-height: 42px;
    padding: 6px 32px 6px 11px;
    font-size: 13px;
    font-weight: 400;
    border-radius: 8px;
  }
  .todo-organization-fields label {
    display: grid;
    gap: 8px;
  }
</style>
