<template>
  <div class="reference-picker">
    <div class="reference-picker__body">
      <div v-if="itemTitle" class="reference-picker__context"
        ><span>{{ t('toolbox.itemDetail.linkingTo') }}</span
        ><strong>{{ itemTitle }}</strong></div
      >
      <BTabs v-if="kind === 'evidence'" v-model:active-tab="scope" variant="line" :options="scopeOptions" />
      <p v-else class="reference-picker__hint">{{
        t(`toolbox.itemDetail.${kind === 'todo' ? 'pickTodoHint' : 'pickNoteHint'}`)
      }}</p>
      <template v-if="kind === 'todo'">
        <div class="reference-picker__filters">
          <BInput
            v-model:value="search"
            :placeholder="t('toolbox.itemDetail.searchTodo')"
            :aria-label="t('toolbox.itemDetail.searchTodo')"
          />
          <BSelect v-model:value="status" :options="statusOptions" :aria-label="t('toolbox.itemDetail.todoStatus')" />
        </div>
        <p v-if="loading && !todos.length" role="status">{{ t('common.loading') }}</p>
        <p v-else-if="!todos.length && !failure" class="reference-picker__empty">{{
          t('toolbox.itemDetail.noMatchingTodos')
        }}</p>
        <BButton
          v-for="todo in todos"
          :key="todo.id"
          block
          class="reference-picker__row"
          :class="{ 'is-selected': selectedTodo?.id === todo.id }"
          :aria-pressed="selectedTodo?.id === todo.id"
          @click="selectedTodo = todo"
        >
          <SvgIcon :src="icon.todoWorkspace.checkSquare" size="18" />
          <span class="reference-picker__text"
            ><strong>{{ todo.title }}</strong
            ><span class="reference-picker__meta"
              ><BChip :tone="todo.status === 'completed' ? 'success' : 'neutral'">{{
                t(`toolbox.itemDetail.${todo.status === 'completed' ? 'completed' : 'pending'}`)
              }}</BChip
              ><span>{{ todo.list?.name || t('toolbox.itemDetail.defaultTodoList') }}</span
              ><span>{{ todo.dueAt ? todoDate(todo.dueAt) : t('toolbox.itemDetail.noDueDate') }}</span
              ><span v-if="todo.seriesId">{{
                t('toolbox.itemDetail.todoOccurrence', { date: todo.occurrenceDate?.slice(0, 10) || '—' })
              }}</span></span
            ></span
          >
          <SvgIcon v-if="selectedTodo?.id === todo.id" :src="icon.organize.check" size="18" />
        </BButton>
        <div v-if="failure" role="alert" class="reference-picker__empty"
          >{{ t('toolbox.itemDetail.pickerFailed') }}
          <BButton :disabled="loading" @click="loadTodos(!todos.length)">{{
            t('toolbox.itemDetail.retryPicker')
          }}</BButton></div
        >
        <div v-else-if="cursor" ref="loadMoreTarget" role="status">
          <span v-if="loading">{{ t('common.loading') }}</span>
        </div>
      </template>
      <KeepAlive
        ><ResourcePickerPanel
          v-if="kind === 'note' || fromLibrary"
          :allowed-types="kind === 'note' ? ['note'] : ['note', 'bookmark', 'file']"
          :disabled="busy"
          :exhaustive="fromLibrary"
          :exhaustive-single-type="kind === 'note'"
          :placeholder="t(`toolbox.itemDetail.${kind === 'note' ? 'searchNote' : 'librarySearch'}`)"
          page-scroll
          :selected-resource-keys="libraryKeys"
          @select="selectResource"
          @close="emit('dismiss')"
          ><template #resource-icon="{ item: resource }"
            ><SvgIcon
              :src="icon.resource[resource.type as 'note' | 'bookmark' | 'file']"
              :color="`var(${RESOURCE_COLOR_CSS_VAR[resource.type as 'note' | 'bookmark' | 'file']})`"
              size="20" /></template></ResourcePickerPanel
      ></KeepAlive>
      <template v-if="kind === 'evidence' && !fromLibrary">
        <BInput v-model:value="search" :placeholder="t('toolbox.itemDetail.searchEvidence')" />
        <p v-if="!evidenceOptions.length && search.trim()" class="reference-picker__empty">{{
          t('toolbox.itemDetail.noEvidenceMatch')
        }}</p>
        <div v-else-if="!evidenceOptions.length" class="reference-picker__empty-project">
          <span class="reference-picker__empty-icon"><SvgIcon :src="icon.organize.file" size="28" /></span>
          <h3>{{ t(`toolbox.itemDetail.${resources.length ? 'allEvidenceLinked' : 'emptyProjectTitle'}`) }}</h3>
          <p>{{ t('toolbox.itemDetail.emptyProjectHint') }}</p>
          <BButton type="primary" :disabled="busy" @click="fromLibrary = true">{{
            t('toolbox.itemDetail.addFromLibrary')
          }}</BButton>
          <small>{{ t('toolbox.itemDetail.resourceTypesHint') }}</small>
        </div>
        <div class="reference-picker__results"
          ><BButton
            v-for="resource in evidenceOptions"
            :key="`${resource.type}:${resource.resourceId}`"
            block
            class="reference-picker__row"
            :class="{ 'is-selected': selectedEvidence?.id === resource.id }"
            :aria-pressed="selectedEvidence?.id === resource.id"
            :disabled="resource.available === false"
            @click="selectedEvidence = resource"
            ><SvgIcon
              :src="icon.resource[resource.type]"
              :color="`var(${RESOURCE_COLOR_CSS_VAR[resource.type]})`"
              size="20" /><span class="reference-picker__text"
              ><strong>{{ resource.title }}</strong
              ><span class="reference-picker__meta"
                >{{ t(`ai.sourceTypes.${resource.type}`)
                }}<span v-if="resource.available === false"> · {{ t('toolbox.itemDetail.unavailable') }}</span></span
              ></span
            ><SvgIcon v-if="selectedEvidence?.id === resource.id" :src="icon.organize.check" size="18" /></BButton
        ></div>
      </template>
      <p v-if="fromLibrary" class="reference-picker__hint">{{ t('toolbox.itemDetail.addResourceHint') }}</p>
      <p v-if="error" role="alert">{{ error }}</p>
    </div>
    <footer
      ><span class="reference-picker__selection"
        ><strong v-if="selectedTitle">{{ t('toolbox.itemDetail.selectedOne') }}</strong
        ><span>{{ selectedTitle || t('toolbox.itemDetail.selectOne') }}</span></span
      ><BButton type="primary" :disabled="!selectedTitle || busy" :loading="busy" @click="confirm">{{
        t(`toolbox.itemDetail.${fromLibrary ? 'addAndLink' : 'confirmLink'}`)
      }}</BButton></footer
    >
  </div>
