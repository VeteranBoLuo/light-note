<template>
  <div class="todo-editor-form">
    <ol v-if="mobileWizard && !legacyMode" class="todo-editor-form__steps" :aria-label="t('inbox.todoPlanWizard')">
      <li
        v-for="step in mobileSteps"
        :key="step.value"
        :class="{ active: mobileStep === step.value, done: mobileStep > step.value }"
      >
        <span>{{ step.value }}</span>
        <strong>{{ step.label }}</strong>
      </li>
    </ol>
    <div v-show="!mobileWizard || legacyMode || mobileStep === 1" class="todo-editor-form__step">
      <label>
        <span>{{ t('inbox.todoTitle') }}</span>
        <BInput v-model:value="form.title" :maxlength="200" :placeholder="t('inbox.todoTitlePlaceholder')" />
      </label>
      <label>
        <span>{{ t('inbox.todoDescription') }}</span>
        <div class="todo-description-field">
          <BInput
            v-model:value="form.description"
            type="textarea"
            :rows="3"
            :maxlength="2000"
            :placeholder="t('inbox.todoDescriptionPlaceholder')"
            @keydown="handleMentionKeydown"
          />
          <!-- 说明保持纯文本:@ 唤起完整选择器(搜索框 + 分类列表),结果落成下方结构化 Chips -->
          <div v-if="mentionQuery" v-show="mentionHasResults" class="todo-mention-layer" :style="mentionAnchorStyle">
            <ResourcePickerPanel
              ref="mentionPanel"
              :allowed-types="['bookmark', 'note', 'file']"
              :show-search="false"
              :keyword="mentionQuery.keyword"
              @select="applyMentionSelection"
              @close="closeMention"
              @results-count="mentionHasResults = $event > 0"
            />
          </div>
        </div>
        <small class="todo-description-hint">{{ t('inbox.todoMentionHint') }}</small>
      </label>

      <BModal
        v-model:visible="resourcePickerVisible"
        :title="t('inbox.todoAddResource')"
        width="460px"
        :show-footer="false"
      >
        <ResourcePickerPanel
          class="todo-resource-picker-modal"
          :allowed-types="['bookmark', 'note', 'file']"
          @select="applyMentionSelection"
          @close="resourcePickerVisible = false"
        />
      </BModal>

      <section class="todo-resource-refs">
        <div class="todo-resource-refs__head">
          <span class="todo-resource-refs__label">
            {{ t('inbox.todoResourceRefs', { count: resourceRefs.length }) }}
          </span>
          <!-- 输入 @ 是快捷方式,显式按钮同时承担可发现性与无障碍入口(方案 5.6) -->
          <BButton size="small" @click="openResourcePicker">@ {{ t('inbox.todoAddResource') }}</BButton>
        </div>
        <div v-if="resourceRefs.length" class="todo-resource-refs__list">
          <span v-for="ref in resourceRefs" :key="`${ref.type}:${ref.id}`" class="todo-resource-chip">
            <span class="todo-resource-chip__type">{{ t(`ai.sourceTypes.${ref.type}`) }}</span>
            <span class="todo-resource-chip__title">{{ ref.title }}</span>
            <BButton
              class="todo-resource-chip__remove"
              :aria-label="t('common.delete')"
              @click="removeResourceRef(ref)"
            >
              ×
            </BButton>
          </span>
        </div>
      </section>
      <section class="todo-checklist-editor">
        <div class="todo-checklist-editor__header">
          <div>
            <span>{{ t('inbox.todoChecklist') }}</span>
            <small>{{ t('inbox.todoChecklistHint') }}</small>
          </div>
          <BButton size="small" :disabled="checklistItems.length >= 50" @click="addChecklistItem()">
            {{ t('inbox.todoAddChecklistItem') }}
          </BButton>
        </div>
        <div class="todo-checklist-editor__list">
          <div v-for="(check, index) in checklistItems" :key="check.id" class="todo-checklist-editor__row">
            <span class="todo-checklist-editor__index">{{ index + 1 }}</span>
            <BInput
              :ref="(component) => setChecklistInputRef(check.id, component)"
              v-model:value="check.text"
              :maxlength="200"
              :placeholder="t('inbox.todoChecklistPlaceholder')"
              @enter="handleChecklistEnter(index)"
            />
            <BButton
              size="small"
              class="todo-checklist-editor__remove"
              :disabled="saving"
              @click="removeChecklistItem(index)"
            >
              {{ t('inbox.todoRemoveChecklistItem') }}
            </BButton>
          </div>
        </div>
      </section>
      <div class="todo-editor-form__grid">
        <label>
          <span>{{ t('inbox.todoPriority') }}</span>
          <BSelect v-model:value="form.priority" :options="priorityOptions" />
        </label>
        <label v-if="legacyMode">
          <span>{{ t('inbox.todoDueAt') }}</span>
          <BDateTimePicker v-model:value="form.dueAt" :placeholder="t('inbox.todoDuePlaceholder')" />
        </label>
      </div>
    </div>
    <section v-if="legacyItem && !legacyConversion" class="todo-legacy-plan-banner">
      <div>
        <strong>{{ t('inbox.todoLegacyPlanTitle') }}</strong>
        <p>{{ legacyBehaviorSummary }}</p>
        <small>{{ t('inbox.todoLegacyPlanKeepHint') }}</small>
      </div>
      <BButton v-if="legacyConversionEnabled" type="primary" @click="startLegacyConversion">
        {{ t('inbox.todoLegacyPlanConvert') }}
      </BButton>
    </section>
    <section v-else-if="legacyConversion" class="todo-legacy-plan-banner is-converting">
      <div>
        <strong>{{ t('inbox.todoLegacyConversionTitle') }}</strong>
        <p>{{ t('inbox.todoLegacyConversionHint') }}</p>
        <small>{{ t('inbox.todoLegacyConversionReminderHint') }}</small>
      </div>
      <BButton @click="cancelLegacyConversion">{{ t('inbox.todoLegacyPlanKeep') }}</BButton>
    </section>
    <TodoPlanScheduleEditor
      v-if="!legacyMode"
      v-show="!mobileWizard || mobileStep > 1"
      :item="item"
      :legacy-conversion="legacyConversion"
      :title="form.title"
      :description="form.description"
      :checklist="normalizedChecklist"
      :priority="form.priority"
      :resource-refs="resourceRefInputs"
      :initial-due-at="initialValues?.dueAt || null"
      :mobile-step="mobileWizard ? mobileStep : 0"
      :reset-key="resetKey"
      @ready="planSubmission = $event"
    />
    <section v-if="legacyMode" class="todo-recurrence-editor">
      <div>
        <strong>{{ t('inbox.todoRecurrence') }}</strong>
        <small>{{ t('inbox.todoRecurrenceHint') }}</small>
      </div>
      <BSelect v-model:value="form.recurrenceFrequency" :options="recurrenceOptions" />
      <div v-if="form.recurrenceFrequency !== 'none'" class="todo-recurrence-editor__fields">
        <label>
          <span>{{ t('inbox.todoRecurrenceInterval') }}</span>
          <BInput v-model:value="form.recurrenceInterval" type="number" />
        </label>
        <label>
          <span>{{ t('inbox.todoRecurrenceEnd') }}</span>
          <BDateTimePicker v-model:value="form.recurrenceEndAt" :placeholder="t('inbox.todoRecurrenceNoEnd')" />
        </label>
      </div>
      <p v-if="recurrenceValidationMessage" class="todo-reminder-editor__error">
        {{ recurrenceValidationMessage }}
      </p>
    </section>
    <section v-if="legacyMode" ref="reminderEditorRef" class="todo-reminder-editor">
      <div class="todo-reminder-editor__title">
        <div>
          <strong>{{ t('inbox.todoReminder') }}</strong>
          <small>{{ t('inbox.todoReminderHint') }}</small>
        </div>
        <BSelect v-model:value="form.reminderMode" :options="reminderModeOptions" @change="handleReminderModeChange" />
      </div>
      <template v-if="form.reminderMode !== 'none'">
        <div class="todo-reminder-editor__channels">
          <BCheckbox v-model="form.inAppReminder">{{ t('inbox.todoReminderInApp') }}</BCheckbox>
          <BCheckbox v-model="form.emailReminder">{{ t('inbox.todoReminderEmail') }}</BCheckbox>
        </div>
        <label v-if="form.emailReminder">
          <span class="todo-reminder-editor__field-label">
            <span>{{ t('inbox.todoReminderEmailAddress') }}</span>
            <span v-if="reminderEmailValidationMessage" class="todo-reminder-editor__field-error">
              {{ reminderEmailValidationMessage }}
            </span>
          </span>
          <BInput
            v-model:value="form.reminderEmail"
            :maxlength="254"
            :placeholder="t('inbox.todoReminderEmailPlaceholder')"
          />
        </label>
        <label>
          <span class="todo-reminder-editor__field-label">
            <span>{{ form.reminderMode === 'repeat' ? t('inbox.todoReminderRange') : t('inbox.todoReminderAt') }}</span>
            <span v-if="reminderTimeValidationMessage" class="todo-reminder-editor__field-error">
              {{ reminderTimeValidationMessage }}
            </span>
          </span>
          <BDateTimePicker
            v-model:value="form.reminderStartAt"
            v-model:end-value="form.reminderEndAt"
            :mode="form.reminderMode === 'repeat' ? 'range' : 'single'"
            :placeholder="t('inbox.todoReminderPlaceholder')"
          />
        </label>
        <div v-if="form.reminderMode === 'repeat'" class="todo-reminder-editor__interval-field">
          <span>{{ t('inbox.todoReminderInterval') }}</span>
          <div class="todo-reminder-editor__interval">
            <BInput v-model:value="form.intervalValue" type="number" />
            <BSelect v-model:value="form.intervalUnit" :options="intervalUnitOptions" />
          </div>
        </div>
        <p v-if="reminderGeneralValidationMessage" class="todo-reminder-editor__error">
          {{ reminderGeneralValidationMessage }}
        </p>
      </template>
    </section>
    <div class="todo-editor-form__actions" :class="{ 'is-sticky': stickyActions }">
      <template v-if="mobileWizard && !legacyMode">
        <BButton v-if="mobileStep === 1" @click="emit('cancel')">{{ t('common.cancel') }}</BButton>
        <BButton v-else @click="mobileStep -= 1">{{ t('inbox.todoPlanPreviousStep') }}</BButton>
        <BButton
          v-if="mobileStep < 3"
          type="primary"
          :disabled="mobileStep === 1 && !form.title.trim()"
          @click="mobileStep += 1"
        >
          {{ t('inbox.todoPlanNextStep') }}
        </BButton>
        <BButton v-else type="primary" :loading="saving" :disabled="!canSubmit" @click="submit">
          {{ item ? t('common.save') : t('inbox.todoPlanCreate') }}
        </BButton>
      </template>
      <template v-else>
        <BButton @click="emit('cancel')">{{ t('common.cancel') }}</BButton>
        <BButton type="primary" :loading="saving" :disabled="!canSubmit" @click="submit">
          {{ t('common.save') }}
        </BButton>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BDateTimePicker from '@/components/base/BasicComponents/BDateTimePicker.vue';
  import type {
    TodoChecklistItem,
    TodoEditorSubmission,
    TodoItem,
    TodoPayload,
    TodoPriority,
    TodoReminderChannel,
    TodoReminderConfig,
    TodoPlanScope,
    TodoPlanWritePayload,
    TodoResourceRefView,
  } from '@/api/todoApi';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import ResourcePickerPanel from '@/components/resourcePicker/ResourcePickerPanel.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import { replaceMentionQuery, resolveMentionQuery, type MentionQuery } from '@/utils/resourceMentionTrigger';
  import { useDismissOnOutside } from '@/composables/useDismissOnOutside';
  import { getTextareaCaretRect, toAnchorOffset } from '@/utils/textareaCaret';
  import { generateUUID } from '@/utils/common';
  import { toTodoLocalInput } from '@/utils/todoPlanning';
  import TodoPlanScheduleEditor from '@/components/todo/TodoPlanScheduleEditor.vue';

  const props = withDefaults(
    defineProps<{
      item?: TodoItem | null;
      initialValues?: Partial<Pick<TodoPayload, 'title' | 'description' | 'priority' | 'dueAt' | 'checklist'>>;
      saving?: boolean;
      resetKey?: number;
      /** 移动抽屉使用三步渐进表单，避免一次展开全部高级配置。 */
      mobileWizard?: boolean;
      /** 新建入口关闭时回落到旧版一次性待办；已有 v2 系列仍可管理。 */
      v2Enabled?: boolean;
      legacyConversionEnabled?: boolean;
      /** 抽屉形态下把「取消 / 保存」吸在底部，避免长表单滚动后找不到提交按钮 */
      stickyActions?: boolean;
    }>(),
    {
      item: null,
      initialValues: () => ({}),
      saving: false,
      resetKey: 0,
      stickyActions: false,
      mobileWizard: false,
      v2Enabled: true,
      legacyConversionEnabled: true,
    },
  );
  const emit = defineEmits<{
    submit: [submission: TodoEditorSubmission];
    cancel: [];
  }>();
  const { t } = useI18n();
  const checklistItems = ref<TodoChecklistItem[]>([]);
  const reminderEditorRef = ref<HTMLElement | null>(null);
  const mobileStep = ref<1 | 2 | 3>(1);
  const mobileSteps = computed(() => [
    { value: 1 as const, label: t('inbox.todoPlanStepContent') },
    { value: 2 as const, label: t('inbox.todoPlanStepSchedule') },
    { value: 3 as const, label: t('inbox.todoPlanStepReminder') },
  ]);

  // ── 说明区 @ 关联参考资料 ──────────────────────────
  const resourceRefs = ref<TodoResourceRefView[]>([]);
  const mentionQuery = ref<MentionQuery | null>(null);
  const mentionPanel = ref<{ chooseActive: () => void; moveActive: (offset: number) => void } | null>(null);
  // 搜不到结果就整块不显示;面板仍挂载继续搜,退回能匹配的词时自动重现
  const mentionHasResults = ref(false);
  const MAX_RESOURCE_REFS = 10;

  // 浮层锚定在触发它的 @ 上:只在打开时算一次,继续输入不会让它漂走
  const mentionAnchor = ref<{ left: number } | null>(null);
  const mentionAnchorStyle = computed(() =>
    mentionAnchor.value ? { left: `${mentionAnchor.value.left}px` } : undefined,
  );

  function updateMentionAnchor(target: HTMLTextAreaElement | null, query: MentionQuery) {
    const field = target?.closest('.todo-description-field') as HTMLElement | null;
    if (!target || !field) return;
    const caret = getTextareaCaretRect(target, query.start);
    const offset = toAnchorOffset(caret, field);
    // 垂直方向固定在说明框整体下方(不遮输入内容),水平对齐触发的 @
    mentionAnchor.value = { left: Math.max(0, Math.min(offset.left, field.offsetWidth - 60)) };
  }

  function closeMention() {
    mentionQuery.value = null;
    mentionAnchor.value = null;
    mentionHasResults.value = false;
  }

  // 点击外部 / Esc 关闭走统一实现
  useDismissOnOutside({
    isActive: () => Boolean(mentionQuery.value),
    ignoreSelectors: ['.todo-mention-layer', '.todo-description-field'],
    onDismiss: closeMention,
  });

  function handleMentionKeydown(event: KeyboardEvent) {
    const target = event.target as HTMLTextAreaElement | null;
    // 面板没有搜索框,焦点留在说明框,键盘导航由这里转发
    if (mentionQuery.value && mentionHasResults.value) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        mentionPanel.value?.moveActive(event.key === 'ArrowDown' ? 1 : -1);
        return;
      }
      if (event.key === 'Enter' && !event.isComposing) {
        event.preventDefault();
        event.stopPropagation();
        mentionPanel.value?.chooseActive();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMention();
        return;
      }
    }
    window.setTimeout(() => {
      if (!target || typeof target.selectionStart !== 'number') return closeMention();
      const next = resolveMentionQuery(String(target.value ?? ''), target.selectionStart);
      const isNewMention = !mentionQuery.value || mentionQuery.value.start !== next?.start;
      mentionQuery.value = next;
      if (!next) return closeMention();
      if (isNewMention) void nextTick(() => updateMentionAnchor(target, next));
    }, 0);
  }

  /** 选中后消费掉说明里的 @关键词,只保留结构化关系,不往正文塞链接文本。 */
  function applyMentionSelection(item: { type: string; id: string; title: string }) {
    const query = mentionQuery.value;
    if (query) form.description = replaceMentionQuery(form.description, query);
    closeMention();
    resourcePickerVisible.value = false;
    const key = `${item.type}:${item.id}`;
    if (resourceRefs.value.some((ref) => `${ref.type}:${ref.id}` === key)) return;
    if (resourceRefs.value.length >= MAX_RESOURCE_REFS) {
      message.warning(t('inbox.todoResourceRefsLimit', { count: MAX_RESOURCE_REFS }));
      return;
    }
    resourceRefs.value = [
      ...resourceRefs.value,
      {
        type: item.type as TodoResourceRefView['type'],
        id: String(item.id),
        title: item.title,
        snapshotTitle: item.title,
        available: true,
      },
    ];
  }

  const resourcePickerVisible = ref(false);

  function openResourcePicker() {
    closeMention();
    resourcePickerVisible.value = true;
  }

  function removeResourceRef(target: TodoResourceRefView) {
    resourceRefs.value = resourceRefs.value.filter((ref) => !(ref.type === target.type && ref.id === target.id));
  }

  const checklistInputRefs = new Map<string, { focus: () => void }>();
  const planSubmission = ref<{ scope: TodoPlanScope; payload: TodoPlanWritePayload } | null>(null);
  const legacyConversion = ref(false);
  const legacyItem = computed(() => Boolean(props.item && Number(props.item.planVersion || 1) !== 2));
  const legacyMode = computed(() => (!props.v2Enabled && !props.item) || (legacyItem.value && !legacyConversion.value));
  const legacyBehaviorSummary = computed(() => {
    const parts: string[] = [];
    if (props.item?.recurrence) parts.push(t('inbox.todoLegacyCompletionRepeat'));
    if ((props.item?.reminder as TodoReminderConfig | null | undefined)?.mode === 'repeat') {
      parts.push(t('inbox.todoLegacyRepeatedReminder'));
    } else if (props.item?.reminder || props.item?.reminderAt) {
      parts.push(t('inbox.todoLegacySingleReminder'));
    }
    return parts.length ? parts.join(' · ') : t('inbox.todoLegacySingleTask');
  });
  const form = reactive({
    title: '',
    description: '',
    priority: 1 as TodoPriority,
    dueAt: '',
    reminderMode: 'none' as 'none' | 'once' | 'repeat',
    reminderStartAt: '',
    reminderEndAt: '',
    inAppReminder: true,
    emailReminder: false,
    reminderEmail: '',
    intervalValue: 1 as number | string,
    intervalUnit: 'day' as 'minute' | 'hour' | 'day' | 'week',
    recurrenceFrequency: 'none' as 'none' | 'daily' | 'weekly' | 'monthly',
    recurrenceInterval: 1 as number | string,
    recurrenceEndAt: '',
  });
  const priorityOptions = computed(() => [0, 1, 2].map((value) => ({ value, label: t(`inbox.todoPriority${value}`) })));
  const reminderModeOptions = computed(() => [
    { value: 'none', label: t('inbox.todoReminderNone') },
    { value: 'once', label: t('inbox.todoReminderOnce') },
    { value: 'repeat', label: t('inbox.todoReminderRepeat') },
  ]);
  const intervalUnitOptions = computed(() => [
    { value: 'minute', label: t('inbox.todoReminderMinutes') },
    { value: 'hour', label: t('inbox.todoReminderHours') },
    { value: 'day', label: t('inbox.todoReminderDays') },
    { value: 'week', label: t('inbox.todoReminderWeeks') },
  ]);
  const recurrenceOptions = computed(() => [
    { value: 'none', label: t('inbox.todoRecurrenceNone') },
    { value: 'daily', label: t('inbox.todoRecurrenceDaily') },
    { value: 'weekly', label: t('inbox.todoRecurrenceWeekly') },
    { value: 'monthly', label: t('inbox.todoRecurrenceMonthly') },
  ]);
  const recurrenceValidationMessage = computed(() => {
    if (!legacyMode.value) return '';
    if (form.recurrenceFrequency === 'none') return '';
    if (!form.dueAt) return t('inbox.todoRecurrenceNeedsDue');
    const interval = Number(form.recurrenceInterval);
    if (!Number.isInteger(interval) || interval < 1 || interval > 365) return t('inbox.todoRecurrenceIntervalInvalid');
    if (form.recurrenceEndAt && new Date(form.recurrenceEndAt).getTime() <= new Date(form.dueAt).getTime()) {
      return t('inbox.todoRecurrenceEndInvalid');
    }
    return '';
  });
  const reminderEmailValidationMessage = computed(() => {
    if (!legacyMode.value) return '';
    if (form.reminderMode === 'none' || !form.emailReminder) return '';
    return /^\S+@\S+\.\S+$/.test(form.reminderEmail.trim()) ? '' : t('inbox.todoReminderEmailInvalid');
  });
  const reminderTimeValidationMessage = computed(() => {
    if (!legacyMode.value) return '';
    if (form.reminderMode === 'none' || form.reminderStartAt) return '';
    return t('inbox.todoReminderTimeRequired');
  });
  const reminderValidationMessage = computed(() => {
    if (!legacyMode.value) return '';
    if (form.reminderMode === 'none') return '';
    if (!form.inAppReminder && !form.emailReminder) return t('inbox.todoReminderChannelRequired');
    if (reminderEmailValidationMessage.value) return reminderEmailValidationMessage.value;
    if (!form.reminderStartAt) return t('inbox.todoReminderTimeRequired');
    if (form.reminderMode === 'repeat') {
      if (!form.reminderEndAt) return t('inbox.todoReminderEndRequired');
      if (new Date(form.reminderEndAt).getTime() <= new Date(form.reminderStartAt).getTime())
        return t('inbox.todoReminderRangeInvalid');
      const intervalMinutes = toMinutes(form.intervalValue, form.intervalUnit);
      if (!Number.isFinite(intervalMinutes) || intervalMinutes < 5 || intervalMinutes > 43200)
        return t('inbox.todoReminderIntervalInvalid');
      const occurrenceCount =
        Math.floor(
          (new Date(form.reminderEndAt).getTime() - new Date(form.reminderStartAt).getTime()) /
            (intervalMinutes * 60_000),
        ) + 1;
      if (occurrenceCount > 100) return t('inbox.todoReminderTooFrequent');
    }
    if (form.dueAt) {
      const reminderEnd = form.reminderMode === 'repeat' ? form.reminderEndAt : form.reminderStartAt;
      if (reminderEnd && new Date(reminderEnd).getTime() > new Date(form.dueAt).getTime())
        return t('inbox.todoReminderAfterDue');
    }
    return '';
  });
  const reminderGeneralValidationMessage = computed(() =>
    reminderEmailValidationMessage.value || reminderTimeValidationMessage.value ? '' : reminderValidationMessage.value,
  );
  const canSubmit = computed(
    () =>
      Boolean(form.title.trim()) &&
      !props.saving &&
      (legacyMode.value
        ? !reminderValidationMessage.value && !recurrenceValidationMessage.value
        : Boolean(planSubmission.value)),
  );

  const normalizedChecklist = computed(() =>
    checklistItems.value
      .map((item) => ({ ...item, text: item.text.trim() }))
      .filter((item) => Boolean(item.text))
      .slice(0, 50)
      .map((item) => ({ ...item, text: item.text.slice(0, 200) })),
  );
  const resourceRefInputs = computed(() => resourceRefs.value.map((ref) => ({ type: ref.type, id: ref.id })));

  watch(
    () => [props.item, props.initialValues, props.resetKey, props.v2Enabled] as const,
    () => reset(),
    { immediate: true },
  );

  watch(
    () => form.reminderMode,
    (mode) => {
      if (mode !== 'repeat') form.reminderEndAt = '';
    },
  );

  async function handleReminderModeChange(mode: 'none' | 'once' | 'repeat') {
    if (mode === 'none') return;
    await nextTick();
    reminderEditorRef.value?.scrollIntoView({
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'nearest',
    });
  }

  function reset() {
    const initialValues = props.item ? null : props.initialValues;
    mobileStep.value = 1;
    legacyConversion.value = false;
    form.title = props.item?.title ?? initialValues?.title ?? '';
    form.description = props.item?.description ?? initialValues?.description ?? '';
    resourceRefs.value = [...(props.item?.resourceRefs || [])];
    closeMention();
    form.priority = props.item?.priority ?? initialValues?.priority ?? 1;
    form.dueAt = toTodoLocalInput(props.item?.dueAt ?? initialValues?.dueAt);
    const reminder = legacyMode.value ? (props.item?.reminder as TodoReminderConfig | null | undefined) : null;
    form.reminderMode = reminder?.mode || (props.item?.reminderAt ? 'once' : 'none');
    form.reminderStartAt = toTodoLocalInput(reminder?.startAt || props.item?.reminderAt);
    form.reminderEndAt = toTodoLocalInput(reminder?.endAt);
    form.inAppReminder = reminder ? reminder.channels.includes('in_app') : true;
    form.emailReminder = Boolean(reminder?.channels.includes('email'));
    form.reminderEmail = reminder?.email || '';
    // 新建周期提醒默认半小时；仍可通过“数值 + 单位”组合选择分钟、小时、天或周。
    const interval = fromMinutes(reminder?.intervalMinutes ?? 30);
    form.intervalValue = interval.value;
    form.intervalUnit = interval.unit;
    form.recurrenceFrequency = props.item?.recurrence?.frequency || 'none';
    form.recurrenceInterval = props.item?.recurrence?.interval || 1;
    form.recurrenceEndAt = toTodoLocalInput(props.item?.recurrence?.endAt);
    planSubmission.value = null;
    const initialChecklist = props.item?.checklist || initialValues?.checklist;
    checklistItems.value = initialChecklist?.length
      ? initialChecklist.map((item) => ({ ...item }))
      : [createChecklistItem()];
  }

  function createChecklistItem(): TodoChecklistItem {
    return { id: generateUUID(), text: '', done: false };
  }

  function setChecklistInputRef(id: string, component: any) {
    if (component) checklistInputRefs.set(id, component);
    else checklistInputRefs.delete(id);
  }

  function focusChecklistItem(id?: string) {
    if (!id) return;
    nextTick(() => checklistInputRefs.get(id)?.focus());
  }

  function addChecklistItem(afterIndex = checklistItems.value.length - 1) {
    if (checklistItems.value.length >= 50) return;
    const current = checklistItems.value[afterIndex];
    if (current && !current.text.trim()) {
      focusChecklistItem(current.id);
      return;
    }
    const item = createChecklistItem();
    checklistItems.value.splice(Math.max(0, afterIndex + 1), 0, item);
    focusChecklistItem(item.id);
  }

  function handleChecklistEnter(index: number) {
    if (!checklistItems.value[index]?.text.trim()) return;
    addChecklistItem(index);
  }

  function removeChecklistItem(index: number) {
    if (checklistItems.value.length === 1) {
      checklistItems.value[0] = createChecklistItem();
      focusChecklistItem(checklistItems.value[0].id);
      return;
    }
    checklistItems.value.splice(index, 1);
    focusChecklistItem(checklistItems.value[Math.min(index, checklistItems.value.length - 1)]?.id);
  }

  function submit() {
    if (!canSubmit.value) return;
    const checklist = normalizedChecklist.value;
    if (!legacyMode.value) {
      if (!planSubmission.value) return;
      emit('submit', {
        kind: 'v2',
        scope: planSubmission.value.scope,
        ...(legacyConversion.value && props.item ? { convertLegacyTodoId: props.item.id } : {}),
        payload: {
          ...planSubmission.value.payload,
          title: form.title.trim(),
          description: form.description.trim(),
          priority: form.priority,
          checklist,
          resourceRefs: resourceRefInputs.value,
        },
      });
      return;
    }
    const channels: TodoReminderChannel[] = [];
    if (form.inAppReminder) channels.push('in_app');
    if (form.emailReminder) channels.push('email');
    emit('submit', {
      kind: 'legacy',
      payload: {
        title: form.title.trim(),
        description: form.description.trim(),
        resourceRefs: resourceRefInputs.value,
        priority: form.priority,
        checklist,
        dueAt: form.dueAt || null,
        reminder:
          form.reminderMode === 'none'
            ? null
            : {
                mode: form.reminderMode,
                channels,
                startAt: form.reminderStartAt,
                endAt: form.reminderMode === 'repeat' ? form.reminderEndAt : null,
                intervalMinutes:
                  form.reminderMode === 'repeat' ? toMinutes(form.intervalValue, form.intervalUnit) : null,
                email: form.emailReminder ? form.reminderEmail.trim() : null,
              },
        recurrence:
          form.recurrenceFrequency === 'none'
            ? null
            : {
                frequency: form.recurrenceFrequency,
                interval: Number(form.recurrenceInterval),
                endAt: form.recurrenceEndAt || null,
              },
      },
    });
  }

  function startLegacyConversion() {
    legacyConversion.value = true;
    planSubmission.value = null;
    if (props.mobileWizard) mobileStep.value = 2;
  }

  function cancelLegacyConversion() {
    legacyConversion.value = false;
    planSubmission.value = null;
    mobileStep.value = 1;
  }

  function toMinutes(value: number | string, unit: typeof form.intervalUnit) {
    const multipliers = { minute: 1, hour: 60, day: 1440, week: 10080 };
    return Math.round(Number(value) * multipliers[unit]);
  }

  function fromMinutes(minutes: number): { value: number; unit: typeof form.intervalUnit } {
    if (minutes % 10080 === 0) return { value: minutes / 10080, unit: 'week' };
    if (minutes % 1440 === 0) return { value: minutes / 1440, unit: 'day' };
    if (minutes % 60 === 0) return { value: minutes / 60, unit: 'hour' };
    return { value: minutes, unit: 'minute' };
  }
