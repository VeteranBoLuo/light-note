<template>
  <BCard
    as="section"
    padding="0"
    class="leaderboard-list"
    :class="{ 'is-bounded': bounded, 'leaderboard-list--mobile': mobile }"
    :aria-label="title"
    :aria-busy="loading"
  >
    <header class="list-heading">
      <h3><SvgIcon :src="icon.growth.rank" size="18" class="list-title-icon" aria-hidden="true" />{{ title }}</h3>
      <span v-if="data && data.phase !== 'closing'">
        {{ t(data.phase === 'settled' ? 'growth.leaderboard.frozenCount' : 'growth.leaderboard.playerCount', { n: data.total }) }}
        · {{ t('growth.leaderboard.topLimit', { n: data.rules.limit }) }}
      </span>
    </header>
    <div v-if="loading && !data" class="list-state"><BLoading inline :loading="true" :title="t('growth.leaderboard.loading')" /></div>
    <div v-else-if="error" class="list-state" role="alert">
      <SvgIcon :src="icon.message.warning" size="24" aria-hidden="true" />
      <strong>{{ t('growth.leaderboard.failed') }}</strong>
      <BButton @click="emit('retry')">{{ t('common.retry') }}</BButton>
    </div>
    <div v-else-if="data?.phase === 'closing'" class="list-state" role="status">
      <SvgIcon :src="icon.common.time" size="24" aria-hidden="true" />
      <strong>{{ t('growth.leaderboard.closing') }}</strong>
      <span>{{ t('growth.leaderboard.closingHint') }}</span>
      <BButton @click="emit('retry')">{{ t('common.refresh') }}</BButton>
    </div>
    <div v-else-if="!data?.rows.length" class="list-state">
      <span class="empty-mark" aria-hidden="true"><SvgIcon :src="icon.growth.trophy" size="34" /></span>
      <strong>{{ t('growth.leaderboard.empty') }}</strong>
      <span v-if="data?.phase !== 'settled'" class="empty-hint">
        {{ t(data?.canParticipate === false ? 'growth.leaderboard.emptyViewerHint' : 'growth.leaderboard.startHint') }}
      </span>
    </div>
    <template v-else>
      <MobileListSurface
        v-if="mobile"
        ref="mobileSurface"
        v-auto-scrollbar
        class="rank-mobile"
        :tabindex="bounded ? 0 : undefined"
        :aria-label="title"
      >
        <MobileListRow
          v-for="row in data.rows"
          :key="row.rank"
          :selected="!('unavailable' in row) && row.isMe"
        >
          <template #leading>
            <span class="place" :data-place="row.rank">
              <SvgIcon v-if="row.rank <= 3" :src="icon.growth.medal" size="13" aria-hidden="true" />{{ row.rank }}
            </span>
          </template>
          <span v-if="'unavailable' in row" class="muted">{{ t('growth.leaderboard.placeReserved') }}</span>
          <LeaderboardIdentity v-else :entry="row" @profile="openProfile">
            <template v-if="weekly">
              <span>{{ t('growth.leaderboard.effectiveDaysValue', { n: row.activeDays }) }}</span>
              <span :class="{ qualified: row.qualified }">{{ qualificationLabel(row) }}</span>
            </template>
          </LeaderboardIdentity>
          <template #trailing>
            <strong class="rank-score">{{ 'unavailable' in row ? '—' : number(row.score) }}</strong>
          </template>
        </MobileListRow>
      </MobileListSurface>
      <BTable
        v-else
        class="rank-desktop"
        :class="{ 'is-weekly': weekly }"
        :fill="bounded"
        :columns="columns"
        :data="data.rows"
        row-key="rank"
        :row-class="(record) => record.isMe === true ? 'is-self' : undefined"
      >
        <template #bodyCell="{ record, column }">
          <span
            v-if="column.key === 'rank'"
            class="place"
            :data-place="record.rank"
          >
            <SvgIcon v-if="record.rank <= 3" :src="icon.growth.medal" size="13" aria-hidden="true" />{{ record.rank }}
          </span>
          <template v-else-if="column.key === 'player'">
            <span v-if="record.unavailable" class="muted">{{ t('growth.leaderboard.placeReserved') }}</span>
            <LeaderboardIdentity v-else :entry="record" @profile="openProfile" />
          </template>
          <span v-else-if="column.key === 'days'" class="muted">
            {{ record.unavailable ? '—' : t('growth.leaderboard.daysValue', { n: record.activeDays }) }}
          </span>
          <strong v-else-if="column.key === 'score'" class="rank-score">
            {{ record.unavailable ? '—' : number(record.score) }}
          </strong>
          <span v-else :class="record.qualified ? 'qualified' : 'muted'">
            {{ record.unavailable ? '—' : qualificationLabel(record) }}
          </span>
        </template>
      </BTable>
      <p v-if="data.phase === 'settled'" class="list-foot">{{ t('growth.leaderboard.historyHint') }}</p>
    </template>
  </BCard>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { LeaderboardData, LeaderboardEntry } from '@/api/pointsLeaderboardApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { useDensityScrollAnchor } from '@/composables/useDensityScrollAnchor';
  import icon from '@/config/icon';
  import type { Column } from '@/components/base/BasicComponents/BTable/config';
  import MobileListRow from '@/components/mobile/MobileListRow.vue';
  import MobileListSurface from '@/components/mobile/MobileListSurface.vue';
  import LeaderboardIdentity from './LeaderboardIdentity.vue';

  const props = defineProps<{
    title: string;
    data: LeaderboardData | null;
    weekly: boolean;
    mobile: boolean;
    bounded: boolean;
    loading: boolean;
    error: boolean;
  }>();
  const emit = defineEmits<{ retry: []; profile: [communityId: string, trigger: HTMLElement] }>();
  function openProfile(communityId: string, trigger: HTMLElement) {
    emit('profile', communityId, trigger);
  }
  const { t, locale } = useI18n();
  const mobileSurface = ref<InstanceType<typeof MobileListSurface> | null>(null);
  useDensityScrollAnchor(computed(() => mobileSurface.value?.$el ?? null));
  const formatter = computed(() => new Intl.NumberFormat(locale.value));
  const number = (value: number) => formatter.value.format(value);
  const columns = computed<Column[]>(() => {
    const result: Column[] = [
      { key: 'rank', title: t('growth.leaderboard.rank'), width: 56 },
      { key: 'player', title: t('growth.leaderboard.player') },
    ];
    if (props.weekly) result.push({ key: 'days', title: t('growth.leaderboard.days'), width: 92 });
    result.push({ key: 'score', title: t('growth.leaderboard.score'), width: 80 });
    if (props.weekly) result.push({ key: 'qualification', title: t('growth.leaderboard.qualification'), width: 112 });
    return result;
  });

  function qualificationLabel(row: LeaderboardEntry) {
    return t(row.qualified ? 'growth.leaderboard.qualified' : 'growth.leaderboard.notQualified');
  }