</template>
<script setup lang="ts">
  import { computed, ref, watch, onBeforeUnmount } from 'vue';
  import { useI18n } from 'vue-i18n';
  import dayjs from 'dayjs';
  import { getTodoWorkspace, type TodoItem } from '@/api/todoApi';
  import type { ToolboxWorkspaceResource, ToolboxItemEvidence } from '@/api/toolbox';
  import type { ResourcePickerItem } from '@/composables/useResourcePickerSearch';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import ResourcePickerPanel from '@/components/resourcePicker/ResourcePickerPanel.vue';
  import icon from '@/config/icon';
  import { RESOURCE_COLOR_CSS_VAR } from '@/config/resourceColor';
  const props = defineProps<{
    kind: 'todo' | 'note' | 'evidence';
    itemTitle?: string;
    busy?: boolean;
    error?: string;
    resources: ToolboxWorkspaceResource[];
    evidence: ToolboxItemEvidence[];
  }>();
  const emit = defineEmits<{
    back: [];
    dismiss: [];
    resource: [resource: ResourcePickerItem];
    todo: [todo: TodoItem];
    note: [note: ResourcePickerItem];
    evidence: [resource: ToolboxWorkspaceResource];
  }>();
  const { t } = useI18n();
  const fromLibrary = ref(false);
  const scope = computed({
    get: () => (fromLibrary.value ? 'library' : 'project'),
    set: (value: string) => {
      if (!props.busy) fromLibrary.value = value === 'library';
    },
  });
  const scopeOptions = computed(() => [
    { key: 'project', label: t('toolbox.itemDetail.projectScope'), badge: props.resources.length },
    { key: 'library', label: t('toolbox.itemDetail.libraryScope') },
  ]);
  const selectedResource = ref<ResourcePickerItem>();
  const libraryKeys = computed(() => {
    const selected = props.kind === 'note' ? selectedNote.value : selectedResource.value;
    return [
      ...(fromLibrary.value ? props.evidence.map((ref) => `${ref.type}:${ref.resourceId}`) : []),
      ...(selected ? [`${selected.type}:${selected.id}`] : []),
    ];
  });
  function selectResource(resource: ResourcePickerItem) {
    if (props.busy) return;
    if (props.kind === 'note') selectedNote.value = resource;
    else selectedResource.value = resource;
  }
  const search = ref(''),
    status = ref<'pending' | 'completed' | 'all'>('pending');
  const todos = ref<TodoItem[]>([]),
    cursor = ref<string | null>(null),
    loading = ref(false),
    failure = ref(false);
  const selectedTodo = ref<TodoItem>(),
    selectedNote = ref<ResourcePickerItem>(),
    selectedEvidence = ref<ToolboxWorkspaceResource>();
  const selectedTitle = computed(
    () =>
      (props.kind === 'todo'
        ? selectedTodo.value
        : props.kind === 'note'
          ? selectedNote.value
          : fromLibrary.value
            ? selectedResource.value
            : selectedEvidence.value
      )?.title,
  );
  const statusOptions = computed(() =>
    ['pending', 'completed', 'all'].map((value) => ({
      value,
      label: t(`toolbox.itemDetail.${value === 'all' ? 'allTodos' : value}`),
    })),
  );
  const evidenceOptions = computed(() =>
    props.resources.filter(
      (resource) =>
        !props.evidence.some((ref) => ref.type === resource.type && ref.resourceId === resource.resourceId) &&
        resource.title.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase()),
    ),
  );
  const todoDate = (value: string) => (dayjs(value).isValid() ? dayjs(value).format('YYYY-MM-DD') : value.slice(0, 10));
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const loadMoreTarget = ref<HTMLElement>();
  let observer: IntersectionObserver | undefined;
  watch(
    [loadMoreTarget, loading, cursor, failure],
    () => {
      observer?.disconnect();
      if (!loadMoreTarget.value || loading.value || !cursor.value || failure.value) return;
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting) && !loading.value && !failure.value && cursor.value)
            void loadTodos(false);
        },
        { root: loadMoreTarget.value.closest('.b-drawer-body'), rootMargin: '120px' },
      );
      observer.observe(loadMoreTarget.value);
    },
    { flush: 'post' },
  );
  async function loadTodos(reset = true) {
    if (!reset && (loading.value || !cursor.value)) return;
    const request = ++generation;
    loading.value = true;
    failure.value = false;
    if (reset) {
      todos.value = [];
      cursor.value = null;
    }
    try {
      // Instance presentation: bind a concrete task, never a recurring plan representative.
      const response = await getTodoWorkspace({
        status: status.value,
        keyword: search.value.trim(),
        sort: 'due',
        limit: 40,
        cursor: reset ? null : cursor.value,
      });
      if (request !== generation) return;
      if (response.status !== 200 || !Array.isArray(response.data?.items)) throw Error('unavailable');
      todos.value = [
        ...new Map([...todos.value, ...(response.data.items as TodoItem[])].map((item) => [item.id, item])).values(),
      ];
      cursor.value = response.data.nextCursor || null;
    } catch {
      if (request === generation) failure.value = true;
    } finally {
      if (request === generation) loading.value = false;
    }
  }
  watch([search, status], () => {
    if (props.kind !== 'todo') return;
    ++generation;
    clearTimeout(timer);
    todos.value = [];
    cursor.value = null;
    loading.value = true;
    failure.value = false;
    timer = setTimeout(() => void loadTodos(), 250);
  });
  if (props.kind === 'todo') void loadTodos();
  onBeforeUnmount(() => {
    observer?.disconnect();
    ++generation;
    clearTimeout(timer);
  });
  function confirm() {
    if (props.busy) return;
    if (fromLibrary.value && selectedResource.value) {
      emit('resource', selectedResource.value);
      return;
    }
    if (props.kind === 'todo' && selectedTodo.value) emit('todo', selectedTodo.value);
    if (props.kind === 'note' && selectedNote.value) emit('note', selectedNote.value);
    if (props.kind === 'evidence' && selectedEvidence.value) emit('evidence', selectedEvidence.value);
  }
