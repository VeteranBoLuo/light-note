<template>
  <div
    v-if="g"
    class="growth-card"
    :class="{
      'growth-card--expanded': props.expanded,
      'growth-card--compact-today': props.compactToday,
    }"
  >
    <div class="growth-header">
      <div class="growth-identity">
        <div class="growth-badge" :style="{ background: tierGradient(g.level) }">
          <span>Lv.{{ g.level }}</span>
        </div>
        <div class="growth-meta">
          <div class="growth-name">
            <strong>{{ g.name }}</strong>
            <span v-if="g.isMax" class="max-badge">{{ t('growth.max') }}</span>
          </div>
          <span>{{ t('growth.totalExp', { n: g.exp.toLocaleString('en-US') }) }}</span>
        </div>
      </div>
      <BButton
        size="small"
        class="growth-link"
        v-click-log="{ module: '工作台', operation: '查看成长中心' }"
        @click="goGrowth"
      >
        {{ t('workbench.growth.view') }}
      </BButton>
    </div>

    <div class="growth-progress-area">
      <template v-if="props.compactToday">
        <div class="growth-progress-copy growth-progress-copy--today">
          <span>{{ t('growth.todayGrowthProgress') }}</span>
          <strong>{{ dailyProgress.completed }}/{{ dailyProgress.total }}</strong>
        </div>
        <div class="growth-progress growth-progress--today" :title="`${dailyProgressPercent}%`">
          <span :style="{ width: `${dailyProgressPercent}%` }"></span>
        </div>
      </template>
      <template v-else-if="!g.isMax">
        <div class="growth-progress-copy">
          <span>{{ t('workbench.growth.progress') }}</span>
          <strong>{{ g.progress }}%</strong>
        </div>
        <div class="growth-progress" :title="`${g.progress}%`">
          <span :style="{ width: `${g.progress}%` }"></span>
        </div>
        <span class="next-level">{{ t('growth.toNext', { n: g.expToNext.toLocaleString('en-US') }) }}</span>
      </template>
      <span v-else class="max-hint">{{ t('workbench.growth.maxHint') }}</span>
    </div>

    <template v-if="props.expanded">
      <div class="growth-insights" :aria-label="t('growth.todayTitle')">
        <div class="growth-insight growth-insight--daily">
          <span class="growth-insight__icon" aria-hidden="true">
            <SvgIcon :src="icon.growth.action" size="17" />
          </span>
          <span>{{ t('growth.todayDailyProgress') }}</span>
          <strong>{{ dailyProgress.completed }}/{{ dailyProgress.total }}</strong>
        </div>
        <div class="growth-insight growth-insight--exp">
          <span class="growth-insight__icon" aria-hidden="true">
            <SvgIcon :src="icon.growth.level" size="17" />
          </span>
          <span>{{ t('growth.todayExpCap') }}</span>
          <strong>{{ dailyExp }}/{{ dailyCap }}</strong>
        </div>
        <div class="growth-insight growth-insight--reward">
          <span class="growth-insight__icon" aria-hidden="true">
            <SvgIcon :src="icon.growth.reward" size="17" />
          </span>
          <span>{{ t('growth.todayClaimable') }}</span>
          <strong>{{ claimable }}</strong>
        </div>
      </div>

      <BButton v-if="nextAction" class="growth-next" @click="openGrowthTasks">
        <span class="growth-next__icon" aria-hidden="true">
          <SvgIcon :src="nextActionIcon" size="19" />
        </span>
        <span class="growth-next__copy">
          <small>{{ t('growth.nextActionLabel') }}</small>
          <strong>{{ nextActionTitle }}</strong>
          <span class="growth-next__meta">
            <span v-if="nextAction.progress">
              {{
                t('growth.nextActionProgress', {
                  current: nextAction.progress.current,
                  target: nextAction.progress.target,
                })
              }}
            </span>
            <span v-if="Number(nextAction.reward?.exp || 0) > 0">
              {{ t('growth.nextActionExpReward', { n: nextAction.reward?.exp || 0 }) }}
            </span>
            <span v-if="Number(nextAction.reward?.points || 0) > 0">
              {{ t('growth.nextActionPointsReward', { n: nextAction.reward?.points || 0 }) }}
            </span>
          </span>
        </span>
        <SvgIcon class="growth-next__arrow" :src="icon.ai.sourceArrow" size="15" aria-hidden="true" />
      </BButton>
    </template>

    <div class="growth-footer">
      <div class="growth-footer__summary">
        <span class="streak">{{ t('growth.streak') }} · {{ t('growth.daysVal', { n: g.streak }) }}</span>
        <span v-if="props.compactToday" class="claimable-summary">
          {{ t('growth.claimableSummary', { n: claimable }) }}
        </span>
      </div>
      <div class="growth-actions">
        <BButton
          size="small"
          :type="g.checkedInToday ? '' : 'primary'"
          :loading="checking"
          :disabled="readOnly || g.checkedInToday || checking"
          :title="readOnly ? t('growth.adminContextActionUnavailable') : ''"
          class="checkin-button"
          @click="onCheckin"
        >
          {{ g.checkedInToday ? t('growth.checkedIn') : t('growth.checkin') }}
        </BButton>
        <BTooltip v-if="claimable > 0" :title="claimAllTooltip" :disabled="!bookmark.isDesktop" :delay="160">
          <BButton
            size="small"
            type="success"
            :loading="claimingRewards"
            :disabled="readOnly || claimingRewards"
            :title="readOnly ? t('growth.adminContextActionUnavailable') : ''"
            class="claim-button"
            @click="onClaimAll"
          >
            {{ t('growth.claimAll') }} · {{ claimable }}
          </BButton>
        </BTooltip>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import { useGrowth } from '@/composables/useGrowth.ts';
  import { tierGradient } from '@/config/growthTier.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { recordOperation } from '@/api/commonApi.ts';
  import { bookmarkStore, useUserStore } from '@/store';
  import icon from '@/config/icon.ts';
  import { useGrowthClaimFeedback } from '@/composables/useGrowthClaimFeedback';

  const props = withDefaults(
    defineProps<{
      expanded?: boolean;
      compactToday?: boolean;
    }>(),
    {
      expanded: false,
      compactToday: false,
    },
  );

  const { t } = useI18n();
  const router = useRouter();
  const user = useUserStore();
  const bookmark = bookmarkStore();
  const readOnly = computed(() => Boolean(user.adminContext));
  const {
    growth: g,
    claimable: claimableData,
    claimingRewards,
    load,
    loadClaimable,
    claimAllRewards,
    doCheckin,
  } = useGrowth();
  const checking = ref(false);
  const claimable = computed(() => Number(claimableData.value?.count || 0));
  const { claimAllTooltip, snapshotClaimableBreakdown, claimSuccessMessage } = useGrowthClaimFeedback(claimableData);
  const dailyProgress = computed(() => ({
    completed: Number(claimableData.value?.today?.completed || 0),
    total: Number(claimableData.value?.today?.total ?? 3),
  }));
  const dailyProgressPercent = computed(() => {
    const total = Math.max(0, dailyProgress.value.total);
    if (!total) return 0;
    return Math.min(100, Math.round((Math.max(0, dailyProgress.value.completed) / total) * 100));
  });
  const dailyExp = computed(() => Number(g.value?.dailyExp || 0));
  const dailyCap = computed(() => Number(g.value?.dailyCap ?? 200));
  const nextAction = computed(() => claimableData.value?.nextAction || null);
  const nextActionIcon = computed(() => {
    const action = nextAction.value?.action || '';
    if (action.includes('todo')) return icon.growth.action;
    if (action.includes('inbox')) return icon.contextMenu.inbox;
    if (action.includes('reuse')) return icon.noteTemplate.knowledge;
    if (action.includes('file')) return icon.resource.file;
    if (action.includes('bookmark')) return icon.resource.bookmark;
    if (action.includes('report')) return icon.noteDetail.history;
    return icon.growth.create;
  });
  const nextActionTitle = computed(() => {
    if (!nextAction.value) return '';
    const key = `growth.nextActions.${nextAction.value.key}`;
    const translated = t(key);
    return translated === key ? t(`growth.nextActionTypes.${nextAction.value.type}`) : translated;
  });

  async function onClaimAll() {
    if (readOnly.value || claimingRewards.value) return;
    const pendingBreakdown = snapshotClaimableBreakdown();
    try {
      const res = await claimAllRewards();
      if (res?.status === 200 && res.data?.ok) {
        if (res.data.claimed > 0) {
          const sourceMessage = claimSuccessMessage(res.data.receipts, pendingBreakdown);
          message.success(
            sourceMessage || t('growth.claimAllOkMixed', { exp: res.data.exp || 0, points: res.data.points || 0 }),
          );
          recordOperation({
            module: '工作台',
            operation: '一键领取成长奖励成功',
          });
        } else {
          message.info(t('growth.claimAllNone'));
        }
      }
    } catch (error) {
      console.error('一键领取失败:', error);
    }
  }

  function goGrowth() {
    router.push('/growth');
  }

  function openGrowthTasks() {
    router.push({ path: '/growth', query: { section: 'tasks' }, hash: '#growth-weekly' });
  }

  async function onCheckin() {
    if (readOnly.value || checking.value || g.value?.checkedInToday) return;
    checking.value = true;
    try {
      const res = await doCheckin();
      if (res?.status === 200 && res.data?.ok) {
        if (res.data.already) {
          message.info(t('growth.alreadyChecked'));
        } else {
          message.success(t('growth.checkinSuccess', { n: res.data.expGained }));
          recordOperation({
            module: '工作台',
            operation: `每日签到（连续 ${res.data.streak} 天,+${res.data.expGained}）`,
          });
          if (res.data.leveledUp && res.data.growth) {
            message.success(t('growth.leveledUp', { lv: res.data.growth.level, name: res.data.growth.name }));
          }
        }
        // 成长卡可能与进入页面时的 /growth/me 并发；签到完成后强制回读服务端快照，
        // 避免旧的首屏响应把 checkedInToday 又覆盖回 false。
        await Promise.all([load(true), loadClaimable()]);
      } else if (String(res?.status || '') !== 'preview') {
        message.error(res?.msg || t('growth.checkinFailed'));
      }
    } catch (error) {
      console.error('签到失败:', error);
      message.error(t('growth.checkinFailed'));
    } finally {
      checking.value = false;
    }
  }

  onMounted(() => {
    load();
    loadClaimable();
  });
