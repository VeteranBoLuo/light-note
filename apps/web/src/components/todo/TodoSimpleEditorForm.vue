<template>
  <div class="todo-simple-editor" :class="{ 'is-mobile': mobile }" :style="{ '--todo-footer-height': `${footerHeight}px` }">
    <div class="todo-simple-editor__body">
      <main ref="editorBodyRef" class="todo-simple-editor__main">
        <div v-if="draft.independentTasks.enabled && !item" class="todo-simple-editor__mode-notice">
          <div class="todo-simple-editor__mode-head">
            <strong>{{ t('inbox.todoIndependentEnabled') }}</strong>
            <BButton v-if="mobile" class="todo-simple-editor__mode-exit" size="small" @click="disableAdvancedMode">
              {{ t('inbox.todoDisableAdvanced') }}
            </BButton>
          </div>
          <span>{{ t('inbox.todoIndependentEnabledHint') }}</span>
        </div>

        <section v-if="item?.seriesId" class="todo-simple-editor__section todo-simple-editor__scope">
          <header><div><strong>{{ t('inbox.todoPlanEditScope') }}</strong><small>{{ t(scope === 'current' ? 'inbox.todoPlanScopeCurrentHint' : scope === 'future' ? 'inbox.todoPlanScopeFutureHint' : 'inbox.todoPlanScopeSeriesHint') }}</small></div></header>
          <BSelect v-model:value="scope" :options="scopeOptions" :disabled="saving" />
        </section>
        <section class="todo-simple-editor__section todo-simple-editor__content">
          <header>
            <div>
              <strong>{{ t('inbox.todoPlanStepContent') }}</strong>
              <small>{{ t('inbox.todoContentHint') }}</small>
            </div>
          </header>
          <label>
            <span>{{ t('inbox.todoTitle') }}</span>
            <BInput v-model:value="draft.task.title" :maxlength="200" :placeholder="t('inbox.todoTitlePlaceholder')" />
          </label>
          <label>
            <span>{{ t('inbox.todoDescription') }}</span>
            <TodoResourceMentionInput
              v-model:value="draft.task.description"
              :rows="mobile ? 3 : 4"
              :maxlength="2000"
              :placeholder="t('inbox.todoDescriptionPlaceholder')"
              @select="applyResourceRef"
            />
            <span class="todo-simple-editor__resource-hint">
              <small>{{ t('inbox.todoMentionHint') }}</small>
              <BButton size="small" @click="resourcePickerVisible = true"> @ {{ t('inbox.todoAddResource') }} </BButton>
            </span>
          </label>
          <div v-if="resourceRefs.length" class="todo-simple-editor__resource-list">
            <TodoResourceLinks
              :items="resourceRefs"
              removable
              :disabled="saving"
              @open="emit('open-resource', $event)"
              @remove="removeResourceRef"
            />
          </div>
          <BModal
            v-model:visible="resourcePickerVisible"
            :title="t('inbox.todoAddResource')"
            width="460px"
            :show-footer="false"
          >
            <ResourcePickerPanel
              :allowed-types="['bookmark', 'note', 'file']"
              @select="applyResourceRef"
              @close="resourcePickerVisible = false"
            />
          </BModal>
          <TodoOrganizationFields
            v-model:list-id="draft.task.listId"
            v-model:tag-ids="draft.task.tagIds"
            @selection-summary="organizationSummary = $event"
            :disabled="saving"
          />
          <div class="todo-simple-editor__priority">
            <span>{{ t('inbox.todoPriority') }}</span>
            <div role="group" :aria-label="t('inbox.todoPriority')">
              <BButton
                v-for="option in priorityOptions"
                :key="option.value"
                size="small"
                :class="{ 'is-active': draft.task.priority === option.value }"
                @click="draft.task.priority = option.value"
              >
                {{ option.label }}
              </BButton>
            </div>
          </div>
          <div ref="checklistSectionRef">
            <TodoChecklistEditor v-model="draft.task.checklist" v-model:open="checklistOpen" :todo-id="item?.id" :title="draft.task.title" :description="draft.task.description" :disabled="saving" />
          </div>
        </section>

        <section
          v-if="!draft.independentTasks.enabled"
          class="todo-simple-editor__section todo-simple-editor__time"
        >
          <header>
            <div>
              <strong>{{ t('inbox.todoTime') }}</strong>
              <small>{{ t('inbox.todoTimeHint') }}</small>
            </div>
          </header>
          <div class="todo-simple-editor__time-grid">
            <label>
              <span>{{ t('inbox.todoStartAt') }}</span>
              <BDateTimePicker v-model:value="startAt" :placeholder="t('inbox.todoNoDate')" />
            </label>
            <label>
              <span>{{ t('inbox.todoDueAt') }}</span>
              <BDateTimePicker v-model:value="dueAt" :placeholder="t('inbox.todoNoDate')" />
            </label>
            <label>
              <span>{{ t('inbox.todoPlanTimezone') }}</span>
              <BSelect v-model:value="draft.timing.timezone" :options="timezoneOptions" />
            </label>
          </div>
        </section>

        <section v-if="!draft.independentTasks.enabled" class="todo-simple-editor__section">
          <header>
            <div>
              <strong>{{ t('inbox.todoReminder') }}</strong>
              <small>{{ t('inbox.todoSingleReminderHint') }}</small>
            </div>
          </header>
          <TodoReminderEditor v-model="draft.reminder" />
        </section>

        <section
          v-if="advancedEnabled || draft.independentTasks.enabled"
          class="todo-simple-editor__section todo-simple-editor__advanced"
          :class="{ 'is-enabled': draft.independentTasks.enabled }"
        >
          <header>
            <div>
              <strong>{{ t(item ? 'inbox.todoPlanTitle' : 'inbox.todoAdvanced') }}</strong>
              <small>{{ t(item ? 'inbox.todoPlanHint' : 'inbox.todoIndependentEntryHint') }}</small>
            </div>
            <BSwitch v-if="!item || (!item.seriesId && draft.independentTasks.plan.type !== 'once')" v-model:checked="draft.independentTasks.enabled" />
          </header>
          <div v-if="!draft.independentTasks.enabled" class="todo-simple-editor__advanced-summary">
            <strong>{{ t('inbox.todoIndependentToggleTitle') }}</strong>
            <span>{{ t('inbox.todoIndependentToggleHint') }}</span>
          </div>
          <TodoIndependentTaskPlanEditor
            v-else
            :draft="draft"
            :current-only="!!item && scope === 'current' && (!!item.seriesId || draft.independentTasks.plan.type === 'once')"
            :needs-past-policy="needsPastPolicy"
          />
        </section>

        <TodoPlanPreviewCard
          v-if="mobile"
          class="todo-simple-editor__mobile-preview"
          :preview="displayedPreview"
          :loading="previewLoading"
          :error="previewError"
          :independent="draft.independentTasks.enabled"
          :task="draft.task"
          :resources="resourceRefs"
          :organization="organizationSummary"
          :due-next-day="
            draft.independentTasks.enabled &&
            Boolean(draft.independentTasks.timing?.dueTime && draft.independentTasks.timing?.dueDayOffset)
          "
        />
      </main>

      <aside v-if="!mobile" class="todo-simple-editor__preview">
        <div class="todo-simple-editor__preview-sticky">
          <TodoPlanPreviewCard
            :preview="displayedPreview"
            :loading="previewLoading"
            :error="previewError"
            :independent="draft.independentTasks.enabled"
            :task="draft.task"
            :resources="resourceRefs"
            :organization="organizationSummary"
            :due-next-day="
              draft.independentTasks.enabled &&
              Boolean(draft.independentTasks.timing?.dueTime && draft.independentTasks.timing?.dueDayOffset)
            "
          />
          <div class="todo-simple-editor__preview-note">
            <span>{{
              draft.independentTasks.enabled
                ? t('inbox.todoPreviewServerTruthHint')
                : t('inbox.todoSinglePreviewAdvancedHint')
            }}</span>
          </div>
        </div>
      </aside>
    </div>

    <footer ref="footerRef" class="todo-simple-editor__footer">
      <section v-if="!mobile || submitBlockedReason" class="todo-simple-editor__footer-status" aria-live="polite">
        <span class="todo-simple-editor__footer-hint">{{ submitBlockedReason || footerHint }}</span>
      </section>
      <div>
        <BButton v-if="!mobile" :disabled="saving" @click="emit('cancel')">{{ t('common.cancel') }}</BButton>
        <BButton type="primary" :loading="saving" :disabled="!canSubmit" @click="submit">
          {{ submitLabel }}
        </BButton>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
  import TodoOrganizationFields from './TodoOrganizationFields.vue';
  import { todoTodayInTimezone } from '@/utils/todoPlanning';
  import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BDateTimePicker from '@/components/base/BasicComponents/BDateTimePicker.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BSwitch from '@/components/base/BasicComponents/BSwitch.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import ResourcePickerPanel from '@/components/resourcePicker/ResourcePickerPanel.vue';
  import TodoResourceLinks from '@/components/todo/TodoResourceLinks.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import TodoIndependentTaskPlanEditor from './TodoIndependentTaskPlanEditor.vue';
  import TodoPlanPreviewCard from './TodoPlanPreviewCard.vue';
  import TodoReminderEditor from './TodoReminderEditor.vue';
  import TodoChecklistEditor from './TodoChecklistEditor.vue';
  import TodoResourceMentionInput from './TodoResourceMentionInput.vue';
  import { normalizeTodoCreateDraft, suggestTodoPlanEndDate } from './todoDraftNormalizer';
  import { useTodoCreateDraft } from './useTodoCreateDraft';
  import {
    previewTodoPlanUpdateV2,
    previewTodoPlanV2,
    type TodoCreateInitialValues,
    type TodoEditorSubmission,
    type TodoItem,
    type TodoPlanPreview,
    type TodoPlanScope,
    type TodoPlanTiming,
    type TodoPriority,
    type TodoResourceRefView,
  } from '@/api/todoApi';
  import { generateUUID } from '@/utils/common';

  const props = withDefaults(
    defineProps<{
      item?: TodoItem | null;
      initialValues?: TodoCreateInitialValues;
      saving?: boolean;
      resetKey?: number;
      mobile?: boolean;
      advancedEnabled?: boolean;
    }>(),
    { item: null, initialValues: () => ({}), saving: false, resetKey: 0, mobile: false, advancedEnabled: true },
  );
  const emit = defineEmits<{
    submit: [submission: TodoEditorSubmission];
    cancel: [];
    'advanced-change': [enabled: boolean];
    'open-resource': [resource: TodoResourceRefView];
  }>();
  const { t } = useI18n();
  const { draft, reset } = useTodoCreateDraft();
  const scope = ref<TodoPlanScope>('current');
  let scopeTimings: Partial<Record<TodoPlanScope, TodoPlanTiming>> = {};
  const scopeOptions = computed(() => ['current', 'future', 'series'].map(value => ({value, label: t(value === 'current' ? 'inbox.todoPlanScopeCurrent' : value === 'future' ? 'inbox.todoPlanScopeFuture' : 'inbox.todoPlanScopeSeries')})));
  function buildDraft() {
    const payload = normalizeTodoCreateDraft(draft);
    if (props.item?.seriesId && scope.value === 'current' && draft.independentTasks.enabled) payload.plan = { type: 'once', pastPolicy: payload.plan.pastPolicy };
    return payload;
  }
  let advancedInitialized = false;
  let initialFingerprint = '';
  let initialContentFingerprint = '';
  const contentFingerprint = () => {
    const { listId, tagIds, ...task } = draft.task;
    return JSON.stringify({ ...draft, task });
  };
  const organizationOnly = computed(() =>
    Boolean(
      props.item && contentFingerprint() === initialContentFingerprint && JSON.stringify(draft) !== initialFingerprint,
    ),
  );
  let submissionFingerprint = '';
  let submissionKey = '';
  const preview = ref<TodoPlanPreview | null>(null);
  const displayedPreview = ref<TodoPlanPreview | null>(null);
  const organizationSummary = ref<{ listName: string; tags: Array<{ id: string; name: string }> }>({
    listName: '',
    tags: [],
  });
  const previewError = ref('');
  const previewLoading = ref(false);
  const footerRef = ref<HTMLElement | null>(null);
  const footerHeight = ref(76);
  watch(footerRef, (element, _, onCleanup) => {
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => { footerHeight.value = element.offsetHeight; });
    observer.observe(element);
    onCleanup(() => observer.disconnect());
  });
  const checklistSectionRef = ref<HTMLElement | null>(null);
  async function revealChecklist() {
    checklistOpen.value = true;
    await nextTick();
    checklistSectionRef.value?.scrollIntoView({ block: 'start', behavior: 'auto' });
  }
  const checklistOpen = ref(true);
  const resourcePickerVisible = ref(false);
  const resourceRefs = ref<TodoResourceRefView[]>([]);
  const editorBodyRef = ref<HTMLElement | null>(null);
  let previewTimer: ReturnType<typeof setTimeout> | null = null;
  let previewSequence = 0;

  const priorityOptions = computed(() =>
    ([0, 1, 2] as TodoPriority[]).map((value) => ({ value, label: t(`inbox.todoPriority${value}`) })),
  );
  const timezoneOptions = computed(() => [
    { value: 'Asia/Shanghai', label: t('inbox.todoTimezoneChina') },
    { value: 'Asia/Singapore', label: 'Asia/Singapore (UTC+8)' },
    { value: 'Asia/Tokyo', label: 'Asia/Tokyo (UTC+9)' },
    { value: 'America/New_York', label: 'America/New_York' },
    { value: 'Europe/London', label: 'Europe/London' },
  ]);
  const startAt = computed({
    get: () => draft.timing.startAt || '',
    set: (value) => (draft.timing.startAt = value || null),
  });
  const dueAt = computed({
    get: () => draft.timing.dueAt || '',
    set: (value) => (draft.timing.dueAt = value || null),
  });
  const canSubmit = computed(() =>
    Boolean(
      draft.task.title.trim() &&
      !props.saving &&
      (organizationOnly.value ||
        (preview.value?.previewHash &&
          !preview.value.requiredChoices?.length &&
          !previewError.value &&
          !previewLoading.value)),
    ),
  );
  // 展示沿用最近一次结果；提交仍只接受当前草稿的有效 preview。
  const needsPastPolicy = computed(() =>
    Boolean(draft.independentTasks.enabled && (
      displayedPreview.value?.requiredChoices?.includes('pastPolicy') ||
      displayedPreview.value?.warnings?.some(({ code }) => code === 'PAST_OCCURRENCE' || code === 'PAST_SCHEDULE_RESTARTED')
    )),
  );
  const submitBlockedReason = computed(() => {
    if (canSubmit.value || props.saving) return '';
    if (!draft.task.title.trim()) return t('inbox.todoTitleRequired');
    if (previewError.value) return previewError.value;
    if (previewLoading.value) return t('inbox.todoCreatePreviewUpdating');
    if (preview.value?.requiredChoices?.length) return t('inbox.todoPastChoose');
    return t('inbox.todoPlanPreviewFailed');
  });
  const submitLabel = computed(() => {
    if (props.item) return t('common.save');
    if (draft.independentTasks.enabled && displayedPreview.value) {
      return t('inbox.todoCreateIndependentCount', {
        count: displayedPreview.value.occurrenceCount ?? `${displayedPreview.value.generatedNowCount}+`,
      });
    }
    return props.mobile ? t('inbox.todoCreateNow') : t('inbox.todoCreateSingle');
  });
  const footerHint = computed(() =>
    props.item?.seriesId ? t(scope.value === 'current' ? 'inbox.todoPlanScopeCurrentHint' : scope.value === 'future' ? 'inbox.todoPlanScopeFutureHint' : 'inbox.todoPlanScopeSeriesHint') : draft.independentTasks.enabled ? t('inbox.todoIndependentFooterHint') : t('inbox.todoSingleFooterHint'),
  );

  watch(
    () => [props.item, props.initialValues, props.resetKey] as const,
    () => {
      displayedPreview.value = null;
      scope.value = 'current';
      reset(props.item, props.initialValues);
      scopeTimings = { current: JSON.parse(JSON.stringify(draft.independentTasks.timing)) };
      resourceRefs.value = [...(props.item?.resourceRefs || [])];
      const hasChecklist = Boolean(props.item?.checklist?.length || props.initialValues?.checklist?.length);
      checklistOpen.value = hasChecklist;
      advancedInitialized = !!props.item;
      initialFingerprint = JSON.stringify(draft);
      initialContentFingerprint = contentFingerprint();
      schedulePreview();
    },
    { immediate: true },
  );
  watch(scope, (next, previous) => {
    if (props.item?.series?.timing) {
      scopeTimings[previous] = JSON.parse(JSON.stringify(draft.independentTasks.timing));
      const timing = props.item.series.timing;
      draft.independentTasks.timing = JSON.parse(JSON.stringify(scopeTimings[next] || {
        ...timing,
        anchorDate: next === 'series' ? timing.anchorDate : props.item.occurrenceDate || timing.anchorDate,
      }));
    }
    schedulePreview();
  }, { flush: 'sync' });
  watch(draft, schedulePreview, { deep: true, flush: 'sync' });
  watch(
    () => draft.independentTasks.enabled,
    (enabled, previous) => {
      if (enabled && previous === false && !advancedInitialized) {
        advancedInitialized = true;
        const normalTiming = normalizeTodoCreateDraft({
          ...draft,
          independentTasks: { ...draft.independentTasks, enabled: false },
        }).timing;
        draft.independentTasks.timing = {
          ...normalTiming,
          anchorDate: normalTiming.anchorDate || todoTodayInTimezone(draft.timing.timezone),
        };
        mapSingleReminderToIndependent();
        const plan = draft.independentTasks.plan;
        if (plan.type === 'scheduled' && plan.end?.mode === 'until') {
          const dueDate = String(draft.timing.dueAt || '').slice(0, 10);
          plan.end = {
            mode: 'until',
            untilDate: plan.end.untilDate || suggestTodoPlanEndDate(draft.timing.startAt || draft.timing.dueAt),
          };
        }
        void nextTick(scrollEditorToTop);
      }
      emit('advanced-change', enabled);
    },
    { immediate: true },
  );
  onBeforeUnmount(() => previewTimer && clearTimeout(previewTimer));

  function schedulePreview() {
    if (previewTimer) clearTimeout(previewTimer);
    previewSequence += 1;
    preview.value = null;
    previewError.value = '';
    previewLoading.value = Boolean(draft.task.title.trim());
    if (!draft.task.title.trim()) {
      displayedPreview.value = null;
      preview.value = null;
      previewError.value = '';
      previewLoading.value = false;
      return;
    }
    previewTimer = setTimeout(() => void loadPreview(), 260);
  }

  function scrollEditorToTop() {
    const editorBody = editorBodyRef.value;
    if (!editorBody) return;
    editorBody.scrollTop = 0;

    // PC 由组件内容区滚动；移动抽屉和独立新建页由外层壳滚动。
    // 找到最近的真实滚动祖先即可同时覆盖两种入口，避免依赖 UA 或页面路由。
    let parent = editorBody.parentElement;
    while (parent) {
      if (/auto|scroll/.test(window.getComputedStyle(parent).overflowY)) {
        parent.scrollTop = 0;
        break;
      }
      parent = parent.parentElement;
    }
  }

  function disableAdvancedMode() {
    if (!draft.independentTasks.enabled) return;
    draft.independentTasks.enabled = false;
    void nextTick(scrollEditorToTop);
  }

  async function loadPreview() {
    const sequence = ++previewSequence;
    previewLoading.value = true;
    previewError.value = '';
    try {
      const payload = buildDraft();
      const response = props.item
        ? await previewTodoPlanUpdateV2(props.item.id, scope.value, payload)
        : await previewTodoPlanV2(payload);
      if (sequence !== previewSequence) return;
      if (response.status !== 200 || !response.data) throw new Error(response.msg || t('inbox.todoPlanPreviewFailed'));
      preview.value = response.data as TodoPlanPreview;
      displayedPreview.value = preview.value;
    } catch (error: any) {
      if (sequence !== previewSequence) return;
      preview.value = null;
      previewError.value = error?.message || t('inbox.todoPlanPreviewFailed');
    } finally {
      if (sequence === previewSequence) previewLoading.value = false;
    }
  }

  function applyResourceRef(item: { type: string; id: string; title: string }) {
    resourcePickerVisible.value = false;
    const key = `${item.type}:${item.id}`;
    if (resourceRefs.value.some((ref) => `${ref.type}:${ref.id}` === key)) return;
    if (resourceRefs.value.length >= 10) {
      message.warning(t('inbox.todoResourceRefsLimit', { count: 10 }));
      return;
    }
    resourceRefs.value.push({
      type: item.type as TodoResourceRefView['type'],
      id: String(item.id),
      title: item.title,
      snapshotTitle: item.title,
      available: true,
    });
    draft.task.contextRefs = resourceRefs.value.map(({ type, id }) => ({ type, id }));
  }

  function removeResourceRef(target: TodoResourceRefView) {
    resourceRefs.value = resourceRefs.value.filter((ref) => !(ref.type === target.type && ref.id === target.id));
    draft.task.contextRefs = resourceRefs.value.map(({ type, id }) => ({ type, id }));
  }

  function mapSingleReminderToIndependent() {
    if (draft.reminder.mode === 'none') {
      draft.independentTasks.reminder = {
        mode: 'none',
        channels: [],
      };
      return;
    }
    if (draft.reminder.mode === 'repeat' && draft.reminder.repeat?.kind === 'interval') {
      draft.independentTasks.reminder = {
        mode: 'nudge',
        trigger: defaultIndependentReminderTrigger(),
        channels: [...draft.reminder.channels],
        targetEmail: draft.reminder.targetEmail,
        quietPolicy: draft.reminder.quietPolicy || 'defer_once',
        nudge: {
          intervalMinutes: draft.reminder.repeat.intervalMinutes || 60,
          stop: 'completion_or_due',
          maxCount: Math.min(draft.reminder.repeat.stop.maxCount || 4, 20),
        },
      };
      return;
    }
    const once = draft.reminder.once;
    draft.independentTasks.reminder = {
      mode: 'once_per_instance',
      trigger:
        once?.type === 'at_start'
          ? { type: 'at_start' }
          : once?.type === 'fixed_at'
            ? { type: 'fixed_time', fixedTime: once.fixedAt?.slice(11, 16) || '09:00' }
            : { type: 'before_due', offsetMinutes: once?.type === 'before_due' ? once.offsetMinutes || 60 : 0 },
      channels: [...draft.reminder.channels],
      targetEmail: draft.reminder.targetEmail,
      quietPolicy: draft.reminder.quietPolicy || 'defer_once',
    };
  }

  function defaultIndependentReminderTrigger() {
    if (draft.timing.startAt) return { type: 'at_start' as const };
    if (draft.timing.dueAt) return { type: 'before_due' as const, offsetMinutes: 0 };
    return { type: 'fixed_time' as const, fixedTime: '09:00' };
  }

  function submit() {
    if (!canSubmit.value) return;
    if (organizationOnly.value) {
      emit('submit', {
        kind: 'organization',
        scope: scope.value,
        payload: { title: draft.task.title, listId: draft.task.listId, tagIds: draft.task.tagIds },
      });
      return;
    }
    if (!preview.value) return;
    const signature = JSON.stringify([scope.value, buildDraft()]);
    if (signature !== submissionFingerprint) {
      submissionFingerprint = signature;
      submissionKey = generateUUID();
    }
    emit('submit', {
      kind: 'v2',
      scope: scope.value,
      payload: {
        ...buildDraft(),
        previewHash: preview.value.previewHash,
        idempotencyKey: submissionKey,
      },
    });
  }

  defineExpose({ submit, revealChecklist, isDirty: () => scope.value !== 'current' || JSON.stringify(draft) !== initialFingerprint });
