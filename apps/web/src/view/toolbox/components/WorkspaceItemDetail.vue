<template>
  <BDrawer
    :key="drawerKey"
    :open="visible"
    :title="
      picker
        ? t(`toolbox.itemDetail.${picker === 'todo' ? 'linkTodo' : picker === 'note' ? 'linkNote' : 'addEvidence'}`)
        : creation?.title || t('toolbox.project.itemDetails')
    "
    width="var(--ui-layout-580, 580px)"
    modal
    keyboard
    mask-closable
    mobile-full-screen
    :close-disabled="locked"
    body-padding="0"
    @close="requestClose"
    @after-close="finishClose"
  >
    <template v-if="picker" #header-leading
      ><BButton
        class="item-detail__back"
        type="text"
        icon-only
        :disabled="locked"
        :aria-label="t('toolbox.itemDetail.backToItem')"
        @click="picker = null"
        ><SvgIcon :src="icon.arrow_left" size="20" /></BButton
    ></template>
    <WorkspaceReferencePicker
      v-if="picker"
      ref="referencePicker"
      :key="picker"
      :kind="picker"
      :item-title="form.title"
      :resources="workspace.resources"
      :evidence="form.evidence"
      :busy="savingResource"
      :error="localError"
      @back="picker = null"
      @evidence="addEvidence"
      @note="selectReference"
      @todo="selectTodo"
      @resource="addProjectResource"
      @dismiss="requestClose"
    />
    <div v-else ref="formRoot" class="item-detail">
      <div class="item-detail__body">
        <p v-if="creation?.hint" class="item-detail__hint">{{ creation.hint }}</p>
        <div class="item-detail__type"
          ><BChip tone="neutral">{{ laneLabel }}</BChip
          ><BChip v-if="item.todoId" :tone="item.linkedTodo?.status === 'completed' ? 'success' : 'neutral'">{{
            todoState
          }}</BChip></div
        >
        <label
          ><span>{{ t('toolbox.workspace.itemTitleLabel') }}</span
          ><BInput v-model:value="form.title" :maxlength="255" :disabled="readonly || locked"
        /></label>
        <label
          ><span>{{ t('toolbox.itemDetail.summary') }}</span
          ><BInput
            v-model:value="form.content"
            type="textarea"
            :rows="4"
            :maxlength="5000"
            :disabled="readonly || locked"
        /></label>
        <label v-if="item.lane === 'knowledge'"
          ><span>{{ t('toolbox.itemDetail.judgement') }}</span
          ><BSelect v-model:value="form.conclusionStatus" :options="judgements" :disabled="readonly || locked"
        /></label>
        <p v-if="item.lane === 'knowledge'" class="item-detail__hint">{{ t('toolbox.itemDetail.judgementHint') }}</p>
        <label v-if="item.lane !== 'action' && !item.todoId"
          ><span>{{ t('toolbox.workspace.itemDueLabel') }}</span
          ><BDateTimePicker v-model:value="form.dueOn" :show-time="false" :disabled="readonly || locked"
        /></label>
        <WorkspaceItemSource
          v-if="creationSource || item.sourceItemId || item.sourceTitle"
          :source="creationSource || sourceItem"
          :title="item.sourceTitle"
          :kind="workspace.kind"
          :preview="!!creationSource"
          :disabled="locked"
          @open="openSourceItem"
        />

        <section>
          <header
            ><h3
              >{{ t('toolbox.itemDetail.evidence') }} <small>{{ form.evidence.length }}</small></h3
            ><BButton
              v-if="!readonly"
              size="small"
              :disabled="locked || form.evidence.length >= 20"
              data-picker="evidence"
              @click="picker = picker === 'evidence' ? null : 'evidence'"
              >{{ t('toolbox.itemDetail.addEvidence') }}</BButton
            ></header
          >
          <p v-if="!form.evidence.length" class="item-detail__empty">{{ t('toolbox.itemDetail.noEvidence') }}</p>
          <div
            v-for="(ref, index) in form.evidence"
            :key="`${ref.type}:${ref.resourceId}`"
            class="item-detail__reference"
          >
            <div class="item-detail__reference-head"
              ><SvgIcon :src="icon.resource[ref.type]" size="17" /><strong>{{ ref.currentTitle || ref.title }}</strong
              ><BButton
                v-if="!readonly"
                type="text"
                :disabled="locked"
                :aria-label="t('toolbox.itemDetail.removeEvidence', { title: ref.title })"
                @click="form.evidence.splice(index, 1)"
                >{{ t('toolbox.itemDetail.unlink') }}</BButton
              ></div
            >
            <div class="item-detail__reference-state"
              ><span>{{ t(`ai.sourceTypes.${ref.type}`) }}</span
              ><BChip v-if="ref.available === false" tone="danger">{{ t('toolbox.itemDetail.unavailable') }}</BChip
              ><BChip v-else-if="ref.changed && !ref.refresh" tone="pending">{{
                t('toolbox.itemDetail.changed')
              }}</BChip
              ><BChip v-else-if="ref.refresh" tone="neutral">{{ t('toolbox.itemDetail.reviewed') }}</BChip></div
            >
            <BInput
              v-model:value="ref.explanation"
              type="textarea"
              :rows="2"
              :maxlength="1000"
              :placeholder="t('toolbox.itemDetail.explanation')"
              :aria-label="t('toolbox.itemDetail.explanation')"
              :disabled="readonly || locked"
            />
            <div class="item-detail__actions"
              ><BButton
                size="small"
                :disabled="ref.available === false || locked"
                @click="openResource(ref.type, ref.resourceId)"
                >{{ t('toolbox.itemDetail.openSource') }}</BButton
              ><BButton
                v-if="!readonly && ref.changed && ref.available !== false && !ref.refresh && inProject(ref)"
                size="small"
                :disabled="locked"
                @click="ref.refresh = true"
                >{{ t('toolbox.itemDetail.markReviewed') }}</BButton
              ></div
            >
          </div>
        </section>

        <section>
          <header
            ><h3>{{ t('toolbox.itemDetail.note') }}</h3
            ><BButton
              v-if="!readonly && !form.noteId"
              size="small"
              :disabled="locked"
              data-picker="note"
              @click="picker = 'note'"
              >{{ t('toolbox.itemDetail.linkNote') }}</BButton
            ></header
          >
          <p class="item-detail__hint">{{ t('toolbox.itemDetail.noteHint') }}</p>
          <div v-if="form.noteId" class="item-detail__reference">
            <div class="item-detail__reference-head"
              ><SvgIcon :src="icon.resource.note" size="17" /><strong>{{ noteTitle }}</strong></div
            >
            <BChip v-if="noteUnavailable" tone="danger">{{ t('toolbox.itemDetail.unavailable') }}</BChip>
            <BChip
              v-else-if="item.details?.conclusionNote?.changed && form.noteId === item.details.conclusionNote.id"
              tone="neutral"
              >{{ t('toolbox.itemDetail.noteChanged') }}</BChip
            >
            <div class="item-detail__actions"
              ><BButton size="small" :disabled="noteUnavailable || locked" @click="openResource('note', form.noteId)">{{
                t('toolbox.itemDetail.openNote')
              }}</BButton
              ><BButton v-if="!readonly" size="small" :disabled="locked" @click="form.noteId = null">{{
                t('toolbox.itemDetail.unlink')
              }}</BButton></div
            >
          </div>
          <div v-if="!readonly && !form.noteId" class="item-detail__actions"
            ><BButton
              size="small"
              type="text"
              :loading="savingNote"
              :disabled="locked || !form.title.trim() || !form.content.trim()"
              @click="saveNote"
              >{{ t('toolbox.itemDetail.saveNote') }}</BButton
            ></div
          >
        </section>

        <section v-if="item.lane === 'action'">
          <header
            ><h3>{{ t('toolbox.itemDetail.todo') }}</h3
            ><BButton
              v-if="!readonly && !form.todoId"
              size="small"
              :disabled="locked"
              data-picker="todo"
              @click="picker = 'todo'"
              >{{ t('toolbox.itemDetail.linkTodo') }}</BButton
            ></header
          >
          <p class="item-detail__hint">{{ t('toolbox.itemDetail.todoHint') }}</p>
          <div v-if="form.todoId" class="item-detail__reference">
            <div class="item-detail__reference-head"
              ><SvgIcon :src="icon.todoWorkspace.checkSquare" size="17" /><strong>{{ todoTitle }}</strong></div
            >
            <div v-if="activeTodo" class="item-detail__reference-state"
              ><BChip
                :tone="
                  activeTodo?.available === false
                    ? 'danger'
                    : activeTodo?.status === 'completed'
                      ? 'success'
                      : 'neutral'
                "
                >{{ todoState }}</BChip
              ><span v-if="activeTodo?.dueOn"
                >{{ t('toolbox.workspace.itemDueLabel') }} · {{ activeTodo.dueOn }}</span
              ></div
            >
            <div class="item-detail__actions"
              ><BButton
                size="small"
                :disabled="locked || (form.todoId === item.todoId && item.linkedTodo?.available === false)"
                @click="openResource('todo', form.todoId)"
                >{{ t('toolbox.itemDetail.openTodo') }}</BButton
              ><BButton v-if="!readonly" size="small" :disabled="locked" @click="form.todoId = null">{{
                t('toolbox.itemDetail.unlink')
              }}</BButton></div
            >
          </div>
          <template v-else
            ><p v-if="form.createLinkedTodo" class="item-detail__empty">{{ t('toolbox.itemDetail.stagedTodo') }}</p
            ><label v-if="!item.todoId"
              ><span>{{ t('toolbox.workspace.itemDueLabel') }}</span
              ><BDateTimePicker v-model:value="form.dueOn" :show-time="false" :disabled="readonly || locked" /></label
            ><div v-if="!readonly" class="item-detail__actions"
              ><BButton type="text" size="small" :disabled="locked || !form.title.trim()" @click="createTodo">{{
                t(form.createLinkedTodo ? 'toolbox.itemDetail.cancelStagedTodo' : 'toolbox.itemDetail.createTodo')
              }}</BButton></div
            ></template
          >

          <p v-if="item.todoId && !form.todoId" class="item-detail__hint">{{
            t('toolbox.itemDetail.unlinkTodoHint')
          }}</p>
        </section>
        <section v-else-if="!creation">
          <header
            ><h3
              >{{ t('toolbox.itemDetail.actions') }} <small>{{ actions.length }}</small></h3
            ><BButton v-if="!readonly" size="small" :disabled="locked" @click="deriveAction">{{
              t('toolbox.itemDetail.addAction')
            }}</BButton></header
          >
          <p v-if="!actions.length" class="item-detail__empty">{{ t('toolbox.itemDetail.noActions') }}</p>
          <BButton
            v-for="action in actions"
            :key="action.id"
            class="item-detail__action-row"
            block
            @click="leave(() => emit('select', action.id))"
            ><span>{{ action.title }}</span
            ><BChip :tone="action.status === 'done' ? 'success' : 'neutral'">{{
              t(
                action.linkedTodo?.available === false
                  ? 'toolbox.itemDetail.unavailable'
                  : action.status === 'done'
                    ? 'toolbox.itemDetail.completed'
                    : 'toolbox.itemDetail.pending',
              )
            }}</BChip></BButton
          >
        </section>
        <p v-if="stale" role="alert" class="item-detail__warning"
          >{{ t('toolbox.itemDetail.stale') }}
          <BButton size="small" :disabled="locked" @click="reloadDraft">{{
            t('toolbox.itemDetail.reload')
          }}</BButton></p
        >
        <p v-if="error || localError" role="alert" class="item-detail__warning">{{ localError || error }}</p>
      </div>
      <footer
        ><span v-if="dirty">{{ t('toolbox.itemDetail.unsaved') }}</span
        ><BButton :disabled="locked" @click="requestClose">{{ t('common.close') }}</BButton
        ><BButton
          v-if="!readonly"
          type="primary"
          :loading="busy"
          :disabled="locked || !form.title.trim() || (!creation && !dirty)"
          @click="save"
          >{{ t(creation ? 'toolbox.itemDetail.createItem' : 'common.save') }}</BButton
        ></footer
      >
    </div>
  </BDrawer>