</script>

<style scoped lang="less">
  .todo-editor-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
    color: var(--text-color);
  }
  .todo-editor-form__step {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .todo-editor-form__steps {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .todo-editor-form__steps li {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 6px;
    padding: 8px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    color: var(--desc-color);
    font-size: 11px;
  }
  .todo-editor-form__steps li > span {
    display: inline-flex;
    width: 20px;
    height: 20px;
    flex: 0 0 20px;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--workspace-panel-bg-color);
    font-weight: 700;
  }
  .todo-editor-form__steps li > strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .todo-editor-form__steps li.active {
    border-color: var(--primary-color);
    color: var(--primary-color);
    font-weight: 700;
  }
  .todo-editor-form__steps li.active > span,
  .todo-editor-form__steps li.done > span {
    background: var(--primary-color);
    color: #fff;
  }
  .todo-editor-form label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
    font-weight: 500;
  }

  .todo-editor-form :deep(.b-input),
  .todo-editor-form :deep(.b-textarea) {
    border: 1px solid color-mix(in srgb, var(--text-color) 16%, var(--surface-border-color)) !important;
    border-radius: 9px;
    background: color-mix(in srgb, var(--bl-input-noBorder-bg-color) 78%, var(--card-background)) !important;
    transition:
      border-color 0.18s ease,
      box-shadow 0.18s ease,
      background-color 0.18s ease;
  }

  .todo-editor-form :deep(.b-input:hover),
  .todo-editor-form :deep(.b-textarea:hover) {
    border-color: color-mix(in srgb, var(--primary-color) 48%, var(--surface-border-color)) !important;
  }

  .todo-editor-form :deep(.b-input:focus-visible),
  .todo-editor-form :deep(.b-textarea:focus) {
    border-color: var(--primary-color) !important;
    background: var(--card-background) !important;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary-color) 13%, transparent) !important;
  }

  .todo-editor-form :deep(.select-trigger),
  .todo-editor-form :deep(.b-datetime-trigger) {
    min-height: 40px;
    border: 1px solid color-mix(in srgb, var(--text-color) 16%, var(--surface-border-color)) !important;
    border-radius: 9px;
    background: color-mix(in srgb, var(--bl-input-noBorder-bg-color) 78%, var(--card-background)) !important;
  }

  .todo-editor-form :deep(.select-trigger:hover),
  .todo-editor-form :deep(.b-datetime-trigger:hover) {
    border-color: color-mix(in srgb, var(--primary-color) 48%, var(--surface-border-color)) !important;
  }

  .todo-editor-form > label:first-child :deep(.b-input) {
    height: 44px;
    border-color: color-mix(in srgb, var(--primary-color) 26%, var(--surface-border-color)) !important;
    border-radius: 10px;
    font-size: 15px;
  }
  .todo-editor-form > label:nth-child(2) :deep(.b-textarea) {
    min-height: 104px;
    border-radius: 10px;
  }
  .todo-reminder-editor__interval-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
  }
  .todo-recurrence-editor {
    display: grid;
    gap: 9px;
    padding: 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--workspace-panel-bg-color);
  }
  .todo-legacy-plan-banner {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
    padding: 14px;
    border: 1px solid #b45309;
    border-radius: 12px;
    background: #fffbeb;
    color: #78350f;
  }
  .todo-legacy-plan-banner.is-converting {
    border-color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 6%, var(--background-color));
    color: var(--text-color);
  }
  .todo-legacy-plan-banner > div {
    display: grid;
    gap: 4px;
    min-width: 0;
  }
  .todo-legacy-plan-banner p,
  .todo-legacy-plan-banner small {
    margin: 0;
    line-height: 1.5;
  }
  .todo-legacy-plan-banner small {
    color: var(--desc-color);
  }
  .todo-recurrence-editor > div:first-child {
    display: grid;
    gap: 3px;
  }
  .todo-recurrence-editor small {
    color: var(--desc-color);
    line-height: 1.45;
  }
  .todo-recurrence-editor__fields {
    display: grid;
    grid-template-columns: minmax(0, 0.7fr) minmax(0, 1.3fr);
    gap: 10px;
  }
  .todo-checklist-editor {
    display: flex;
    flex-direction: column;
    gap: 9px;
    padding: 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--workspace-panel-bg-color);
  }
  .todo-checklist-editor__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }
  .todo-checklist-editor__header > div {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    color: var(--text-color);
    font-size: 13px;
  }
  .todo-checklist-editor__header small {
    color: var(--desc-color);
    font-size: 12px;
  }
  .todo-checklist-editor__list {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .todo-checklist-editor__row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 6px;
  }
  .todo-checklist-editor__remove {
    color: var(--desc-color);
  }
  .todo-editor-form__grid {
    display: grid;
    grid-template-columns: 0.8fr 1.4fr;
    gap: 10px;
  }
  .todo-checklist-editor__index {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--primary-color) 10%, var(--background-color));
    color: var(--primary-color);
    font-size: 11px;
    font-weight: 600;
  }
  .todo-reminder-editor {
    display: flex;
    flex-direction: column;
    gap: 11px;
    padding: 13px;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--workspace-panel-bg-color);
    scroll-margin-bottom: 76px;
  }
  .todo-reminder-editor__title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .todo-reminder-editor__title > div {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .todo-reminder-editor__title small {
    color: var(--desc-color);
    font-size: 11px;
    font-weight: 400;
  }
  .todo-reminder-editor__channels {
    display: flex;
    flex-wrap: wrap;
    gap: 18px;
  }
  .todo-reminder-editor label {
    gap: 6px;
  }
  .todo-reminder-editor__field-label {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
  }
  .todo-reminder-editor__field-error {
    color: var(--danger-color, #e5484d);
    font-size: 12px;
    font-weight: 400;
    text-align: right;
  }
  .todo-reminder-editor__interval {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 120px;
    gap: 8px;
  }
  .todo-reminder-editor__error {
    margin: 0;
    color: var(--danger-color, #e5484d);
    font-size: 12px;
  }
  .todo-editor-form__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  /* 负 margin 抵消抽屉 body 的内边距，让底栏通栏压住滚动内容 */
  .todo-editor-form__actions.is-sticky {
    position: sticky;
    bottom: calc(-1 * var(--todo-editor-sticky-gutter, 14px));
    z-index: 1;
    margin: 4px calc(-1 * var(--todo-editor-sticky-gutter, 14px)) calc(-1 * var(--todo-editor-sticky-gutter, 14px));
    padding: 12px var(--todo-editor-sticky-gutter, 14px) calc(12px + env(safe-area-inset-bottom));
    border-top: 1px solid var(--surface-divider-color, var(--card-border-color));
    background: var(--card-background);
    box-shadow: 0 -8px 20px color-mix(in srgb, var(--text-color) 6%, transparent);
  }

  .todo-editor-form__actions.is-sticky .b_btn {
    min-height: 40px;
    flex: 1 1 0;
  }
  @media (max-width: 767px) {
    .todo-legacy-plan-banner {
      flex-direction: column;
    }
    .todo-legacy-plan-banner :deep(.b_btn) {
      width: 100%;
    }
    .todo-recurrence-editor__fields {
      grid-template-columns: 1fr;
    }
    .todo-recurrence-editor :deep(.b-select) {
      width: 100%;
    }
    .todo-editor-form__grid {
      grid-template-columns: 1fr;
    }
    .todo-editor-form__actions :deep(.b_btn) {
      flex: 1;
      width: auto;
    }
    .todo-checklist-editor {
      padding: 10px;
    }
    .todo-checklist-editor__header {
      align-items: center;
    }
    .todo-checklist-editor__row {
      grid-template-columns: auto minmax(0, 1fr);
    }
    .todo-checklist-editor__remove {
      grid-column: 2;
      justify-self: end;
    }
    .todo-reminder-editor__title {
      align-items: flex-start;
      flex-direction: column;
    }
    .todo-reminder-editor__title :deep(.b-select) {
      width: 100%;
    }
    .todo-reminder-editor__field-label {
      flex-wrap: wrap;
      row-gap: 3px;
    }
    .todo-reminder-editor__field-error {
      margin-left: auto;
    }
  }

  :global(html.light-note-android-webview) .todo-legacy-plan-banner.is-converting {
    border-color: var(--primary-color);
    background: var(--background-color);
  }

  .todo-description-field {
    position: relative;
  }

  /* 弹框内的选择面板铺满可用宽度,不保留浮层的固定窄宽 */
  .todo-resource-picker-modal {
    width: 100%;
    max-width: none;
    padding: 0;
  }

  /* 说明框位于弹框上部,向上弹会被 BModal 内容区裁掉,故改为向下展开 */
  .todo-mention-layer {
    position: absolute;
    /* 垂直固定在说明框下方(不遮输入内容);水平 left 由内联样式对齐触发的 @ */
    left: 0;
    top: calc(100% + 6px);
    width: max-content;
    max-width: 100%;
    z-index: 20;
    border: 1px solid var(--card-border-color);
    border-radius: 12px;
    background: var(--menu-body-bg-color, var(--card-background));
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.24);
    overflow: hidden;
  }

  .todo-description-hint {
    display: block;
    margin-top: 4px;
    color: var(--desc-color);
    font-size: 12px;
  }

  .todo-resource-refs {
    display: grid;
    gap: 6px;
    padding: 11px 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--workspace-panel-bg-color);
  }

  .todo-resource-refs__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .todo-resource-refs__label {
    color: var(--desc-color);
    font-size: 12px;
  }

  .todo-resource-refs__list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .todo-resource-chip {
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    gap: 6px;
    padding: 4px 6px 4px 8px;
    border: 1px solid var(--card-border-color);
    border-radius: 999px;
    background: color-mix(in srgb, var(--primary-color) 5%, var(--background-color));
    font-size: 12px;
  }

  .todo-resource-chip__type {
    flex: 0 0 auto;
    color: var(--primary-color);
  }

  .todo-resource-chip__title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-color);
  }

  .todo-resource-chip__remove {
    width: 18px;
    min-width: 18px;
    height: 18px;
    padding: 0;
    flex: 0 0 auto;
    border-radius: 50%;
    color: var(--desc-color);
    background: transparent !important;
    line-height: 1;
  }
</style>