</script>

<style scoped lang="less">
  .leaderboard-list {
    overflow: hidden;
    font-variant-numeric: tabular-nums;
  }

  .leaderboard-list.is-bounded {
    display: flex;
    flex-direction: column;
    align-self: stretch;
    min-height: 0;

    > * { flex: none; }
    .rank-desktop, .rank-mobile {
      flex: 1 1 0;
      min-height: 0;
    }
    .rank-mobile {
      overflow-y: auto;
      overscroll-behavior-y: contain;
    }
    .rank-desktop :deep(.table-body) { overscroll-behavior-y: contain; }
  }

  .list-heading {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-6, 6px) var(--ui-space-12, 12px);
    padding: var(--ui-space-14, 14px) var(--ui-space-16, 16px);

    h3 {
      display: flex;
      align-items: center;
      gap: var(--ui-space-8, 8px);
      margin: 0;
      font-size: var(--ui-font-16, 16px);
      .list-title-icon { color: var(--workspace-purple-text); }
    }

    span {
      color: var(--desc-color);
      font-size: var(--ui-font-12, 12px);
    }
  }

  .leaderboard-list--mobile .list-heading {
    padding-block: var(--ui-space-10, 10px);
  }

  .list-state {
    display: grid;
    justify-items: center;
    align-content: center;
    gap: var(--ui-space-8, 8px);
    padding: var(--ui-space-16, 16px);
    min-height: var(--ui-layout-100, 100px);
    box-sizing: border-box;
    border-top: 1px solid var(--workspace-divider);
    text-align: center;
    color: var(--desc-color);

    strong { color: var(--text-color); }
  }

  .empty-mark {
    display: grid;
    place-items: center;
    width: var(--ui-layout-44, 44px);
    height: var(--ui-layout-44, 44px);
    margin-bottom: var(--ui-space-4, 4px);
    border-radius: var(--ui-space-18, 18px);
    color: var(--workspace-purple-text);
    background: var(--workspace-purple-selected);
    box-shadow: 0 0 0 var(--ui-space-6, 6px) var(--workspace-canvas);
  }

  .empty-hint {
    max-width: var(--ui-layout-360, 360px);
    font-size: var(--ui-font-13, 13px);
    line-height: 1.5;
  }

  .rank-desktop {
    gap: 0;
    max-height: none;
    padding: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;

    :deep(.table-header) {
      border-radius: 0;
      background: var(--workspace-canvas);
    }

    :deep(.table-body) {
      min-height: 0;
    }

    :deep(.table-row) {
      min-height: var(--ui-control-54, 54px);
      border-top: 1px solid var(--workspace-divider);
      border-radius: 0;
    }

    :deep(.table-row.is-self) {
      background: var(--workspace-purple-selected);
      box-shadow: inset 3px 0 0 var(--primary-color);
    }

    :deep(.header-cell:last-child),
    :deep(.table-cell:last-child),
    &.is-weekly :deep(.header-cell:nth-last-child(2)),
    &.is-weekly :deep(.table-cell:nth-last-child(2)) {
      justify-content: flex-end;
    }
  }

  .rank-mobile {
    --mobile-row-min-height: var(--ui-control-54, 54px);
    --mobile-row-padding-y: var(--ui-space-7, 7px);
    --mobile-row-padding-x: var(--ui-space-10, 10px);
    border: 0;
    border-top: 1px solid var(--workspace-divider);
    border-radius: 0;

    :deep(.mobile-list-row__leading) {
      width: var(--ui-layout-36, 36px);
    }
  }

  .rank-score { font-size: var(--ui-font-16, 16px); font-weight: 700; }
  .muted { color: var(--desc-color); }
  .qualified { color: var(--chip-success-fg); font-weight: 650; }

  .place {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--ui-space-2, 2px);
    width: var(--ui-layout-36, 36px);
    height: var(--ui-layout-26, 26px);
    flex: none;
    box-sizing: border-box;
    border-radius: var(--ui-space-8, 8px);
    color: var(--desc-color);
    font-weight: 700;

    &[data-place='1'] {
      color: var(--chip-pending-fg);
      background: var(--chip-pending-bg);
      border: 1px solid var(--chip-pending-border);
    }
    &[data-place='2'] {
      color: var(--leaderboard-silver-fg);
      background: var(--leaderboard-silver-bg);
      border: 1px solid var(--leaderboard-silver-border);
    }
    &[data-place='3'] {
      color: var(--leaderboard-bronze-fg);
      background: var(--leaderboard-bronze-bg);
      border: 1px solid var(--leaderboard-bronze-border);
    }
  }

  .list-foot {
    margin: 0;
    padding: var(--ui-space-10, 10px) var(--ui-space-16, 16px);
    border-top: 1px solid var(--workspace-divider);
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
</style>