</template>

<script setup lang="ts">
  import { computed, reactive, ref, watch, onBeforeUnmount, nextTick } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router';
  import type { BoardCommand } from '@lightnote/shared/workspace-board';
  import type {
    ToolboxWorkspace,
    ToolboxWorkspaceItem,
    ToolboxWorkspaceResource,
    ToolboxItemEvidence,
  } from '@/api/toolbox';
  import type { ResourcePickerItem } from '@/composables/useResourcePickerSearch';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BDateTimePicker from '@/components/base/BasicComponents/BDateTimePicker.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import WorkspaceItemSource from './WorkspaceItemSource.vue';
  import WorkspaceReferencePicker from './WorkspaceReferencePicker.vue';
  import type { TodoItem } from '@/api/todoApi';
  import dayjs from 'dayjs';
  import { addToolboxWorkspaceResources } from '@/api/toolbox';
  import icon from '@/config/icon';
  import { openSaveAsNote } from '@/composables/useSaveAsNote';
  import { createNoteFromContent } from '@/utils/aiNoteDraft';
  import { resolveResourceRoute } from '@/utils/resourceNavigation';
  import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory';
  import { buildResourceHref } from '@/utils/noteResourceRefs';
  const props = defineProps<{
    item: ToolboxWorkspaceItem;
    creation?: { key: string; title: string; hint?: string; command: BoardCommand; item?: ToolboxWorkspaceItem };
    workspace: ToolboxWorkspace;
    mobile: boolean;
    readonly?: boolean;
    busy: boolean;
    error?: string;
    commit: (command: BoardCommand, version?: number) => Promise<ToolboxWorkspace | undefined>;
  }>();
  const emit = defineEmits<{
    close: [];
    select: [id: string];
    derive: [];
    source: [];
    updated: [workspace: ToolboxWorkspace];
  }>();
  const { t } = useI18n();
  const router = useRouter(),
    route = useRoute();
  const visible = ref(true),
    drawerKey = ref(0),
    picker = ref<'evidence' | 'note' | 'todo' | null>(null);
  const savingNote = ref(false),
    savingResource = ref(false),
    localError = ref('');
  const closing = ref(false);
  const navigating = ref(false);
  let alive = true;
  onBeforeUnmount(() => {
    alive = false;
  });
  const locked = computed(
    () => props.busy || savingNote.value || savingResource.value || closing.value || navigating.value,
  );
  const draft = (item: ToolboxWorkspaceItem) => ({
    title: item.title,
    content: item.content,
    dueOn: item.dueOn || '',
    evidence: structuredClone(item.details?.evidence || []) as ToolboxItemEvidence[],
    conclusionStatus: item.details?.conclusionStatus || '',
    noteId: item.details?.conclusionNote?.id || (null as string | null),
    todoId: item.todoId || (null as string | null),
    createLinkedTodo: false,
  });
  // Clone through JSON because Vue wraps nested item metadata in reactive proxies.
  const safeDraft = (item: ToolboxWorkspaceItem) => draft(JSON.parse(JSON.stringify(item)));
  const form = reactive(safeDraft(props.item));
  const baseline = ref(JSON.stringify(form)),
    version = ref(props.workspace.boardVersion || 0);
  const dirty = computed(() => JSON.stringify(form) !== baseline.value);
  const stale = computed(() => dirty.value && version.value !== (props.workspace.boardVersion || 0));
  const selectedNoteTitle = ref('');
  const selectedTodo = ref<TodoItem>();
  const activeTodo = computed(() =>
    form.todoId === props.item.todoId
      ? props.item.linkedTodo
      : selectedTodo.value
        ? {
            ...selectedTodo.value,
            available: true,
            dueOn: selectedTodo.value.dueAt
              ? dayjs(selectedTodo.value.dueAt).format('YYYY-MM-DD')
              : selectedTodo.value.occurrenceDate?.slice(0, 10),
          }
        : null,
  );
  const formRoot = ref<HTMLElement>();
  const referencePicker = ref<InstanceType<typeof WorkspaceReferencePicker>>();
  let formScroll = 0;
  watch(picker, async (value, previous) => {
    if (value && !previous) {
      formScroll = formRoot.value?.closest('.b-drawer-body')?.scrollTop || 0;
    }
    await nextTick();
    const body = (formRoot.value || referencePicker.value?.$el)?.closest('.b-drawer-body') as HTMLElement | undefined;
    if (body) body.scrollTop = value ? 0 : formScroll;
    if (value) body?.querySelector<HTMLInputElement>('.reference-picker input')?.focus({ preventScroll: true });
    else
      (
        formRoot.value?.querySelector<HTMLElement>(`[data-picker="${previous}"]`) ||
        formRoot.value?.querySelector<HTMLInputElement>('input')
      )?.focus({ preventScroll: true });
  });
  const sourceItem = computed(() => props.workspace.items.find((source) => source.id === props.item.sourceItemId));
  const creationSource = computed(() =>
    props.creation?.item && props.creation.item.id !== props.item.id ? props.creation.item : undefined,
  );
  const laneLabel = computed(() => t(`toolbox.board.sourceTypes.${props.workspace.kind}.${props.item.lane}`));
  const judgements = computed(() =>
    ['', 'tentative', 'confirmed', 'review'].map((value) => ({
      value,
      label: t(`toolbox.itemDetail.${value || 'unjudged'}`),
    })),
  );
  const todoState = computed(() =>
    t(
      activeTodo.value?.available === false
        ? 'toolbox.itemDetail.unavailable'
        : activeTodo.value?.status === 'completed'
          ? 'toolbox.itemDetail.completed'
          : 'toolbox.itemDetail.pending',
    ),
  );
  const noteTitle = computed(() =>
    form.noteId === props.item.details?.conclusionNote?.id
      ? props.item.details.conclusionNote.currentTitle || props.item.details.conclusionNote.title
      : selectedNoteTitle.value,
  );
  const noteUnavailable = computed(
    () =>
      form.noteId === props.item.details?.conclusionNote?.id && props.item.details?.conclusionNote?.available === false,
  );
  const todoTitle = computed(() =>
    form.todoId === props.item.todoId
      ? props.item.linkedTodo?.title || props.item.details?.todoTitle
      : selectedTodo.value?.title,
  );
  const actions = computed(() =>
    props.workspace.items.filter(
      (item) => item.lane === 'action' && item.sourceItemId === props.item.id && item.status !== 'archived',
    ),
  );
  function inProject(ref: ToolboxItemEvidence) {
    return props.workspace.resources.some(
      (resource) => resource.type === ref.type && resource.resourceId === ref.resourceId,
    );
  }
  function reset(item = props.item, nextVersion = props.workspace.boardVersion || 0) {
    Object.assign(form, safeDraft(item));
    baseline.value = JSON.stringify(form);
    version.value = nextVersion;
    localError.value = '';
  }
  let pendingReset = false;
  watch([() => props.item, locked], ([item], [previousItem]) => {
    if (item !== previousItem && !dirty.value) pendingReset = true;
    if (pendingReset && !locked.value) {
      pendingReset = false;
      if (!dirty.value) reset();
    }
  });
  function reloadDraft() {
    Alert.alert({
      title: t('toolbox.itemDetail.reload'),
      content: t('toolbox.itemDetail.discard'),
      onOk: () => reset(),
    });
  }
  function addEvidence(ref: ToolboxWorkspaceResource) {
    if (
      form.evidence.length >= 20 ||
      ref.available === false ||
      form.evidence.some((existing) => existing.type === ref.type && existing.resourceId === ref.resourceId)
    )
      return;
    form.evidence.push({ ...ref, explanation: '' });
    picker.value = null;
  }
  async function addProjectResource(resource: ResourcePickerItem) {
    if (locked.value || props.readonly || !['note', 'bookmark', 'file'].includes(resource.type)) return;
    savingResource.value = true;
    localError.value = '';
    try {
      const workspace = await addToolboxWorkspaceResources(props.workspace.id, [
        { type: resource.type as ToolboxWorkspaceResource['type'], id: resource.id },
      ]);
      if (!alive) return;
      const added = workspace.resources.find((ref) => ref.type === resource.type && ref.resourceId === resource.id);
      if (!added) throw Error('Resource unavailable');
      if ((workspace.boardVersion || 0) >= (props.workspace.boardVersion || 0)) emit('updated', workspace);
      addEvidence(added);
    } catch {
      if (alive) localError.value = t('toolbox.itemDetail.addResourceFailed');
    } finally {
      savingResource.value = false;
    }
  }
  function selectReference(ref: ResourcePickerItem) {
    if (ref.type === 'note') {
      form.noteId = ref.id;
      selectedNoteTitle.value = ref.title;
    }
    picker.value = null;
  }
  function selectTodo(todo: TodoItem) {
    form.todoId = todo.id;
    form.createLinkedTodo = false;
    selectedTodo.value = todo;
    picker.value = null;
  }
  function command(): BoardCommand {
    return {
      ...(props.creation?.command || { type: 'details', itemId: props.item.id }),
      ...(props.creation ? { createLinkedTodo: form.createLinkedTodo } : {}),
      title: form.title,
      content: form.content,
      ...(!props.item.todoId ? { dueOn: form.dueOn || null } : {}),
      todoId: form.todoId,
      details: {
        evidence: form.evidence.map(({ type, resourceId, explanation, refresh }) => ({
          type,
          resourceId,
          explanation,
          ...(refresh ? { refresh: true } : {}),
        })),
        conclusionStatus: (form.conclusionStatus || null) as NonNullable<BoardCommand['details']>['conclusionStatus'],
        conclusionNoteId: form.noteId,
      },
    };
  }
  async function save() {
    localError.value = '';
    if (!props.creation && !dirty.value) return props.workspace;
    const result = await props.commit(command(), version.value);
    if (result && alive) {
      const item = result.items.find((item) => item.id === props.item.id);
      if (item) reset(item, result.boardVersion || 0);
    }
    return result;
  }
  async function createTodo() {
    if (props.creation) {
      form.createLinkedTodo = !form.createLinkedTodo;
      return;
    }
    if (!(await save()) || !alive) return;
    const result = await props.commit({ type: 'createTodo', itemId: props.item.id }, version.value);
    if (result && alive) {
      const item = result.items.find((item) => item.id === props.item.id);
      if (item) reset(item, result.boardVersion || 0);
    }
  }
  async function deriveAction() {
    if ((await save()) && alive)
      await closeCurrentMobileOverlayThen(
        () => {
          visible.value = false;
        },
        () => emit('derive'),
      );
  }
  async function saveNote() {
    if (locked.value || (!props.creation && !(await save())) || !alive) return;
    savingNote.value = true;
    const savedItem = JSON.parse(
      JSON.stringify({
        ...props.item,
        title: form.title,
        content: form.content,
        details: { ...props.item.details, evidence: form.evidence },
      }),
    ) as ToolboxWorkspaceItem;
    const citations = (savedItem.details?.evidence || []).map((ref) => {
      const title = (ref.currentTitle || ref.title).replace(/[\\[\]<>]/g, '\\$&');
      return `- [${title}](${buildResourceHref({ type: ref.type, id: ref.resourceId })})${ref.explanation ? ` — ${ref.explanation}` : ''}`;
    });
    const note = {
      title: savedItem.title,
      content:
        savedItem.content +
        (citations.length ? `\n\n## ${t('toolbox.itemDetail.evidence')}\n\n${citations.join('\n')}` : ''),
      type: 'markdown' as const,
    };
    try {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(note)));
      const revision = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
      const key = `workspace-conclusion:${props.workspace.id}:${savedItem.id}:${savedItem.updatedAt}:${revision}`;
      const result = await closeCurrentMobileOverlayThen(
        () => {
          visible.value = false;
        },
        () =>
          openSaveAsNote({
            sourceKey: key,
            title: note.title,
            type: 'markdown',
            projectId: props.workspace.id,
            notice: props.creation ? t('toolbox.itemDetail.draftNoteNotice') : undefined,
            isCurrent: () => alive,
            save: (options) => createNoteFromContent(note, key, options, () => alive),
          }),
      );
      if (!alive || !result) return;
      form.noteId = result.noteId;
      selectedNoteTitle.value = note.title;
      const linked = props.creation ? true : await save();
      if (!linked) localError.value = t('toolbox.itemDetail.noteLinkFailed');
      else if (result.openAfterSave) {
        savingNote.value = false;
        await openResource('note', result.noteId);
      }
    } catch {
      if (alive) localError.value = t('toolbox.itemDetail.noteFailed');
    } finally {
      if (alive) {
        savingNote.value = false;
        if (!closing.value) visible.value = true;
      }
    }
  }
  function leave(next: () => void) {
    if (locked.value) return;
    if (!dirty.value) {
      next();
      return;
    }
    Alert.alert({ title: t('toolbox.itemDetail.unsaved'), content: t('toolbox.itemDetail.discard'), onOk: next });
  }
  defineExpose({ beforeLeave: leave });
  function canLeaveRoute() {
    // This navigation has already obtained draft-discard confirmation.
    if (navigating.value) return true;
    if (locked.value) return false;
    if (!dirty.value) return true;
    return new Promise<boolean>((resolve) =>
      Alert.alert({
        title: t('toolbox.itemDetail.unsaved'),
        content: t('toolbox.itemDetail.discard'),
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      }),
    );
  }
  onBeforeRouteLeave(canLeaveRoute);
  onBeforeRouteUpdate((to, from) => (to.query.workspace === from.query.workspace ? true : canLeaveRoute()));
  function requestClose() {
    if (locked.value) return;
    const close = () => {
      closing.value = true;
      visible.value = false;
    };
    if (!dirty.value) {
      close();
      return;
    }
    Alert.alert({
      title: t('toolbox.itemDetail.unsaved'),
      content: t('toolbox.itemDetail.discard'),
      onOk: close,
      onCancel: () => {
        if (props.mobile) drawerKey.value++;
      },
    });
  }
  function finishClose() {
    // Keep the closing drawer mounted so its mask shields the header during the exit animation.
    if (closing.value) emit('close');
  }
  function openSourceItem() {
    leave(() => {
      void closeCurrentMobileOverlayThen(
        () => {
          visible.value = false;
        },
        () => emit('source'),
      );
    });
  }
  async function openResource(type: string, id: string) {
    const target = resolveResourceRoute({ type, id }, { noteReturnPath: route.fullPath });
    if (!target) return;
    if (!(await canLeaveRoute()) || !alive) return;
    navigating.value = true;
    try {
      await closeCurrentMobileOverlayThen(
        () => {
          visible.value = false;
        },
        async () => {
          const failure = await router.push(target);
          if (!failure && alive) {
            closing.value = true;
            emit('close');
          }
        },
      );
    } catch {
      if (alive) localError.value = t('toolbox.itemDetail.openResourceFailed');
    } finally {
      navigating.value = false;
      // A canceled/failed navigation must return to the existing draft.
      if (alive && !closing.value) visible.value = true;
    }
  }
