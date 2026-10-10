<template>
  <BDrawer
    :key="drawerKey"
    :open="visible"
    :title="t('toolbox.project.itemDetails')"
    width="var(--ui-layout-480, 480px)"
    :modal="mobile"
    mobile-full-screen
    :close-disabled="locked"
    body-padding="0"
    @close="requestClose"
  >
    <div class="item-detail">
      <div class="item-detail__body">
        <div class="item-detail__type"
          ><span>{{ laneLabel }}</span
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
        <BButton v-if="item.sourceItemId" type="text" class="item-detail__source" @click="openSourceItem">{{
          t('toolbox.board.from', { title: item.sourceTitle })
        }}</BButton>

        <section>
          <header
            ><h3
              >{{ t('toolbox.itemDetail.evidence') }} <small>{{ form.evidence.length }}</small></h3
            ><BButton
              v-if="!readonly"
              size="small"
              :disabled="locked || form.evidence.length >= 20"
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
          <div v-if="picker === 'evidence'" class="item-detail__picker">
            <BInput v-model:value="evidenceSearch" :placeholder="t('toolbox.itemDetail.searchEvidence')" />
            <p v-if="!evidenceOptions.length" class="item-detail__empty">{{
              t('toolbox.itemDetail.noProjectResources')
            }}</p>
            <BButton
              v-for="ref in evidenceOptions"
              :key="ref.id"
              block
              :disabled="ref.available === false || locked"
              @click="addEvidence(ref)"
              ><SvgIcon :src="icon.resource[ref.type]" size="16" />{{ ref.title }}</BButton
            >
          </div>
        </section>

        <section>
          <header
            ><h3>{{ t('toolbox.itemDetail.note') }}</h3></header
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
          <p v-else class="item-detail__empty">{{ t('toolbox.itemDetail.noNote') }}</p>
          <div v-if="!readonly && !form.noteId" class="item-detail__actions"
            ><BButton
              :loading="savingNote"
              :disabled="locked || !form.title.trim() || !form.content.trim()"
              @click="saveNote"
              >{{ t('toolbox.itemDetail.saveNote') }}</BButton
            ><BButton :disabled="locked" @click="picker = picker === 'note' ? null : 'note'">{{
              t('toolbox.itemDetail.linkNote')
            }}</BButton></div
          >
          <ResourcePickerPanel
            v-if="picker === 'note'"
            :allowed-types="['note']"
            exhaustive-single-type
            :disabled="locked"
            @select="selectReference"
          />
        </section>

        <section v-if="item.lane === 'action'">
          <header
            ><h3>{{ t('toolbox.itemDetail.todo') }}</h3></header
          >
          <p class="item-detail__hint">{{ t('toolbox.itemDetail.todoHint') }}</p>
          <div v-if="form.todoId" class="item-detail__reference">
            <div class="item-detail__reference-head"
              ><SvgIcon :src="icon.todoWorkspace.checkSquare" size="17" /><strong>{{ todoTitle }}</strong></div
            >
            <template v-if="form.todoId === item.todoId"
              ><BChip
                :tone="
                  item.linkedTodo?.available === false
                    ? 'danger'
                    : item.linkedTodo?.status === 'completed'
                      ? 'success'
                      : 'neutral'
                "
                >{{ todoState }}</BChip
              ><span v-if="item.linkedTodo?.dueOn"
                >{{ t('toolbox.workspace.itemDueLabel') }} · {{ item.linkedTodo.dueOn }}</span
              ></template
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
            ><p class="item-detail__empty">{{ t('toolbox.itemDetail.noTodo') }}</p
            ><label v-if="!item.todoId"
              ><span>{{ t('toolbox.workspace.itemDueLabel') }}</span
              ><BDateTimePicker v-model:value="form.dueOn" :show-time="false" :disabled="readonly || locked" /></label
            ><div v-if="!readonly" class="item-detail__actions"
              ><BButton :disabled="locked || !form.title.trim()" @click="createTodo">{{
                t('toolbox.itemDetail.createTodo')
              }}</BButton
              ><BButton :disabled="locked" @click="picker = picker === 'todo' ? null : 'todo'">{{
                t('toolbox.itemDetail.linkTodo')
              }}</BButton></div
            ></template
          >
          <ResourcePickerPanel
            v-if="picker === 'todo'"
            :allowed-types="['todo']"
            exhaustive-single-type
            :disabled="locked"
            @select="selectReference"
          />
          <p v-if="item.todoId && !form.todoId" class="item-detail__hint">{{
            t('toolbox.itemDetail.unlinkTodoHint')
          }}</p>
        </section>
        <section v-else>
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
          :disabled="locked || !form.title.trim() || !dirty"
          @click="save"
          >{{ t('common.save') }}</BButton
        ></footer
      >
    </div>
  </BDrawer>
</template>

