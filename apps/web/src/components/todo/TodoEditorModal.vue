<template>
  <BModal
    v-model:visible="visible"
    :title="item ? t('inbox.editTodo') : t('inbox.createTodo')"
    :show-footer="false"
    width="min(720px, 94vw)"
    :mask-closable="false"
    @close="close"
  >
    <TodoEditorForm :item="item" :saving="saving" :reset-key="formKey" @submit="save" @cancel="close" />
  </BModal>
</template>

<script setup lang="ts">
  import { ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import TodoEditorForm from '@/components/todo/TodoEditorForm.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { createTodo, updateTodo, type TodoItem, type TodoPayload } from '@/api/todoApi';

  const props = defineProps<{ item?: TodoItem | null }>();
  const visible = defineModel<boolean>('visible');
  const emit = defineEmits<{ saved: [result: { id: string; title: string }] }>();
  const { t } = useI18n();
  const saving = ref(false);
  const formKey = ref(0);

  watch(visible, (open) => {
    if (open) formKey.value += 1;
  });

  async function save(payload: TodoPayload) {
    if (saving.value) return;
    saving.value = true;
    try {
      const res = props.item ? await updateTodo(props.item.id, payload) : await createTodo(payload);
      if (res.status !== 200) throw new Error(res.msg || t('inbox.todoSaveFailed'));
      message.success(t('inbox.todoSaved'));
      emit('saved', {
        id: String(props.item?.id || res.data?.id || ''),
        title: payload.title,
      });
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
