<template>
  <section
    class="admin-recent"
    :class="{ 'is-stacked': stacked, 'is-mobile': mobile }"
    :aria-labelledby="sectionTitleId"
  >
    <div class="admin-recent__heading">
      <div>
        <h3 :id="sectionTitleId">{{ t('adminOverviewRecent.title') }}</h3>
        <p>{{ sectionSubtitle }}</p>
      </div>
      <div class="admin-recent__controls">
        <span v-if="loading && data" class="admin-recent__updating">{{ t('adminOverviewRecent.updating') }}</span>
        <BSelect
          class="admin-recent__filter admin-recent__filter--period"
          :value="activeFilter.period"
          :options="periodOptions"
          :aria-label="t('adminOverviewRecent.filters.periodAria')"
          :disabled="loading"
          @change="changePeriod"
        />
        <BSelect
          class="admin-recent__filter admin-recent__filter--type"
          :value="activeFilter.type"
          :options="typeOptions"
          :aria-label="t('adminOverviewRecent.filters.typeAria')"
          :disabled="loading"
          @change="changeType"
        />
      </div>
    </div>

    <div v-if="loading && !data" class="admin-recent__grid" aria-busy="true">
      <BCard v-for="card in skeletonCardCount" :key="card" variant="panel" padding="16px" class="admin-recent__card">
        <div class="admin-recent__skeleton-title"></div>
        <div v-for="row in 6" :key="row" class="admin-recent__skeleton-row">
          <span></span>
          <div><i></i><i></i></div>
        </div>
      </BCard>
    </div>

    <BCard v-else-if="error && !data" variant="panel" padding="20px" class="admin-recent__error">
      <p>{{ t('adminOverviewRecent.loadFailed') }}</p>
      <BButton size="small" @click="emit('retry')">{{ t('common.retry') }}</BButton>
    </BCard>

    <div v-else class="admin-recent__grid" :class="{ 'is-single': !(showResources && showUsers) }">
      <BCard v-if="showResources" variant="panel" padding="0" class="admin-recent__card admin-recent__card--resources">
        <template #title>
          <span class="admin-recent__card-title">{{ resourceCardTitle }}</span>
        </template>
        <template v-if="recentResources.length">
          <ul class="admin-recent__list">
            <li v-for="item in recentResources" :key="`${item.type}:${item.id}`" class="admin-recent__row">
              <span
                class="admin-recent__resource-icon"
                :style="{ color: `var(${RESOURCE_COLOR_CSS_VAR[item.type]})` }"
                aria-hidden="true"
              >
                <SvgIcon :src="icon.resource[item.type]" size="19" />
              </span>
              <div class="admin-recent__body">
                <strong :title="displayResourceTitle(item)">{{ displayResourceTitle(item) }}</strong>
                <span>
                  <BChip :tone="item.type">{{ resourceLabel(item.type) }}</BChip>
                  <span class="admin-recent__owner">{{ displayUserName(item.userName) }}</span>
                  <span v-if="displayUserRemark(item.userRemark)" class="admin-recent__remark">
                    {{ t('adminOverviewRecent.userRemark', { remark: displayUserRemark(item.userRemark) }) }}
                  </span>
                </span>
              </div>
              <BTooltip :title="formatFullTime(item.createdAt)">
                <time class="admin-recent__time" :datetime="item.createdAt">{{ formatTime(item.createdAt) }}</time>
              </BTooltip>
            </li>
          </ul>
        </template>
        <p v-else class="admin-recent__empty">{{ t('adminOverviewRecent.emptyResources') }}</p>
      </BCard>

      <BCard v-if="showUsers" variant="panel" padding="0" class="admin-recent__card admin-recent__card--users">
        <template #title>
          <span class="admin-recent__card-title">{{ userCardTitle }}</span>
        </template>
        <template #extra>
          <BButton size="small" class="admin-recent__users-link" @click="emit('viewUsers')">
            {{ t('adminOverviewRecent.userManagement') }}
          </BButton>
        </template>
        <template v-if="recentUsers.length">
          <ul class="admin-recent__list">
            <li v-for="user in recentUsers" :key="user.id" class="admin-recent__row">
              <span class="admin-recent__avatar" aria-hidden="true">{{ userInitial(user.name) }}</span>
              <div class="admin-recent__body">
                <strong :title="displayUserName(user.name)">{{ displayUserName(user.name) }}</strong>
                <span>
                  <BChip tone="neutral">{{ roleLabel(user.role) }}</BChip>
                  <span v-if="displayUserRemark(user.userRemark)" class="admin-recent__remark">
                    {{ t('adminOverviewRecent.userRemark', { remark: displayUserRemark(user.userRemark) }) }}
                  </span>
                </span>
              </div>
              <BTooltip :title="formatFullTime(user.createdAt)">
                <time class="admin-recent__time" :datetime="user.createdAt">{{ formatTime(user.createdAt) }}</time>
              </BTooltip>
            </li>
          </ul>
        </template>
        <p v-else class="admin-recent__empty">{{ t('adminOverviewRecent.emptyUsers') }}</p>
      </BCard>
    </div>
  </section>
