<template>
  <main class="todo-create-page">
    <header class="todo-create-page__header">
      <BButton class="todo-create-page__back" :aria-label="t('common.back')" @click="leave">
        <SvgIcon :src="icon.arrow_left" size="20" aria-hidden="true" />
      </BButton>
      <h1>{{ t('inbox.createTodo') }}</h1>
      <span aria-hidden="true"></span>
    </header>
    <div v-auto-scrollbar class="todo-create-page__body">
      <TodoSimpleEditorForm
        mobile
        :initial-values="initialValues"
        :saving="saving"
        :advanced-enabled="todoPlanFeatures.independentTaskAdvancedEnabled"
        @submit="save"
        @cancel="leave"
      />
    </div>
  </main>
</template>

<script setup lang="ts">
  import { onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import TodoSimpleEditorForm from '@/components/todo/TodoSimpleEditorForm.vue';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import {
    createTodoPlanV2,
    getTodoPlanV2Config,
    type TodoCreateInitialValues,
    type TodoEditorSubmission,
    type TodoPlanFeatureState,
  } from '@/api/todoApi';
  import icon from '@/config/icon';

  const { t } = useI18n();
  const router = useRouter();
  const saving = ref(false);
  const initialValues = (router.options.history.state.todoInitialValues || {}) as TodoCreateInitialValues;
  const todoPlanFeatures = ref<TodoPlanFeatureState>({
    enabled: true,
    schedulerEnabled: true,
    aiEnabled: true,
    conversionEnabled: true,
    simpleCreateEnabled: true,
    singleTaskScheduleEnabled: true,
    independentTaskAdvancedEnabled: true,
    quickReminderPresetsEnabled: true,
  });

  onMounted(async () => {
    try {
      const response = await getTodoPlanV2Config();
      if (response.status === 200 && response.data) {
        todoPlanFeatures.value = { ...todoPlanFeatures.value, ...(response.data as Partial<TodoPlanFeatureState>) };
      }
    } catch {
      // 保留随版本发布的默认值，后端仍会做最终功能开关校验。
    }
  });

  function leave() {
    if (saving.value) return;
    if (typeof router.options.history.state.back === 'string') {
      router.back();
      return;
    }
    void router.replace({ name: 'inbox', query: { tab: 'todo' } });
  }

  async function save(submission: TodoEditorSubmission) {
    if (submission.kind !== 'v2' || saving.value || blockGuestWrite('todo-create', t('inbox.guestPrompt'))) {
      return;
    }
    saving.value = true;
    try {
      const response = await createTodoPlanV2(submission.payload);
      if (response.status !== 200) throw new Error(response.msg || t('inbox.todoSaveFailed'));
      message.success(t('inbox.todoSaved'));
      await router.replace({ name: 'inbox', query: { tab: 'todo' } });
    } catch (error: any) {
      message.error(error?.message || t('inbox.todoSaveFailed'));
    } finally {
      saving.value = false;
    }
  }
</script>

<style scoped lang="less">
  .todo-create-page {
    width: 100%;
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: var(--text-color);
    background: var(--surface-page-bg, var(--background-color));
  }

  .todo-create-page__header {
    position: relative;
    min-height: calc(56px + env(safe-area-inset-top));
    padding: env(safe-area-inset-top) 12px 0;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) 44px;
    align-items: center;
    flex: 0 0 auto;
    border-bottom: 1px solid var(--surface-divider-color);
    background: var(--card-background);
  }

  .todo-create-page__header h1 {
    margin: 0;
    overflow: hidden;
    color: var(--text-color);
    font-size: 18px;
    font-weight: 700;
    line-height: 1;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .todo-create-page__back {
    width: 44px;
    min-width: 44px;
    height: 44px;
    padding: 0;
    color: var(--text-color);
    background: transparent !important;
  }

  .todo-create-page__body {
    min-height: 0;
    flex: 1 1 auto;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  @media (min-width: 768px) {
    .todo-create-page__body {
      width: min(760px, 100%);
      margin: 0 auto;
    }
  }
</style>