</script>

<style scoped lang="less">
  .growth-card {
    min-height: 148px;
    padding: 14px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 10px;
    border: 1px solid color-mix(in srgb, var(--primary-color) 18%, var(--card-border-color));
    border-radius: 14px;
    color: var(--text-color);
    background: linear-gradient(
      145deg,
      color-mix(in srgb, var(--primary-color) 7%, var(--menu-body-bg-color)),
      var(--menu-body-bg-color)
    );
    box-shadow: 0 12px 30px -28px color-mix(in srgb, var(--primary-color) 70%, transparent);
  }

  .growth-card--expanded {
    min-height: 0;
    height: 100%;
  }

  .growth-card--compact-today {
    min-height: 0;
    padding: 16px;
    gap: 13px;
    border-color: var(--primary-color);
    border-radius: 17px;
    background: var(--card-background);
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--primary-color) 7%, var(--card-background)),
      color-mix(in srgb, var(--resource-file-color, #ff8a00) 4%, var(--card-background))
    );
    box-shadow: 0 12px 30px rgba(37, 40, 72, 0.06);
  }

  .growth-header,
  .growth-footer,
  .growth-identity,
  .growth-name,
  .growth-progress-copy,
  .growth-actions {
    display: flex;
    align-items: center;
  }

  .growth-header,
  .growth-footer,
  .growth-progress-copy {
    justify-content: space-between;
    gap: 10px;
  }

  .growth-identity {
    min-width: 0;
    gap: 10px;
  }

  .growth-badge {
    width: 40px;
    height: 40px;
    flex: 0 0 auto;
    border-radius: 11px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    box-shadow: 0 9px 18px -13px rgba(0, 0, 0, 0.65);
  }

  .growth-badge span {
    font-size: 12px;
    font-weight: 800;
  }

  .growth-meta {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .growth-name {
    gap: 6px;
  }

  .growth-name strong {
    min-width: 0;
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .growth-meta > span,
  .next-level,
  .max-hint,
  .streak,
  .growth-progress-copy {
    color: var(--desc-color);
    font-size: 10.5px;
  }

  .max-badge {
    padding: 2px 6px;
    border-radius: 999px;
    color: #fff;
    background: linear-gradient(135deg, #f43f5e, #fb923c);
    font-size: 9px;
    font-weight: 700;
  }

  .growth-link {
    flex: 0 0 auto;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 7%, var(--menu-body-bg-color));
  }

  .growth-progress-area {
    min-height: 36px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 5px;
  }

  .growth-progress-copy strong {
    color: var(--text-color);
    font-size: 10.5px;
    font-variant-numeric: tabular-nums;
  }

  .growth-progress-copy--today,
  .growth-progress-copy--today strong {
    font-size: 12px;
  }

  .growth-progress {
    height: 6px;
    overflow: hidden;
    border-radius: 999px;
    background: color-mix(in srgb, var(--card-border-color) 54%, transparent);
  }

  .growth-progress span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--primary-color), color-mix(in srgb, var(--primary-color) 58%, #22d3ee));
    transition: width 0.35s ease;
  }

  .growth-progress--today {
    height: 7px;
    background: var(--surface-divider-color);
  }

  .growth-progress--today span {
    background: linear-gradient(90deg, var(--primary-color), #ec4899, var(--resource-file-color, #ff8a00));
  }

  .growth-insights {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 7px;
  }

  .growth-insight {
    min-width: 0;
    padding: 9px 7px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 4px 6px;
    border: 1px solid color-mix(in srgb, var(--primary-color) 14%, var(--card-border-color));
    border-radius: 11px;
    background: color-mix(in srgb, var(--primary-color) 4%, var(--menu-body-bg-color));
  }

  .growth-insight__icon {
    width: 28px;
    height: 28px;
    grid-row: 1 / 3;
    display: grid;
    place-items: center;
    border-radius: 9px;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 10%, transparent);
  }

  .growth-insight > span:not(.growth-insight__icon) {
    min-width: 0;
    overflow: hidden;
    color: var(--desc-color);
    font-size: 9.5px;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .growth-insight strong {
    color: var(--text-color);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
  }

  .growth-insight--daily .growth-insight__icon {
    color: var(--resource-note-color, #00a884);
    background: color-mix(in srgb, var(--resource-note-color, #00a884) 11%, transparent);
  }

  .growth-insight--reward .growth-insight__icon {
    color: var(--resource-file-color, #ff8a00);
    background: color-mix(in srgb, var(--resource-file-color, #ff8a00) 11%, transparent);
  }

  .growth-next {
    width: 100%;
    min-width: 0;
    height: auto;
    min-height: 68px;
    padding: 10px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
    border: 1px solid color-mix(in srgb, var(--primary-color) 22%, var(--card-border-color));
    border-radius: 11px;
    color: var(--text-color);
    background: color-mix(in srgb, var(--primary-color) 5%, var(--menu-body-bg-color));
    text-align: left;
    line-height: 1.25;
  }

  .growth-next__icon {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: 10px;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 11%, transparent);
  }

  .growth-next__copy {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  .growth-next__copy > small,
  .growth-next__meta {
    color: var(--desc-color);
    font-size: 9.5px;
  }

  .growth-next__copy > strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11.5px;
  }

  .growth-next__meta {
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 2px 8px;
  }

  .growth-next__arrow {
    color: var(--primary-color);
  }

  .growth-footer {
    margin-top: auto;
  }

  .growth-footer__summary {
    min-width: 0;
    display: grid;
    gap: 4px;
  }

  .claimable-summary {
    color: var(--desc-color);
    font-size: 10.5px;
    white-space: nowrap;
  }

  .streak {
    white-space: nowrap;
  }

  .growth-actions {
    justify-content: flex-end;
    gap: 6px;
  }

  .checkin-button,
  .claim-button {
    min-width: 62px;
  }

  .claim-button {
    background: linear-gradient(135deg, #f59e0b, #f97316);
  }

  @media (max-width: 760px) {
    .growth-card--expanded {
      height: auto;
    }

    .growth-insights {
      grid-template-columns: 1fr;
    }

    .growth-footer {
      align-items: flex-start;
      flex-direction: column;
    }

    .growth-card--compact-today .growth-header,
    .growth-card--compact-today .growth-footer {
      flex-direction: row;
      align-items: center;
    }

    .growth-card--compact-today .growth-footer {
      margin-top: 0;
    }

    .growth-card--compact-today .growth-badge {
      width: 44px;
      height: 44px;
      border-radius: 13px;
    }

    .growth-card--compact-today .growth-name strong {
      font-size: 15px;
    }

    .growth-card--compact-today .growth-meta > span,
    .growth-card--compact-today .streak,
    .growth-card--compact-today .claimable-summary {
      font-size: 11.5px;
    }

    .growth-actions {
      width: 100%;
      justify-content: flex-start;
    }

    .growth-card--compact-today .growth-actions {
      width: auto;
      flex: 0 0 auto;
      justify-content: flex-end;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .growth-progress span {
      transition: none;
    }
  }
</style>
