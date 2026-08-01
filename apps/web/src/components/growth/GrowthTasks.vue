<template>
  <div class="growth-tasks" :class="{ 'growth-tasks--compact': compact }">
    <header class="growth-tasks__header">
      <div>
        <h2>{{ t('growth.tasksTitle') }}</h2>
        <p v-if="!compact">{{ t('growth.tasksSubtitle') }}</p>
      </div>
      <span class="growth-tasks__progress">{{ t('growth.tasksProgress', progressLabel) }}</span>
    </header>

    <div class="growth-tasks__bar" aria-hidden="true">
      <span :style="{ width: `${progress}%` }"></span>
    </div>
    <p class="growth-tasks__remaining">
      {{ remainingLabel }}
    </p>

    <div v-if="visibleTasks.length" class="growth-tasks__list">
      <article
        v-for="task in visibleTasks"
        :key="task.taskKey"
        class="growth-task"
        :class="{
          'growth-task--completed': task.completed,
          'growth-task--claimable': task.claimable,
          'growth-task--claimed': task.claimed,
        }"
      >
        <span class="growth-task__marker" aria-hidden="true">{{ task.completed ? '✓' : '○' }}</span>
        <div class="growth-task__body">
          <strong>{{ t(task.titleKey) }}</strong>
          <span>{{ t(task.descriptionKey) }}</span>
        </div>
        <strong class="growth-task__reward">+{{ task.rewardExp }} EXP</strong>
        <BButton
          v-if="task.claimable && !readOnly"
          class="growth-task__claim"
          size="small"
          type="primary"
          :loading="claimingTaskKey === task.taskKey"
          :disabled="Boolean(claimingTaskKey)"
          @click="claimTask(task)"
        >
          {{ t('growth.tasksClaim') }}
        </BButton>
        <BButton
          v-else-if="!task.completed && !readOnly"
          class="growth-task__go"
          size="small"
          @click="navigateToTask(task)"
        >
          {{ t('growth.tasksGoTo') }}
        </BButton>
        <span v-else-if="task.claimed" class="growth-task__completed">{{ t('growth.tasksClaimed') }}</span>
        <span v-else-if="readOnly" class="growth-task__readonly">{{ t('growth.tasksReadOnly') }}</span>
        <span v-else class="growth-task__completed">{{ t('growth.tasksCompleted') }}</span>
      </article>
    </div>

    <div v-else class="growth-tasks__empty">{{ t('growth.tasksAllDone') }}</div>

    <BButton v-if="showViewAll" class="growth-tasks__action" size="small" @click="$emit('view')">
      {{ t('growth.tasksViewAll') }}
    </BButton>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import { useGrowth, type GrowthTask, type GrowthTasksData } from '@/composables/useGrowth.ts';
  import { bookmarkStore } from '@/store';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { recordOperation } from '@/api/commonApi.ts';

  const props = withDefaults(
    defineProps<{
      data: GrowthTasksData | null;
      compact?: boolean;
      maxVisible?: number;
      showViewAll?: boolean;
      showCompleted?: boolean;
      readOnly?: boolean;
    }>(),
    { compact: false, maxVisible: 99, showViewAll: false, showCompleted: false, readOnly: false },
  );
  defineEmits<{ (event: 'view'): void }>();
  const { t } = useI18n();
  const router = useRouter();
  const bookmark = bookmarkStore();
  const { claimGrowthTask } = useGrowth();
  const claimingTaskKey = ref<string | null>(null);

  const allTasks = computed<GrowthTask[]>(() => props.data?.tasks || []);
  const pendingTasks = computed<GrowthTask[]>(() => (props.data?.tasks || []).filter((task) => !task.completed));
  const activeTasks = computed<GrowthTask[]>(() => (props.data?.tasks || []).filter((task) => !task.claimed));
  const visibleTasks = computed(() => {
    const tasks = props.showCompleted ? allTasks.value : activeTasks.value;
    return tasks.slice(0, Math.max(0, props.maxVisible));
  });
  const totalCount = computed(() => Number(props.data?.totalCount || 0));
  const completedCount = computed(() => Number(props.data?.completedCount || 0));
  const remainingCount = computed(() => Number(props.data?.remainingCount ?? pendingTasks.value.length));
  const claimableCount = computed(
    () => Number(props.data?.claimableCount ?? allTasks.value.filter((task) => task.claimable).length),
  );
  const progress = computed(() => (totalCount.value ? Math.round((completedCount.value / totalCount.value) * 100) : 0));
  const progressLabel = computed(() => ({ completed: completedCount.value, total: totalCount.value }));
  const remainingLabel = computed(() => {
    if (claimableCount.value > 0) return t('growth.tasksClaimable', { n: claimableCount.value });
    if (remainingCount.value > 0) return t('growth.tasksRemaining', { n: remainingCount.value });
    return t('growth.tasksAllDone');
  });

  async function claimTask(task: GrowthTask) {
    if (props.readOnly || claimingTaskKey.value || !task.claimable) return;
    claimingTaskKey.value = task.taskKey;
    try {
      const res = await claimGrowthTask(task.taskKey);
      if (res?.status === 200 && res.data?.ok) {
        if (res.data.already) {
          message.info(t('growth.tasksClaimedAlready'));
        } else {
          message.success(t('growth.tasksClaimOk', { n: res.data.expGained || task.rewardExp }));
          recordOperation({
            module: '成长',
            operation: `领取成长任务 ${task.taskKey}（经验+${res.data.expGained || task.rewardExp}）`,
          });
        }
      } else if (res?.data?.reason === 'incomplete') {
        message.info(t('growth.tasksClaimIncomplete'));
      }
    } catch (error) {
      console.error('领取成长任务失败:', error);
    } finally {
      claimingTaskKey.value = null;
    }
  }

  function navigateToTask(task: GrowthTask) {
    switch (task.taskKey) {
      case 'profile_avatar':
        if (bookmark.isMobile) {
          void router.push('/myInfo');
        } else {
          // 桌面端个人资料是头像菜单里的弹窗，没有独立页面路由。
          window.dispatchEvent(new CustomEvent('light-note:open-profile'));
        }
        break;
      case 'first_note':
        void router.push('/noteLibrary');
        break;
      case 'first_bookmark':
        void router.push('/home');
        break;
      case 'first_todo':
        void router.push({ path: '/inbox', query: { tab: 'todo' } });
        break;
      default:
        break;
    }
  }