</template>

<script lang="ts" setup>
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import icon from '@/config/icon.ts';
  import { RESOURCE_COLOR_CSS_VAR } from '@/config/resourceColor.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import type {
    AdminRecentData,
    AdminRecentFilter,
    AdminRecentFilterType,
    AdminRecentPeriod,
    AdminRecentResource,
    RecentResourceType,
  } from './adminRecentTypes.ts';

  const props = defineProps<{
    data: AdminRecentData | null;
    loading?: boolean;
    error?: boolean;
    stacked?: boolean;
    mobile?: boolean;
    filter?: AdminRecentFilter;
    filteredTotal?: number | null;
  }>();

  const emit = defineEmits<{
    retry: [];
    viewUsers: [];
    filterChange: [filter: AdminRecentFilter];
  }>();

  const { t, locale } = useI18n();
  const sectionTitleId = `admin-recent-${Math.random().toString(36).slice(2)}`;
  const allowedPeriods: AdminRecentPeriod[] = ['recent', 'today'];
  const allowedTypes: AdminRecentFilterType[] = ['all', 'resource', 'user', 'bookmark', 'note', 'file'];
  const activeFilter = computed<AdminRecentFilter>(() => props.filter || { period: 'recent', type: 'all' });
  const recentResources = computed(() => props.data?.recentResources || []);
  const recentUsers = computed(() => props.data?.recentUsers || []);
  const showResources = computed(() => activeFilter.value.type !== 'user');
  const showUsers = computed(() => ['all', 'user'].includes(activeFilter.value.type));
  const skeletonCardCount = computed(() => (showResources.value && showUsers.value ? 2 : 1));
  const periodOptions = computed(() => [
    { value: 'recent', label: t('adminOverviewRecent.filters.periodRecent') },
    { value: 'today', label: t('adminOverviewRecent.filters.periodToday') },
  ]);
  const typeOptions = computed(() => [
    { value: 'all', label: t('adminOverviewRecent.filters.typeAll') },
    { value: 'resource', label: t('adminOverviewRecent.filters.typeResources') },
    { value: 'user', label: t('adminOverviewRecent.filters.typeUsers') },
    { value: 'bookmark', label: t('adminOverviewRecent.resourceType.bookmark') },
    { value: 'note', label: t('adminOverviewRecent.resourceType.note') },
    { value: 'file', label: t('adminOverviewRecent.resourceType.file') },
  ]);
  const sectionSubtitle = computed(() => {
    if (activeFilter.value.period !== 'today') return t('adminOverviewRecent.subtitle');
    const limit = Number(props.data?.limit || 20);
    return props.filteredTotal == null
      ? t('adminOverviewRecent.todaySubtitle', { limit })
      : t('adminOverviewRecent.todaySubtitleWithTotal', { count: props.filteredTotal, limit });
  });
  const resourceCardTitle = computed(() => {
    const { period, type } = activeFilter.value;
    if (['bookmark', 'note', 'file'].includes(type)) {
      return t(
        period === 'today'
          ? 'adminOverviewRecent.filteredTitle.todayResourceType'
          : 'adminOverviewRecent.filteredTitle.recentResourceType',
        { type: resourceLabel(type as RecentResourceType) },
      );
    }
    return t(period === 'today' ? 'adminOverviewRecent.filteredTitle.todayResources' : 'adminOverviewRecent.resources');
  });
  const userCardTitle = computed(() =>
    t(
      activeFilter.value.period === 'today'
        ? 'adminOverviewRecent.filteredTitle.todayUsers'
        : 'adminOverviewRecent.users',
    ),
  );

  function changePeriod(value: unknown) {
    if (!allowedPeriods.includes(value as AdminRecentPeriod)) return;
    emit('filterChange', { ...activeFilter.value, period: value as AdminRecentPeriod });
  }

  function changeType(value: unknown) {
    if (!allowedTypes.includes(value as AdminRecentFilterType)) return;
    emit('filterChange', { ...activeFilter.value, type: value as AdminRecentFilterType });
  }

  function displayUserName(value?: string | null) {
    return String(value || '').trim() || t('adminOverviewRecent.unnamedUser');
  }

  function displayUserRemark(value?: string | null) {
    return String(value || '').trim();
  }

  function displayResourceTitle(item: AdminRecentResource) {
    const title = String(item.title || '').trim();
    return title || t(`adminOverviewRecent.unnamed.${item.type}`);
  }

  function resourceLabel(type: RecentResourceType) {
    return t(`adminOverviewRecent.resourceType.${type}`);
  }

  function roleLabel(role?: string | null) {
    const normalizedRole = ['root', 'test', 'user'].includes(String(role)) ? String(role) : 'user';
    return t(`adminOverviewRecent.role.${normalizedRole}`);
  }

  function userInitial(name?: string | null) {
    return Array.from(displayUserName(name))[0]?.toUpperCase() || 'U';
  }

  function parseTime(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatTime(value: string) {
    const date = parseTime(value);
    if (!date) return '—';
    return new Intl.DateTimeFormat(locale.value, {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  }

  function formatFullTime(value: string) {
    const date = parseTime(value);
    if (!date) return '—';
    return new Intl.DateTimeFormat(locale.value, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(date);
  }
</script>

<style lang="less" scoped>
  .admin-recent {
    margin-top: 20px;
  }

  .admin-recent__heading {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;

    h3,
    p {
      margin: 0;
    }

    h3 {
      color: var(--text-color);
      font-size: 14px;
      font-weight: 650;
      line-height: 1.5;
    }

    p,
    .admin-recent__updating {
      color: var(--sub-text-color);
      font-size: 11px;
      line-height: 1.5;
    }
  }

  .admin-recent__controls {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 8px;
  }

  .admin-recent__filter--period {
    width: 112px;
  }

  .admin-recent__filter--type {
    width: 128px;
  }

  .admin-recent__filter :deep(.select-trigger) {
    min-height: 30px;
    font-size: 11px;
  }

  .admin-recent__grid {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr);
    gap: 12px;
    align-items: stretch;
  }

  .admin-recent__grid.is-single {
    grid-template-columns: minmax(0, 1fr);
  }

  .admin-recent__card {
    overflow: hidden;
    --b-card-background: var(--card-background, var(--background-color));
  }

  .admin-recent__card :deep(.card-container-header) {
    min-height: 42px;
    margin: 0;
    padding: 0 14px;
    border-bottom: 1px solid var(--surface-border-color, var(--card-border-color));
  }

  .admin-recent__card-title {
    font-size: 13px;
  }

  .admin-recent__users-link {
    height: 27px;
    padding: 0 9px;
    color: var(--primary-color);
    border: 1px solid var(--primary-color);
    background: transparent;
    font-size: 11px;
    line-height: 25px;
  }

  .admin-recent__list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .admin-recent__row {
    min-width: 0;
    min-height: 58px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 14px;
    box-sizing: border-box;
    border-bottom: 1px solid var(--surface-border-color, var(--card-border-color));

    &:last-child {
      border-bottom: 0;
    }
  }

  .admin-recent__resource-icon,
  .admin-recent__avatar {
    width: 36px;
    height: 36px;
    flex: 0 0 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    border: 1px solid currentColor;
    border-radius: 10px;
    background: var(--workspace-panel-bg-color);
  }

  .admin-recent__avatar {
    color: var(--primary-color);
    border-radius: 50%;
    font-size: 13px;
    font-weight: 700;
  }

  .admin-recent__body {
    min-width: 0;
    overflow: hidden;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;

    strong {
      overflow: hidden;
      color: var(--text-color);
      font-size: 13px;
      font-weight: 600;
      line-height: 1.35;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    > span {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 7px;
      color: var(--sub-text-color);
      font-size: 11px;
    }
  }

  .admin-recent__owner {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .admin-recent__remark {
    min-width: 0;
    overflow: hidden;
    color: var(--primary-color);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .admin-recent__time {
    flex: 0 0 auto;
    color: var(--sub-text-color);
    font-size: 11px;
    white-space: nowrap;
  }

  .admin-recent__empty,
  .admin-recent__error {
    color: var(--sub-text-color);
    font-size: 12px;
  }

  .admin-recent__empty {
    min-height: 180px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0;
  }

  .admin-recent__error {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;

    p {
      margin: 0;
    }
  }

  .admin-recent__skeleton-title,
  .admin-recent__skeleton-row span,
  .admin-recent__skeleton-row i {
    display: block;
    border-radius: 8px;
    background: var(--skeleton-background, var(--menu-item-h-bg-color));
    animation: admin-recent-pulse 1.25s ease-in-out infinite alternate;
  }

  .admin-recent__skeleton-title {
    width: 108px;
    height: 18px;
    margin-bottom: 14px;
  }

  .admin-recent__skeleton-row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 58px;

    > span {
      width: 36px;
      height: 36px;
      flex: 0 0 36px;
    }

    div {
      min-width: 0;
      flex: 1;
      display: grid;
      gap: 7px;
    }

    i {
      width: 68%;
      height: 11px;
    }

    i:last-child {
      width: 42%;
      height: 9px;
    }
  }

  @keyframes admin-recent-pulse {
    from {
      opacity: 0.46;
    }
    to {
      opacity: 0.9;
    }
  }

  :global(.disable-animations) .admin-recent__skeleton-title,
  :global(.disable-animations) .admin-recent__skeleton-row span,
  :global(.disable-animations) .admin-recent__skeleton-row i {
    animation: none;
  }

  .admin-recent.is-stacked .admin-recent__grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .admin-recent.is-mobile .admin-recent__row {
    padding-inline: 12px;
  }

  .admin-recent.is-mobile .admin-recent__heading {
    align-items: stretch;
    flex-direction: column;
  }

  .admin-recent.is-mobile .admin-recent__controls {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    justify-content: stretch;
  }

  .admin-recent.is-mobile .admin-recent__updating {
    grid-column: 1 / -1;
  }

  .admin-recent.is-mobile .admin-recent__filter {
    width: 100%;
  }

  .admin-recent.is-mobile .admin-recent__time {
    max-width: 72px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