<script setup lang="ts">
  import { computed, reactive, ref, watch, onBeforeUnmount } from 'vue';
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
  import ResourcePickerPanel from '@/components/resourcePicker/ResourcePickerPanel.vue';
  import icon from '@/config/icon';
  import { openSaveAsNote } from '@/composables/useSaveAsNote';
  import { createNoteFromContent } from '@/utils/aiNoteDraft';
  import { resolveResourceRoute } from '@/utils/resourceNavigation';
  import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory';
  import { buildResourceHref } from '@/utils/noteResourceRefs';
  const props = defineProps<{
    item: ToolboxWorkspaceItem;
    workspace: ToolboxWorkspace;
    mobile: boolean;
    readonly?: boolean;
    busy: boolean;
    error?: string;
    commit: (command: BoardCommand, version?: number) => Promise<ToolboxWorkspace | undefined>;
  }>();
  const emit = defineEmits<{ close: []; select: [id: string]; derive: []; source: [] }>();
  const { t } = useI18n();
  const router = useRouter(),
    route = useRoute();
  const visible = ref(true),
    drawerKey = ref(0),
    picker = ref<'evidence' | 'note' | 'todo' | null>(null);
  const evidenceSearch = ref(''),
    savingNote = ref(false),
    localError = ref('');
  let alive = true;
  onBeforeUnmount(() => {
    alive = false;
  });
  const locked = computed(() => props.busy || savingNote.value);
  const draft = (item: ToolboxWorkspaceItem) => ({
    title: item.title,
    content: item.content,
    dueOn: item.dueOn || '',
    evidence: structuredClone(item.details?.evidence || []) as ToolboxItemEvidence[],
    conclusionStatus: item.details?.conclusionStatus || '',
    noteId: item.details?.conclusionNote?.id || (null as string | null),
    todoId: item.todoId || (null as string | null),
  });
  // Clone through JSON because Vue wraps nested item metadata in reactive proxies.
  const safeDraft = (item: ToolboxWorkspaceItem) => draft(JSON.parse(JSON.stringify(item)));
  const form = reactive(safeDraft(props.item));
  const baseline = ref(JSON.stringify(form)),
    version = ref(props.workspace.boardVersion || 0);
  const dirty = computed(() => JSON.stringify(form) !== baseline.value);
  const stale = computed(() => dirty.value && version.value !== (props.workspace.boardVersion || 0));
  const selectedNoteTitle = ref(''),
    selectedTodoTitle = ref('');
  const laneLabel = computed(() =>
    t(`toolbox.workspace.template.${props.workspace.kind}.lanes.${props.item.lane}.title`),
  );
  const judgements = computed(() =>
    ['', 'tentative', 'confirmed', 'review'].map((value) => ({
      value,
      label: t(`toolbox.itemDetail.${value || 'unjudged'}`),
    })),
  );
  const todoState = computed(() =>
    t(
      props.item.linkedTodo?.available === false
        ? 'toolbox.itemDetail.unavailable'
        : props.item.linkedTodo?.status === 'completed'
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
      : selectedTodoTitle.value,
  );
  const actions = computed(() =>
    props.workspace.items.filter(
      (item) => item.lane === 'action' && item.sourceItemId === props.item.id && item.status !== 'archived',
    ),
  );
  const evidenceOptions = computed(() =>
    props.workspace.resources.filter(
      (ref) =>
        !form.evidence.some((value) => value.type === ref.type && value.resourceId === ref.resourceId) &&
        ref.title.toLocaleLowerCase().includes(evidenceSearch.value.toLocaleLowerCase()),
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
  watch(
    () => props.item,
    () => {
      if (!dirty.value && !locked.value) reset();
    },
  );
  function reloadDraft() {
    Alert.alert({
      title: t('toolbox.itemDetail.reload'),
      content: t('toolbox.itemDetail.discard'),
      onOk: () => reset(),
    });
  }
  function addEvidence(ref: ToolboxWorkspaceResource) {
    if (form.evidence.length >= 20 || ref.available === false) return;
    form.evidence.push({ ...ref, explanation: '' });
    picker.value = null;
    evidenceSearch.value = '';
  }
  function selectReference(ref: ResourcePickerItem) {
    if (ref.type === 'note') {
      form.noteId = ref.id;
      selectedNoteTitle.value = ref.title;
    }
    if (ref.type === 'todo') {
      form.todoId = ref.id;
      selectedTodoTitle.value = ref.title;
    }
    picker.value = null;
  }
  function command(): BoardCommand {
    return {
      type: 'details',
      itemId: props.item.id,
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
    if (!dirty.value) return props.workspace;
    const result = await props.commit(command(), version.value);
    if (result && alive) {
      const item = result.items.find((item) => item.id === props.item.id);
      if (item) reset(item, result.boardVersion || 0);
    }
    return result;
  }
  async function createTodo() {
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
    if (locked.value || !(await save()) || !alive) return;
    savingNote.value = true;
    const savedItem = JSON.parse(JSON.stringify(props.item)) as ToolboxWorkspaceItem;
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
            isCurrent: () => alive,
            save: (options) => createNoteFromContent(note, key, options, () => alive),
          }),
      );
      if (!alive || !result) return;
      form.noteId = result.noteId;
      selectedNoteTitle.value = note.title;
      const linked = await save();
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
        visible.value = true;
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
    if (dirty.value) drawerKey.value++; // Re-register mobile history after a cancelled system-back close.
    leave(() => emit('close'));
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
    leave(() => {
      void closeCurrentMobileOverlayThen(
        () => {
          visible.value = false;
        },
        async () => {
          emit('close');
          await router.push(target);
        },
      );
    });
  }
</script>

<style scoped lang="less">
  @import (reference) '@/assets/css/workspace-surfaces.less';
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
    padding: var(--ui-space-20, 20px);
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
    padding: var(--ui-space-12, 12px) 0;
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
  .item-detail__picker {
    display: grid;
    gap: var(--ui-space-6, 6px);
    max-height: var(--ui-layout-320, 320px);
    overflow-y: auto;
  }
  .item-detail__picker .b_btn {
    height: auto;
    min-height: var(--ui-layout-36, 36px);
    white-space: normal;
    text-align: left;
    justify-content: flex-start;
    overflow-wrap: anywhere;
  }
  .item-detail__source.b_btn {
    justify-content: flex-start;
    height: auto;
    white-space: normal;
    text-align: left;
    overflow-wrap: anywhere;
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
</style>