</script>

<style scoped lang="less">
  .growth-tasks {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .growth-tasks__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  h2 {
    margin: 0;
    color: var(--text-color);
    font-size: 16px;
    font-weight: 700;
  }

  .growth-tasks__header p,
  .growth-tasks__remaining {
    margin: 4px 0 0;
    color: var(--desc-color);
    font-size: 12px;
  }

  .growth-tasks__progress {
    flex: 0 0 auto;
    color: var(--primary-color);
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
  }

  .growth-tasks__bar {
    height: 6px;
    overflow: hidden;
    border-radius: 999px;
    background: color-mix(in srgb, var(--primary-color) 12%, var(--workbench-subcard-bg));
  }

  .growth-tasks__bar span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--primary-color);
    transition: width 0.2s ease;
  }

  .growth-tasks__list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .growth-task {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 40%, transparent);
    border-radius: 10px;
    background: var(--background-color);
  }

  .growth-task--completed {
    border-color: color-mix(in srgb, var(--primary-color) 30%, var(--card-border-color));
    background: color-mix(in srgb, var(--primary-color) 5%, var(--background-color));
  }

  .growth-task--claimed {
    border-color: color-mix(in srgb, #34d399 30%, var(--card-border-color));
    background: color-mix(in srgb, #34d399 6%, var(--background-color));
  }

  .growth-task__marker {
    width: 22px;
    text-align: center;
    flex: 0 0 auto;
    color: var(--primary-color);
    font-size: 20px;
    line-height: 1;
  }

  .growth-task--completed .growth-task__marker {
    color: var(--primary-color);
    font-size: 16px;
    font-weight: 700;
  }

  .growth-task--claimed .growth-task__marker {
    color: #10b981;
    font-size: 16px;
    font-weight: 700;
  }

  .growth-task__body {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
  }

  .growth-task__body strong {
    overflow: hidden;
    color: var(--text-color);
    font-size: 13px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .growth-task__body span {
    overflow: hidden;
    color: var(--desc-color);
    font-size: 11.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .growth-task__reward {
    flex: 0 0 auto;
    color: #d97706;
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
  }

  .growth-task__go {
    flex: 0 0 auto;
    min-width: 54px;
    padding: 4px 9px;
    border: 1px solid color-mix(in srgb, var(--primary-color) 35%, transparent);
    border-radius: 7px;
    color: var(--primary-color);
    font-size: 11.5px;
  }

  .growth-task__claim {
    flex: 0 0 auto;
    min-width: 54px;
  }

  .growth-task__completed,
  .growth-task__readonly {
    flex: 0 0 auto;
    font-size: 11.5px;
    white-space: nowrap;
  }

  .growth-task__completed {
    color: #10b981;
    font-weight: 600;
  }

  .growth-task__readonly {
    color: var(--desc-color);
  }

  .growth-tasks__empty {
    padding: 13px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--primary-color) 7%, var(--workbench-subcard-bg));
    color: var(--desc-color);
    font-size: 13px;
    text-align: center;
  }

  .growth-tasks__action {
    align-self: flex-start;
    border: 1px solid color-mix(in srgb, var(--primary-color) 35%, transparent);
    color: var(--primary-color);
  }

  .growth-tasks--compact {
    gap: 9px;
  }

  .growth-tasks--compact .growth-task {
    padding: 9px 10px;
  }
</style>