</script>

<style scoped lang="less">
  .todo-simple-editor {
    position: relative;
    display: grid;
    height: 100%;
    min-height: 0;
    grid-template-rows: minmax(0, 1fr) auto;
    overflow: hidden;
    background: var(--workspace-panel-bg-color);
  }

  .todo-simple-editor__body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 390px;
    min-height: 0;
    overflow: hidden;
  }

  .todo-simple-editor__main {
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 20px 22px 36px;
  }

  .todo-simple-editor__section {
    display: grid;
    gap: 18px;
    margin-bottom: 14px;
    padding: 16px;
    border: 1px solid var(--surface-border-color);
    border-radius: 16px;
    background: var(--card-background);
  }

  .todo-simple-editor__section > header {
    display: flex;
    align-items: flex-start;
    gap: 11px;
  }

  .todo-simple-editor__section > header > div {
    display: flex;
    flex: 1;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }

  .todo-simple-editor__section header strong {
    color: var(--text-color);
    font-size: 17px;
    line-height: 1.4;
  }

  .todo-simple-editor__section header small,
  .todo-simple-editor__section label > small,
  .todo-simple-editor__advanced-summary span {
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.55;
  }

  .todo-simple-editor__step {
    display: inline-block;
    width: auto;
    height: auto;
    flex: 0 0 auto;
    border: 0;
    color: var(--text-color);
    font-size: 17px;
    font-weight: 800;
  }

  .todo-simple-editor__mode-notice {
    display: grid;
    gap: 3px;
    margin-bottom: 14px;
    padding: 10px 12px;
    border: 1px solid #d5d1ff;
    border-radius: 12px;
    background: var(--primary-soft-color, var(--workspace-panel-bg-color));
    color: var(--primary-color);
    font-size: 12px;
    line-height: 1.55;
  }

  .todo-simple-editor__mode-head {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .todo-simple-editor__mode-head strong {
    min-width: 0;
  }

  .todo-simple-editor__mode-notice :deep(.todo-simple-editor__mode-exit.b_btn) {
    flex: 0 0 auto;
    border: 0 !important;
    background: transparent !important;
    color: var(--primary-color);
    padding: 0 4px;
    font-weight: 700;
    white-space: nowrap;
  }

  .todo-simple-editor label:not(.b-checkbox),
  .todo-simple-editor__priority {
    display: grid;
    gap: 7px;
    min-width: 0;
    color: var(--text-color);
    font-size: 13px;
    font-weight: 600;
  }

  .todo-simple-editor__content :deep(.b-textarea) {
    border: 1px solid var(--surface-border-color) !important;
    border-radius: 10px;
    background: var(--card-background) !important;
    box-shadow: none !important;
    transition:
      border-color 0.18s ease,
      background-color 0.18s ease;
  }

  .todo-simple-editor__content :deep(.b-textarea:hover) {
    border-color: var(--action-menu-border-color) !important;
  }

  .todo-simple-editor__content :deep(.b-textarea:focus) {
    border-color: var(--focus-ring-color) !important;
    background: var(--card-background) !important;
    box-shadow: none !important;
  }

  .todo-simple-editor__priority > div {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }

  .todo-simple-editor__resource-hint {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .todo-simple-editor__resource-list {
    min-width: 0;
  }

  .todo-simple-editor__priority :deep(.b_btn.is-active) {
    border-color: var(--primary-color);
    background: var(--mobile-selected-bg, var(--workspace-panel-bg-color));
    color: var(--primary-color);
    font-weight: 700;
  }

  .todo-simple-editor__time-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }

  .todo-simple-editor__time-grid label:last-child {
    grid-column: 1 / -1;
  }

  .todo-simple-editor__advanced-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .todo-simple-editor__advanced-summary {
    align-items: flex-start;
  }

  .todo-simple-editor__advanced-summary > span {
    max-width: 420px;
    text-align: right;
  }

  .todo-simple-editor__preview {
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 24px;
    border-left: 1px solid var(--surface-divider-color);
    background: var(--card-background);
  }

  .todo-simple-editor__preview-sticky {
    display: grid;
    gap: 14px;
  }

  .todo-simple-editor__preview-note {
    display: grid;
    gap: 4px;
    padding: 11px 12px;
    border-radius: 12px;
    background: var(--workspace-panel-bg-color);
  }

  .todo-simple-editor__preview-note span {
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.55;
  }

  .todo-simple-editor__footer {
    position: relative;
    z-index: 5;
    display: flex;
    min-height: 56px;
    box-sizing: border-box;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 8px 20px;
    border-top: 1px solid var(--surface-divider-color);
    background: var(--card-background);
  }

  .todo-simple-editor__footer > div {
    display: flex;
    gap: 9px;
  }

  .todo-simple-editor__footer-status {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px 12px;
    min-width: 0;
  }

  .todo-simple-editor__footer-hint {
    color: var(--desc-color);
    font-size: 12px;
  }

  .todo-simple-editor__footer :deep(.b_btn[type='primary']),
  .todo-simple-editor__footer :deep(.b_btn.b_btn-primary) {
    min-width: 150px;
  }

  .todo-simple-editor.is-mobile {
    display: block;
    height: auto;
    min-height: 100%;
    overflow: visible;
    padding-bottom: calc(var(--todo-footer-height, 76px) + 20px);
    background: var(--workspace-panel-bg-color);
  }

  .is-mobile .todo-simple-editor__body {
    display: block;
    min-height: 0;
    overflow: visible;
  }

  .is-mobile .todo-simple-editor__main {
    display: grid;
    overflow: visible;
    gap: 12px;
    padding: 12px 12px 24px;
  }

  .is-mobile .todo-simple-editor__section {
    gap: 15px;
    padding: 16px 14px;
    border: 1px solid var(--surface-border-color);
    border-radius: 15px;
    background: var(--card-background);
  }

  .is-mobile .todo-simple-editor__step {
    display: none;
  }

  .is-mobile .todo-simple-editor__section > header > div {
    display: grid;
    gap: 3px;
  }

  .is-mobile .todo-simple-editor__content > header,
  .is-mobile .todo-simple-editor__time > header {
    display: none;
  }

  .is-mobile .todo-simple-editor__mode-notice {
    margin-bottom: 0;
  }

  .is-mobile .todo-simple-editor__mode-notice :deep(.todo-simple-editor__mode-exit.b_btn) {
    min-height: 44px;
  }

  .is-mobile .todo-simple-editor__advanced.is-enabled > header {
    display: none;
  }

  .is-mobile .todo-simple-editor__time-grid {
    grid-template-columns: 1fr;
  }

  .is-mobile .todo-simple-editor__time-grid label:last-child {
    grid-column: auto;
  }

  .is-mobile .todo-simple-editor__advanced-summary {
    display: grid;
  }

  .is-mobile .todo-simple-editor__advanced-summary > span {
    text-align: left;
  }

  .is-mobile .todo-simple-editor__footer {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    min-height: 0;
    padding: 10px 12px calc(10px + env(safe-area-inset-bottom));
  }

  .is-mobile .todo-simple-editor__footer > div,
  .is-mobile .todo-simple-editor__footer :deep(.b_btn) {
    width: 100%;
  }

  .is-mobile .todo-simple-editor__footer :deep(.b_btn) {
    min-height: 48px;
  }
</style>
