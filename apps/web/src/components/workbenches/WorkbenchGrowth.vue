<template>
  <div v-if="g" class="growth-card">
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
      <template v-if="!g.isMax">
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

    <div class="growth-footer">
      <span class="streak">{{ t('growth.streak') }} · {{ t('growth.daysVal', { n: g.streak }) }}</span>
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
        <BButton
          v-if="claimable > 0"
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
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { recordOperation } from '@/api/commonApi.ts';
  import { useUserStore } from '@/store';

  const { t } = useI18n();
  const router = useRouter();
  const user = useUserStore();
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

  async function onClaimAll() {
    if (readOnly.value || claimingRewards.value) return;
    try {
      const res = await claimAllRewards();
      if (res?.status === 200 && res.data?.ok) {
        if (res.data.claimed > 0) {
          const frameCount = Array.isArray(res.data.frames) ? res.data.frames.length : 0;
          message.success(
            frameCount
              ? t('growth.claimAllOkWithFrames', {
                  exp: res.data.exp || 0,
                  points: res.data.points || 0,
                  frames: frameCount,
                })
              : t('growth.claimAllOkMixed', { exp: res.data.exp || 0, points: res.data.points || 0 }),
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
          await loadClaimable();
        }
      }
    } catch (error) {
      console.error('签到失败:', error);
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

  .growth-footer {
    margin-top: auto;
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
    .growth-footer {
      align-items: flex-start;
      flex-direction: column;
    }

    .growth-actions {
      width: 100%;
      justify-content: flex-start;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .growth-progress span {
      transition: none;
    }
  }
</style>