</script>
<style scoped lang="less">
  @import (reference) '@/assets/css/workspace-surfaces.less';
  .reference-picker {
    .workspace-content-surface();
    min-height: 100%;
    display: flex;
    flex-direction: column;
    color: var(--text-color);
  }
  .reference-picker :deep(.resource-picker-panel__item.is-selected.disabled) {
    opacity: 1;
  }

  .reference-picker__body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-20, 20px);
    padding: var(--ui-space-24, 24px);
    min-width: 0;
  }
  .reference-picker__hint,
  .reference-picker__empty {
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
    line-height: 1.7;
    margin: 0;
  }
  .reference-picker__empty {
    padding: var(--ui-space-20, 20px) 0;
  }
  .reference-picker__filters {
    display: flex;
    gap: var(--ui-space-8, 8px);
  }
  .reference-picker__filters > :first-child {
    flex: 1;
    min-width: 0;
  }
  .reference-picker__filters > :last-child {
    width: var(--ui-layout-120, 120px);
    flex-shrink: 0;
  }
  .reference-picker__row.b_btn {
    height: auto;
    min-height: var(--ui-layout-72, 72px);
    white-space: normal;
    text-align: left;
    justify-content: flex-start;
    gap: var(--ui-space-12, 12px);
    padding: var(--ui-space-12, 12px);
    border: 1px solid transparent;
    background: var(--workspace-content);
  }
  .reference-picker__row:hover {
    background: var(--workspace-hover);
  }
  .reference-picker__row.is-selected {
    border-color: var(--workspace-purple-text);
    background: var(--workspace-purple-selected);
    color: var(--text-color);
  }
  .reference-picker__row :deep(.svg-icon) {
    flex-shrink: 0;
  }
  .reference-picker__text {
    min-width: 0;
    flex: 1;
    display: grid;
    gap: var(--ui-space-8, 8px);
    overflow-wrap: anywhere;
  }
  .reference-picker__text strong {
    font-weight: 500;
    line-height: 1.6;
  }
  .reference-picker__meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-space-8, 8px);
    align-items: center;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .reference-picker footer {
    position: sticky;
    bottom: 0;
    display: flex;
    gap: var(--ui-space-12, 12px);
    align-items: center;
    padding: var(--ui-space-12, 12px) var(--ui-space-20, 20px);
    padding-bottom: max(var(--ui-space-12, 12px), env(safe-area-inset-bottom));
    border-top: 1px solid var(--workspace-border);
    background: var(--workspace-content);
  }
  .reference-picker footer > span {
    min-width: 0;
    flex: 1;
    overflow-wrap: anywhere;
    font-size: var(--ui-font-12, 12px);
    color: var(--desc-color);
  }
  .reference-picker footer > .b_btn {
    flex-shrink: 0;
  }
  .reference-picker__results {
    display: grid;
    gap: var(--ui-space-8, 8px);
  }
  .reference-picker__context {
    display: flex;
    align-items: baseline;
    gap: var(--ui-space-10, 10px);
    font-size: var(--ui-font-12, 12px);
    min-width: 0;
  }
  .reference-picker__context > span {
    color: var(--desc-color);
    flex-shrink: 0;
  }
  .reference-picker__context strong {
    font-weight: 400;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .reference-picker__empty-project {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: var(--ui-space-16, 16px);
    padding: var(--ui-space-48, 48px) var(--ui-space-8, 8px);
  }
  .reference-picker__empty-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--ui-layout-60, 60px);
    height: var(--ui-layout-60, 60px);
    border: 1px solid var(--workspace-border);
    border-radius: 16px;
    background: var(--workspace-canvas);
    color: var(--desc-color);
  }
  .reference-picker__empty-project h3 {
    margin: 0;
    font-size: var(--ui-font-16, 16px);
  }
  .reference-picker__empty-project p {
    margin: 0;
    max-width: var(--ui-layout-300, 300px);
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
    line-height: 1.7;
  }
  .reference-picker__empty-project small {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .reference-picker__selection {
    display: grid;
    gap: var(--ui-space-4, 4px);
  }
  .reference-picker__selection strong {
    color: var(--text-color);
    font-weight: 500;
  }
  .reference-picker__selection > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  @media (max-width: 767px) {
    .reference-picker__body {
      padding: var(--ui-space-20, 20px) var(--ui-space-16, 16px);
    }
  }
</style>
