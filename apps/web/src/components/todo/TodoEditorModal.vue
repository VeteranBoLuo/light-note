<template>
  <BDrawer
    :open="visible === true"
    :title="shellTitle"
    :placement="bookmark.isMobile ? 'bottom' : 'right'"
    :height="bookmark.isMobile ? '92dvh' : undefined"
    width="min(720px, 90vw)"
    :body-padding="bookmark.isMobile ? '14px' : '20px'"
    :mask-closable="false"
    @close="close"
  >
    <div class="todo-editor-shell" :style="{ '--todo-editor-sticky-gutter': bookmark.isMobile ? '14px' : '20px' }">
      <TodoEditorForm
        :item="item"
        :initial-values="initialValues"
        :saving="saving"
        :reset-key="formKey"
        :mobile-wizard="bookmark.isMobile"
        :v2-enabled="todoPlanFeatures.enabled"
        :legacy-conversion-enabled="todoPlanFeatures.conversionEnabled"
        sticky-actions
        @submit="save"
        @cancel="close"
      />
    </div>
  </BDrawer>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import TodoEditorForm from '@/components/todo/TodoEditorForm.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import {
    createTodo,
    createTodoPlanV2,
    convertLegacyTodoPlanV2,
    getTodoPlanV2Config,
    updateTodo,
    updateTodoPlanV2,
    type TodoEditorSubmission,
    type TodoItem,
    type TodoPayload,
    type TodoPlanFeatureState,
  } from '@/api/todoApi';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import { bookmarkStore } from '@/store';

  const props = defineProps<{
    item?: TodoItem | null;
    initialValues?: Partial<Pick<TodoPayload, 'title' | 'description' | 'priority' | 'dueAt' | 'checklist'>>;
  }>();
  const visible = defineModel<boolean>('visible');
  const emit = defineEmits<{
    saved: [result: { id: string; title: string }];
    closed: [];
  }>();
  const { t } = useI18n();
  const bookmark = bookmarkStore();
  const saving = ref(false);
  const formKey = ref(0);
  const todoPlanFeatures = ref<TodoPlanFeatureState>({
    enabled: true,
    schedulerEnabled: true,
    aiEnabled: true,
    conversionEnabled: true,
  });

  const shellTitle = computed(() => (props.item ? t('inbox.editTodo') : t('inbox.createTodo')));

  watch(visible, async (open) => {
    if (!open) return;
    try {
      const response = await getTodoPlanV2Config();
      if (response.status === 200 && response.data) todoPlanFeatures.value = response.data as TodoPlanFeatureState;
    } catch {
      // 配置查询失败时保留随版本发布的默认值；后端仍会做最终开关校验。
    }
    if (visible.value) formKey.value += 1;
  });

  async function save(submission: TodoEditorSubmission) {
    // 打开表单只是浏览与填写，不应把游客挡在填写前；仅在真正提交写入时提示注册。
    if (saving.value || blockGuestWrite(props.item ? 'todo-update' : 'todo-create', t('inbox.guestPrompt'))) return;
    saving.value = true;
    try {
      const res =
        submission.kind === 'v2'
          ? submission.convertLegacyTodoId
            ? await convertLegacyTodoPlanV2(submission.convertLegacyTodoId, submission.payload)
            : props.item?.planVersion === 2
              ? await updateTodoPlanV2(props.item.id, submission.scope, submission.payload)
              : await createTodoPlanV2(submission.payload)
          : props.item
            ? await updateTodo(props.item.id, submission.payload)
            : await createTodo(submission.payload);
      if (res.status !== 200) throw new Error(res.msg || t('inbox.todoSaveFailed'));
      message.success(t('inbox.todoSaved'));
      emit('saved', {
        id: String(res.data?.todoId || res.data?.id || props.item?.id || ''),
        title: submission.payload.title,
      });
      visible.value = false;
    } catch (error: any) {
      message.error(error?.message || t('inbox.todoSaveFailed'));
    } finally {
      saving.value = false;
    }
  }

  function close() {
    if (saving.value) return;
    visible.value = false;
    emit('closed');
  }
</script>

<style scoped lang="less">
  .todo-editor-shell {
    min-width: 0;
  }
</style>
