<template>
  <section class="tag-todo-panel" :aria-label="t('todoWorkspace.tagTodos')">
    <BTabs v-model:active-tab="status" :options="options" variant="pill" />
    <p v-if="failed" role="alert"
      >{{ t('todoWorkspace.loadFailed') }} <BButton @click="load(false)">{{ t('common.retry') }}</BButton></p
    >
    <BLoading v-if="loading && !items.length" loading inline :title="t('common.loading')" />
    <p v-else-if="!items.length && !failed">{{ t('todoWorkspace.empty') }}</p>
    <BButton
      v-for="item in items"
      :key="item.id"
      block
      class="tag-todo-panel__row"
      @click="router.push({ path: '/inbox', query: { tab: 'todo', todoId: item.id } })"
    >
      <SvgIcon
        :src="item.status === 'completed' ? icon.todoWorkspace.checkSquare : icon.todoWorkspace.calendar"
        size="18"
      />
      <span :class="{ completed: item.status === 'completed' }">{{ item.title }}</span>
      <small v-if="item.list">{{ item.list.name }}</small>
      <small>{{ t(item.status === 'completed' ? 'inbox.todoCompleted' : 'inbox.todoPending') }}</small>
    </BButton>
    <BButton v-if="nextCursor" :loading="loading" @click="load(true)">{{ t('todoWorkspace.more') }}</BButton>
  </section>
</template>
<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue';
  import { useRouter } from 'vue-router';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { getTodoWorkspace, type TodoItem, type TodoFilterStatus } from '@/api/todoApi';
  import useTodoStore from '@/store/todo';
  import useUserStore from '@/store/useUser';
  const props = defineProps<{ tagId: string }>();
  const user = useUserStore();
  const store = useTodoStore();
  const router = useRouter();
  const { t } = useI18n();
  const status = ref<TodoFilterStatus>('pending'),
    items = ref<TodoItem[]>([]),
    nextCursor = ref<string | null>(null),
    loading = ref(false),
    failed = ref(false);
  const totals = ref({ pending: 0, completed: 0, all: 0 });
  let sequence = 0;
  const options = computed(() =>
    (['pending', 'completed', 'all'] as const).map((key) => ({
      key,
      label: t(key === 'all' ? 'inbox.all' : key === 'pending' ? 'inbox.todoPending' : 'inbox.todoCompleted'),
      badge: totals.value[key],
    })),
  );
  async function load(append = false) {
    if (append && loading.value) return;
    const current = ++sequence;
    loading.value = true;
    failed.value = false;
    try {
      const res = await getTodoWorkspace({
        tagIds: [props.tagId],
        status: status.value,
        limit: 20,
        cursor: append ? nextCursor.value : null,
      });
      if (current !== sequence) return;
      if (res.status !== 200) throw new Error('load');
      items.value = append ? [...items.value, ...res.data.items] : res.data.items;
      nextCursor.value = res.data.nextCursor;
      totals.value = res.data.statusTotals;
    } catch {
      if (current === sequence) failed.value = true;
    } finally {
      if (current === sequence) loading.value = false;
    }
  }
  watch(
    () => [props.tagId, status.value, user.id, store.organizationEpoch],
    () => {
      items.value = [];
      nextCursor.value = null;
      void load();
    },
    { immediate: true },
  );
  onBeforeUnmount(() => sequence++);
</script>
<style scoped lang="less">
  .tag-todo-panel {
    display: grid;
    gap: 12px;
    padding: 18px;
    background: var(--card-background);
    border: 1px solid var(--border-color);
    border-radius: 12px;
  }
  .tag-todo-panel__row {
    width: 100%;
    background: transparent;
    border: 1px solid var(--border-color);
    display: flex;
    gap: 10px;
    min-height: 52px;
    height: auto;
    text-align: left;
  }
  .tag-todo-panel__row span {
    flex: 1;
    min-width: 0;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .tag-todo-panel__row small {
    color: var(--desc-color);
  }
  .tag-todo-panel__row .completed {
    text-decoration: line-through;
    color: var(--desc-color);
  }
</style>