</script>

<style scoped lang="less">
  @import (reference) '@/assets/css/workspace-surfaces.less';
  .item-detail__back + :deep(.b-drawer-title) {
    flex: 1;
    margin-left: var(--ui-space-10, 10px);
  }
  .item-detail {
    .workspace-content-surface();
    display: flex;
    flex-direction: column;
    min-height: 100%;
    color: var(--text-color);
  }
  .item-detail__body {
    display: grid;
    gap: var(--ui-space-16, 16px);
    padding: var(--ui-space-24, 24px);
    flex: 1;
  }
  .item-detail label {
    display: grid;
    gap: var(--ui-space-6, 6px);
    font-size: var(--ui-font-13, 13px);
  }
  .item-detail__type,
  .item-detail header,
  .item-detail__reference-head,
  .item-detail__reference-state,
  .item-detail__actions,
  .item-detail footer {
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
  }
  .item-detail__type {
    justify-content: space-between;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .item-detail section {
    border-top: 1px solid var(--workspace-border);
    padding-top: var(--ui-space-16, 16px);
    display: grid;
    gap: var(--ui-space-10, 10px);
    min-width: 0;
  }
  .item-detail header {
    justify-content: space-between;
    flex-wrap: wrap;
  }
  .item-detail h3 {
    margin: 0;
    font-size: var(--ui-font-14, 14px);
    line-height: 1.5;
  }
  .item-detail small {
    color: var(--desc-color);
    font-weight: 400;
  }
  .item-detail__hint,
  .item-detail__empty {
    margin: 0;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.7;
  }
  .item-detail__empty {
    padding: var(--ui-space-4, 4px) 0;
  }
  .item-detail__reference {
    border: 1px solid var(--workspace-border);
    border-radius: 10px;
    padding: var(--ui-space-12, 12px);
    display: grid;
    gap: var(--ui-space-8, 8px);
    min-width: 0;
  }
  .item-detail__reference-head {
    align-items: flex-start;
    font-size: var(--ui-font-13, 13px);
  }
  .item-detail__reference-head strong {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
    line-height: 1.6;
  }
  .item-detail__reference-head :deep(.svg-icon) {
    flex-shrink: 0;
  }
  .item-detail__reference-state {
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
    flex-wrap: wrap;
  }
  .item-detail__actions {
    flex-wrap: wrap;
  }
  .item-detail__action-row.b_btn {
    justify-content: space-between;
    white-space: normal;
    height: auto;
    min-height: var(--ui-layout-40, 40px);
    text-align: left;
    gap: var(--ui-space-8, 8px);
  }
  .item-detail__action-row > span {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .item-detail__warning {
    border: 1px solid var(--workspace-border);
    border-radius: 8px;
    padding: var(--ui-space-10, 10px);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.7;
  }
  .item-detail footer {
    position: sticky;
    bottom: 0;
    padding: var(--ui-space-12, 12px) var(--ui-space-20, 20px);
    padding-bottom: max(var(--ui-space-12, 12px), env(safe-area-inset-bottom));
    border-top: 1px solid var(--workspace-border);
    background: var(--workspace-content);
    justify-content: flex-end;
    flex-wrap: wrap;
  }
  .item-detail footer > span {
    margin-right: auto;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .item-detail__actions > .text_btn {
    padding-left: 0;
    color: var(--workspace-purple-text);
  }
  @media (max-width: 767px) {
    .item-detail__body {
      padding: var(--ui-space-20, 20px) var(--ui-space-16, 16px);
    }
  }
</style>
