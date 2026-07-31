<template>
  <!--
    待办表单在手机上有 7 个字段区块，居中弹框滚到中间就看不见「保存」了。
    移动端改用底部抽屉：标题与操作区固定、中间滚动；桌面端保持原有弹框。
    外壳用动态组件切换，表单本身只写一次。
  -->
  <component :is="shellComponent" v-bind="shellProps" @close="close" @update:visible="syncVisible">
    <TodoEditorForm
      :item="item"
      :saving="saving"
      :reset-key="formKey"
      :sticky-actions="bookmark.isMobile"
      @submit="save"
      @cancel="close"
    />
  </component>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import TodoEditorForm from '@/components/todo/TodoEditorForm.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { createTodo, updateTodo, type TodoItem, type TodoPayload } from '@/api/todoApi';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import { bookmarkStore } from '@/store';

  const props = defineProps<{ item?: TodoItem | null }>();
  const visible = defineModel<boolean>('visible');
  const emit = defineEmits<{ saved: [result: { id: string; title: string }] }>();
  const { t } = useI18n();
  const bookmark = bookmarkStore();
  const saving = ref(false);
  const formKey = ref(0);

  const shellTitle = computed(() => (props.item ? t('inbox.editTodo') : t('inbox.createTodo')));
  const shellComponent = computed(() => (bookmark.isMobile ? BDrawer : BModal));
  // 抽屉用 open + @close，弹框用 v-model:visible；两套 props 在这里收敛
  const shellProps = computed(() =>
    bookmark.isMobile
      ? {
          open: visible.value === true,
          title: shellTitle.value,
          placement: 'bottom' as const,
          height: '92dvh',
          bodyPadding: '14px',
          maskClosable: false,
        }
      : {
          visible: visible.value,
          title: shellTitle.value,
          showFooter: false,
          width: 'min(720px, 94vw)',
          maskClosable: false,
        },
  );

  function syncVisible(next: boolean) {
    visible.value = next;
  }

  watch(visible, (open) => {
    if (open) formKey.value += 1;
  });

  async function save(payload: TodoPayload) {
    // 打开表单只是浏览与填写，不应把游客挡在填写前；仅在真正提交写入时提示注册。
    if (saving.value || blockGuestWrite(props.item ? 'todo-update' : 'todo-create', t('inbox.guestPrompt'))) return;
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
