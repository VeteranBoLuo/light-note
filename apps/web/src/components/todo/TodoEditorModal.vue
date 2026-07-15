<template>
  <BModal v-model:visible="visible" :title="item ? t('inbox.editTodo') : t('inbox.createTodo')" :show-footer="false" width="min(560px, 92vw)" @close="close">
    <div class="todo-editor">
      <label>
        <span>{{ t('inbox.todoTitle') }}</span>
        <BInput v-model:value="form.title" :maxlength="200" :placeholder="t('inbox.todoTitlePlaceholder')" />
      </label>
      <label>
        <span>{{ t('inbox.todoDescription') }}</span>
        <BInput v-model:value="form.description" type="textarea" :rows="3" :maxlength="2000" :placeholder="t('inbox.todoDescriptionPlaceholder')" />
      </label>
      <label>
        <span>{{ t('inbox.todoChecklist') }}</span>
        <BInput v-model:value="checklistText" type="textarea" :rows="4" :maxlength="10000" :placeholder="t('inbox.todoChecklistPlaceholder')" />
      </label>
      <div class="todo-editor__grid">
        <label>
          <span>{{ t('inbox.todoPriority') }}</span>
          <BSelect v-model:value="form.priority" :options="priorityOptions" />
        </label>
        <label>
          <span>{{ t('inbox.todoDueAt') }}</span>
          <BInput v-model:value="form.dueAt" type="datetime-local" />
        </label>
        <label>
          <span>{{ t('inbox.todoReminderAt') }}</span>
          <BInput v-model:value="form.reminderAt" type="datetime-local" />
        </label>
      </div>
      <p class="todo-editor__hint">{{ t('inbox.todoReminderHint') }}</p>
      <div class="todo-editor__actions">
        <BButton @click="close">{{ t('common.cancel') }}</BButton>
        <BButton type="primary" :loading="saving" :disabled="!form.title.trim()" @click="save">
          {{ t('common.save') }}
        </BButton>
      </div>
    </div>
  </BModal>
</template>

<script setup lang="ts">
  import { computed, reactive, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { createTodo, updateTodo, type TodoItem, type TodoPriority } from '@/api/todoApi';
  import { generateUUID } from '@/utils/common';

  const props = defineProps<{ item?: TodoItem | null }>();
  const visible = defineModel<boolean>('visible');
  const emit = defineEmits<{ saved: [] }>();
  const { t } = useI18n();
  const saving = ref(false);
  const checklistText = ref('');
  const form = reactive({ title: '', description: '', priority: 1 as TodoPriority, dueAt: '', reminderAt: '' });
  const priorityOptions = computed(() => [0, 1, 2].map((value) => ({ value, label: t(`inbox.todoPriority${value}`) })));

  watch(visible, (open) => {
    if (!open) return;
    form.title = props.item?.title || '';
    form.description = props.item?.description || '';
    form.priority = props.item?.priority ?? 1;
    form.dueAt = toLocalInput(props.item?.dueAt);
    form.reminderAt = toLocalInput(props.item?.reminderAt);
    checklistText.value = (props.item?.checklist || []).map((item) => item.text).join('\n');
  });

  function toLocalInput(value?: string | null) {
    if (!value) return '';
    const normalized = String(value).replace(' ', 'T');
    const date = new Date(normalized);
    if (!Number.isFinite(date.getTime())) return String(value).replace(' ', 'T').slice(0, 16);
    const offset = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  }

  async function save() {
    if (!form.title.trim() || saving.value) return;
    saving.value = true;
    try {
      const oldItems = props.item?.checklist || [];
      const checklist = checklistText.value.split(/\r?\n/).map((text) => text.trim()).filter(Boolean).slice(0, 50).map((text, index) => ({
        id: oldItems[index]?.id || generateUUID(),
        text,
        done: oldItems[index]?.text === text ? oldItems[index].done : false,
      }));
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        priority: form.priority,
        checklist,
        dueAt: form.dueAt || null,
        reminderAt: form.reminderAt || null,
      };
      const res = props.item ? await updateTodo(props.item.id, payload) : await createTodo(payload);
      if (res.status !== 200) throw new Error(res.msg || t('inbox.todoSaveFailed'));
      message.success(t('inbox.todoSaved'));
      emit('saved');
      visible.value = false;
    } catch (error: any) {
      message.error(error?.message || t('inbox.todoSaveFailed'));
    } finally {
      saving.value = false;
    }
  }

  function close() {
    if (!saving.value) visible.value = false;
  }
</script>

<style scoped lang="less">
  .todo-editor { display: flex; flex-direction: column; gap: 14px; color: var(--text-color); }
  .todo-editor label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
  .todo-editor__grid { display: grid; grid-template-columns: 1fr 1.3fr 1.3fr; gap: 10px; }
  .todo-editor__hint { margin: -6px 0 0; color: var(--desc-color); font-size: 12px; }
  .todo-editor__actions { display: flex; justify-content: flex-end; gap: 8px; }
  @media (max-width: 767px) {
    .todo-editor__grid { grid-template-columns: 1fr; }
    .todo-editor__actions :deep(.b_btn) { flex: 1; width: auto; }
  }
</style>
