<template>
  <component
    :is="mobile ? BDrawer : BModal"
    :title="t('growth.leaderboard.rules')"
    v-bind="overlayProps"
    @close="emit('close')"
  >
    <div class="leaderboard-rules">
      <p>{{ t('growth.leaderboard.rulesGross') }}</p>
      <table>
        <thead>
          <tr>
            <th scope="col">{{ t('growth.leaderboard.source') }}</th>
            <th v-for="board in boards" :key="board" scope="col">{{ t('growth.leaderboard.' + board) }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="source in sources" :key="source.label">
            <th scope="row">{{ t('growth.leaderboard.' + source.label) }}</th>
            <td v-for="board in boards" :key="board" :class="{ included: source.boards.includes(board) }">
              {{ source.boards.includes(board) ? t('growth.leaderboard.included') : '—' }}
            </td>
          </tr>
        </tbody>
      </table>
      <ul>
        <li>{{ t('growth.leaderboard.rulesManorSale') }}</li>
        <li>{{ t('growth.leaderboard.rulesCycle') }}</li>
        <li>{{ t('growth.leaderboard.rulesDays') }}</li>
        <li>{{ t('growth.leaderboard.rulesPrizes', { score: rules.minimumScore, days: rules.minimumDays }) }}</li>
        <li>{{ t('growth.leaderboard.rulesIdentity', { limit: rules.limit }) }}</li>
      </ul>
    </div>
  </component>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { LeaderboardData, LeaderboardType } from '@/api/pointsLeaderboardApi';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';

  const props = defineProps<{ mobile: boolean; open: boolean; rules: LeaderboardData['rules'] }>();
  const emit = defineEmits<{ close: [] }>();
  const { t } = useI18n();
  const boards: LeaderboardType[] = ['week', 'month', 'total'];
  const sources = [
    { label: 'sourceTasks', boards },
    { label: 'cropSale', boards },
    { label: 'sourceAquarium', boards },
    { label: 'sourceMilestones', boards: ['total'] },
    { label: 'sourceExcluded', boards: [] },
  ];
  const overlayProps = computed(() => props.mobile
    ? { open: props.open, placement: 'bottom' as const }
    : { visible: props.open, showFooter: false });
</script>

<style scoped lang="less">
  .leaderboard-rules {
    font-size: var(--ui-font-13, 13px);
    line-height: 1.55;

    p { margin: 0; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: var(--ui-space-12, 12px) 0;
    }
    th, td {
      border-bottom: 1px solid var(--workspace-divider);
      padding: var(--ui-space-6, 6px);
      font-weight: 500;
      text-align: start;
    }
    thead { background: var(--workspace-canvas); }
    td, thead th:not(:first-child) {
      text-align: center;
      white-space: nowrap;
    }
    td.included {
      color: var(--chip-success-fg);
      font-weight: 650;
    }
    ul { margin: 0; padding-inline-start: var(--ui-space-18, 18px); }
    li + li { margin-top: var(--ui-space-5, 5px); }
  }
</style>
