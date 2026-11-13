<template>
  <section class="rank-panel" :class="{ 'rank-panel--stacked': stacked }" :aria-label="t('growth.overview.rankTitle')">
    <div class="rank-panel__top">
      <span class="rank-panel__avatar" :class="{ 'has-frame': frameId }">
        <AvatarFramePreview
          v-if="frameId"
          :frame-id="frameId"
          :src="avatarSrc"
          :size="avatarSize"
          pause-when-offscreen
        />
        <SvgIcon v-else :src="avatarSrc" :size="avatarSize" class="rank-panel__face" />
      </span>
      <div class="rank-panel__identity">
        <div class="rank-panel__name">
          <h2>{{ rankName(growth.level) }}</h2>
          <span class="rank-panel__lv" :style="{ background: tierGradient(growth.level) }">Lv.{{ growth.level }}</span>
          <span v-if="growth.isMax" class="rank-panel__max"
            ><SvgIcon :src="icon.growth.crown" size="12" />{{ t('growth.max') }}</span
          >
          <BPopover
            v-else
            v-model:open="earnOpen"
            trigger="click"
            placement="bottom-left"
            overlay-class-name="rank-panel-earn-popover"
          >
            <BButton
              type="text"
              icon-only
              class="rank-panel__earn"
              :aria-label="t('growth.earnTitle')"
              :aria-expanded="earnOpen"
              v-click-log="{ module: '成长', operation: '查看经验获取规则' }"
            >
              <SvgIcon :src="icon.message.info" size="16" />
            </BButton>
            <template #content>
              <div class="rank-panel-earn">
                <strong>{{ t('growth.earnTitle') }}</strong>
                <dl class="rank-panel-earn__rules">
                  <div
                    v-for="row in earnRows"
                    :key="row.label"
                    class="rank-panel-earn__row"
                    :class="{ 'is-stacked': row.stacked }"
                  >
                    <dt>{{ row.label }}</dt>
                    <dd>{{ row.value }}</dd>
                  </div>
                </dl>
                <div class="rank-panel-earn__notes">
                  <p>{{ t('growth.questExperienceCreateHint') }}</p>
                  <p v-if="growth.dailyCap">{{ t('growth.questExperienceDailyCapRule', { cap: growth.dailyCap }) }}</p>
                </div>
              </div>
            </template>
          </BPopover>
        </div>
        <div class="rank-panel__sub">
          {{ t('growth.overview.expSummary', { exp: fmt(growth.exp), week: fmt(weekExp) }) }}
        </div>
      </div>
      <div class="rank-panel__points">
        <small>{{ t('growth.overview.pointsLabel') }}</small>
        <b :class="{ 'is-empty': !points }">{{ fmt(points) }}</b>
        <BButton
          type="text"
          size="small"
          class="rank-panel__link"
          @click="points ? $emit('open-shop') : $emit('open-tasks')"
        >
          {{ points ? t('growth.overview.pointsSpend') : t('growth.overview.pointsEarn') }}
          <SvgIcon :src="icon.arrow_right" size="12" />
        </BButton>
      </div>
    </div>

    <div class="rank-track" :aria-label="trackLabel" role="img">
      <span class="rank-track__rail"></span>
      <span class="rank-track__fill" :style="{ width: `${trackFill}%` }"></span>
      <template v-for="level in levelCount" :key="level">
        <span
          v-if="growth.isMax && level === levelCount"
          class="rank-track__node is-crown"
          :style="{ left: '100%' }"
          :title="`Lv.${level} ${rankName(level)}`"
          ><SvgIcon :src="icon.growth.crown" size="14"
        /></span>
        <span
          v-else
          class="rank-track__node"
          :class="{
            'is-on': level < growth.level || growth.isMax,
            'is-current': level === growth.level && !growth.isMax,
            'is-next': level === growth.level + 1 && !growth.isMax,
          }"
          :style="{ left: `${((level - 1) / (levelCount - 1)) * 100}%` }"
          :title="`Lv.${level} ${rankName(level)}`"
        ></span>
      </template>
    </div>
    <div v-if="!stacked" class="rank-track__ticks" aria-hidden="true">
      <span v-for="level in ticks" :key="level" :style="{ left: `${((level - 1) / (levelCount - 1)) * 100}%` }"
        >Lv.{{ level }}</span
      >
    </div>
    <div class="rank-panel__caption">
      <template v-if="growth.isMax">
        <span
          ><b>Lv.{{ growth.level }} {{ rankName(growth.level) }}</b> · {{ t('growth.overview.maxReached') }}</span
        >
        <span>{{ t('growth.overview.maxHint') }}</span>
      </template>
      <template v-else>
        <span
          ><b>Lv.{{ growth.level }} {{ rankName(growth.level) }}</b> ·
          {{ t('growth.overview.levelProgress', { cur: fmt(levelCurrent), span: fmt(levelSpan) }) }}</span
        >
        <span class="rank-panel__need">{{
          t('growth.overview.toNextLevel', {
            n: fmt(growth.expToNext),
            lv: growth.level + 1,
            name: rankName(growth.level + 1),
          })
        }}</span>
      </template>
    </div>

    <div class="rank-benefits">
      <div v-for="benefit in benefits" :key="benefit.key" class="rank-benefit">
        <small class="rank-benefit__label"
          ><span class="rank-benefit__icon"><SvgIcon :src="benefit.icon" size="14" /></span>{{ benefit.label }}</small
        >
        <b>{{ benefit.value }}</b>
        <em :class="{ 'is-plain': !benefit.upgrade }">{{ benefit.note || '\u00a0' }}</em>
      </div>
    </div>

    <div class="rank-panel__accum">
      <span class="rank-panel__companion"
        >{{ t('growth.overview.companion') }} <b>{{ fmt(joinDays) }}</b> {{ t('growth.overview.dayUnit') }}</span
      >
      <span v-for="item in accumulation" :key="item.key"
        >{{ item.label }} <b>{{ fmt(item.value) }}</b></span
      >
      <BButton type="text" size="small" class="rank-panel__link rank-panel__all" @click="$emit('open-ranks')">
        {{ t('growth.viewAllRanks') }}<SvgIcon :src="icon.arrow_right" size="12" />
      </BButton>
    </div>
  </section>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import AvatarFramePreview from '@/components/growth/AvatarFramePreview.vue';
  import icon from '@/config/icon.ts';
  import { tierGradient } from '@/config/growthTier';
  import { frameVariant } from '@/config/growthFrames';
  import { useUiDensity } from '@/composables/useUiDensity';
  import type { Growth, GrowthStats, Rank } from '@/composables/useGrowth.ts';
  import { useUserStore } from '@/store';

  const props = withDefaults(
    defineProps<{
      growth: Growth;
      ranks: Rank[];
      stats: GrowthStats;
      /** 永久 AI 余额（背包资产）；未加载时为 null。AI 额度不再按等级每日刷新。 */
      aiBalance?: number | null;
      stacked?: boolean;
    }>(),
    { aiBalance: null, stacked: false },
  );
  defineEmits<{ 'open-ranks': []; 'open-shop': []; 'open-tasks': [] }>();
  const { t, te, locale } = useI18n();
  const user = useUserStore();
  const { dimension } = useUiDensity();
  const earnOpen = ref(false);

  const fmt = (value: number) => Number(value || 0).toLocaleString('en-US');
  const avatarSize = computed(() => dimension(props.stacked ? 52 : 64, 'layout'));
  const avatarSrc = computed(() => user.headPicture || icon.navigation.user);
  const frameId = computed(() => {
    const id = props.growth.equippedFrame;
    return frameVariant(id) ? id : null;
  });
  function rankName(level: number) {
    const key = `growth.ranks.${level}`;
    return te(key) ? t(key) : props.ranks.find((rank) => rank.level === level)?.name || '';
  }

  const levelCount = computed(() => Math.max(2, props.ranks.length || 15));
  const ticks = computed(() =>
    [1, 5, 10, levelCount.value].filter((level, index, list) => list.indexOf(level) === index),
  );
  const levelCurrent = computed(() => Math.max(0, props.growth.exp - props.growth.levelStartExp));
  const levelSpan = computed(() =>
    Math.max(1, Number(props.growth.nextLevelExp || props.growth.exp) - props.growth.levelStartExp),
  );
  const trackFill = computed(() => {
    if (props.growth.isMax) return 100;
    const progress = Math.min(100, Math.max(0, Number(props.growth.progress || 0))) / 100;
    return ((props.growth.level - 1 + progress) / (levelCount.value - 1)) * 100;
  });
  const trackLabel = computed(() =>
    props.growth.isMax
      ? `Lv.${props.growth.level} ${t('growth.overview.maxReached')}`
      : `Lv.${props.growth.level} · ${t('growth.overview.levelProgress', { cur: fmt(levelCurrent.value), span: fmt(levelSpan.value) })}`,
  );

  const earnRows = computed(() => [
    { label: t('growth.earnCheckin'), value: t('growth.earnCheckinValue') },
    // 规则较长，单独一行展示，避免把左侧名称挤成逐字换行。
    { label: t('growth.earnCreate'), value: t('growth.earnCreateValue'), stacked: true },
    { label: t('growth.earnDailyQuest'), value: t('growth.earnDailyQuestValue') },
    { label: t('growth.earnFirst'), value: t('growth.earnFirstValue') },
    { label: t('growth.earnProfile'), value: t('growth.earnProfileValue') },
  ]);

  const formatMb = (mb: number) => (mb >= 1024 ? `${+(mb / 1024).toFixed(2)} GB` : `${mb} MB`);
  const formatTokens = (value: number) => new Intl.NumberFormat(locale.value, { notation: 'compact' }).format(value);
  const formatTrash = (days: number) => (days >= 3650 ? t('growth.trashForever') : t('growth.daysVal', { n: days }));
  const currentRank = computed(() => props.ranks.find((rank) => rank.level === props.growth.level) || null);
  // 每格说明统一为「下一次提升出现在哪一级」：同档内多级不变时直接指向真正提升的等级，已到顶则说明最高档。
  function nextIncrease(pick: (rank: Rank) => number, current: number) {
    return props.ranks.find((rank) => rank.level > props.growth.level && pick(rank) > current) || null;
  }
  const unlockAt = (level: number, value: string) => t('growth.overview.unlockAt', { lv: level, value });
  // AI 额度按服务端计费模式展示：切换为永久余额后显示余额与下一级一次性赠礼；切换前仍是每日额度。
  const aiBenefit = computed(() => {
    const growth = props.growth;
    if (growth.billingMode === 'permanent_only') {
      const status = growth.aiLevelGiftStatus;
      const next = growth.aiNextLevelGift;
      let note = t('aiQuotaOneTime.retained');
      let upgrade = false;
      if (status === 'ineligible') note = t('aiQuotaOneTime.internalCredits');
      else if (status === 'held') note = t('aiQuotaOneTime.giftHeld');
      else if (status === 'missing') note = t('aiQuotaOneTime.giftPending');
      else if (next && next.tokens > 0) {
        note = unlockAt(next.level, t('aiQuotaOneTime.giftShort', { amount: formatTokens(next.tokens) }));
        upgrade = true;
      }
      return {
        label: t('aiQuotaOneTime.aiBalance'),
        value: props.aiBalance == null ? '—' : formatTokens(props.aiBalance),
        note,
        upgrade,
      };
    }
    const daily = Number(growth.aiTokenDaily || 0);
    const more = nextIncrease((rank) => Number(rank.aiTokenDaily || 0), daily);
    return {
      label: t('growth.overview.aiDaily'),
      value: formatTokens(daily),
      note: more
        ? unlockAt(more.level, formatTokens(more.aiTokenDaily))
        : props.ranks.length
          ? t('growth.overview.topTier')
          : '',
      upgrade: Boolean(more),
    };
  });
  const benefits = computed(() => {
    const growth = props.growth;
    const loaded = props.ranks.length > 0;
    const bonusMb = Number(growth.spaceBonusMb || 0);
    const baseSpace = Number(currentRank.value?.spaceMb ?? growth.spaceMb - bonusMb);
    const trashDays = Number(growth.trashDays || 30);
    const draws = Number(currentRank.value?.freeDraws || 0);
    const space = nextIncrease((rank) => rank.spaceMb, baseSpace);
    const trash = nextIncrease((rank) => rank.trashDays, trashDays);
    const moreDraws = nextIncrease((rank) => Number(rank.freeDraws || 0), draws);
    const topNote = loaded ? t('growth.overview.topTier') : '';
    return [
      {
        key: 'space',
        icon: icon.growth.storage,
        label: t('growth.space'),
        value: formatMb(growth.spaceMb),
        note: space
          ? unlockAt(space.level, formatMb(space.spaceMb + bonusMb))
          : bonusMb > 0
            ? t('growth.spaceBonusTag', { n: formatMb(bonusMb) })
            : topNote,
        upgrade: Boolean(space),
      },
      {
        key: 'ai',
        icon: icon.growth.ai,
        ...aiBenefit.value,
      },
      {
        key: 'trash',
        icon: icon.userCenter.menu.trash,
        label: t('growth.trashRetain'),
        value: formatTrash(trashDays),
        note: trash ? unlockAt(trash.level, formatTrash(trash.trashDays)) : topNote,
        upgrade: Boolean(trash),
      },
      {
        key: 'draws',
        icon: icon.growth.reward,
        label: t('growth.dailySurprise'),
        value: t('growth.timesVal', { n: draws }),
        note: moreDraws ? unlockAt(moreDraws.level, t('growth.timesVal', { n: moreDraws.freeDraws })) : topNote,
        upgrade: Boolean(moreDraws),
      },
    ];
  });

  const points = computed(() => Number(props.growth.points || 0));
  const weekExp = computed(() => Number(props.stats.weekExp || 0));
  const joinDays = computed(() => Number(props.stats.joinDays || 0));
  // 积累只展示非零项，避免新用户面对一排 0。
  const accumulation = computed(() =>
    [
      { key: 'bookmark', label: t('growth.statBookmarks'), value: props.stats.bookmarkCount },
      { key: 'note', label: t('growth.statNotes'), value: props.stats.noteCount },
      { key: 'file', label: t('growth.statFiles'), value: props.stats.fileCount },
      { key: 'tag', label: t('growth.statTags'), value: props.stats.tagCount },
      { key: 'todo', label: t('growth.statTodos'), value: props.stats.completedTodoCount },
      { key: 'organized', label: t('growth.statOrganized'), value: props.stats.organizedResourceCount },
    ].filter((item) => Number(item.value || 0) > 0),
  );
</script>

<style scoped lang="less">
  @import (reference) '@/assets/css/ui-density.less';

  .rank-panel {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .rank-panel__top {
    display: flex;
    align-items: center;
    gap: .ui-space(18px) [];
  }
  .rank-panel__avatar {
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    margin: .ui-space(8px) [] .ui-space(6px) [] .ui-space(8px) [] .ui-space(10px) [];
  }
  /* 头像框按主题真实外径占位（默认 outer 模式），满级等大外框不压住名字或溢出卡片。 */
  .rank-panel__avatar.has-frame {
    margin: 0;
  }
  .rank-panel__face {
    border: 2px solid var(--surface-card-bg);
    border-radius: 50%;
    box-shadow: 0 0 0 1px var(--card-border-color);
    overflow: hidden;
  }
  .rank-panel__identity {
    min-width: 0;
  }
  .rank-panel__name {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: .ui-space(8px) [];
  }
  .rank-panel__name h2 {
    margin: 0;
    color: var(--text-color);
    font-size: .ui-font(22px) [];
    font-weight: 700;
    letter-spacing: 0.02em;
  }
  .rank-panel__lv {
    padding: .ui-space(2px) [] .ui-space(8px) [];
    border-radius: 6px;
    color: #fff;
    font-size: .ui-font(12px) [];
    font-weight: 700;
  }
  .rank-panel__max {
    display: inline-flex;
    align-items: center;
    gap: .ui-space(3px) [];
    padding: .ui-space(1px) [] .ui-space(8px) [];
    border: 1px solid var(--warning-color);
    border-radius: 999px;
    color: var(--warning-color);
    font-size: .ui-font(12px) [];
    font-weight: 600;
  }
  .rank-panel__earn.b_btn {
    width: .ui-control(28px) [];
    height: .ui-control(28px) [];
    color: var(--desc-color);
  }
  .rank-panel__sub {
    margin-top: .ui-space(6px) [];
    color: var(--desc-color);
    font-size: .ui-font(13px) [];
  }
  .rank-panel__points {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: .ui-space(2px) [];
    margin-left: auto;
  }
  .rank-panel__points small {
    color: var(--desc-color);
    font-size: .ui-font(12px) [];
  }
  .rank-panel__points b {
    color: var(--warning-color);
    font-size: .ui-font(22px) [];
    font-weight: 700;
    line-height: 1.1;
  }
  .rank-panel__points b.is-empty {
    color: var(--desc-color);
  }
  .rank-panel__link.b_btn {
    gap: .ui-space(2px) [];
    height: auto;
    padding: 0;
    color: var(--primary-color);
    font-weight: 600;
  }

  .rank-track {
    position: relative;
    height: .ui-layout(22px) [];
    margin: .ui-space(24px) [] .ui-space(12px) [] 0;
  }
  .rank-track__rail,
  .rank-track__fill {
    position: absolute;
    top: .ui-space(9px) [];
    left: 0;
    height: .ui-space(4px) [];
    border-radius: 999px;
  }
  .rank-track__rail {
    right: 0;
    background: var(--hover-background);
  }
  .rank-track__fill {
    background: var(--primary-color);
  }
  .rank-track__node {
    position: absolute;
    top: .ui-space(5px) [];
    width: .ui-space(12px) [];
    height: .ui-space(12px) [];
    border: 2px solid var(--card-border-color);
    border-radius: 50%;
    background: var(--surface-card-bg);
    box-sizing: border-box;
    transform: translateX(-50%);
  }
  .rank-track__node.is-on {
    border-color: var(--primary-color);
    background: var(--primary-color);
  }
  .rank-track__node.is-current {
    top: 0;
    width: .ui-space(22px) [];
    height: .ui-space(22px) [];
    border: 3px solid var(--primary-color);
    background: var(--surface-card-bg);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--primary-color) 18%, transparent);
  }
  .rank-track__node.is-next {
    border-style: dashed;
    border-color: var(--primary-color);
  }
  .rank-track__node.is-crown {
    top: -3px;
    display: grid;
    width: .ui-space(28px) [];
    height: .ui-space(28px) [];
    place-items: center;
    border: 2px solid var(--warning-color);
    background: var(--warning-color);
    color: #fff;
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--warning-color) 18%, transparent);
  }
  .rank-track__ticks {
    position: relative;
    height: .ui-space(16px) [];
    margin: .ui-space(6px) [] .ui-space(12px) [] 0;
    color: var(--desc-color);
    font-size: .ui-font(11px) [];
  }
  .rank-track__ticks span {
    position: absolute;
    transform: translateX(-50%);
    white-space: nowrap;
  }
  .rank-panel__caption {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: .ui-space(4px) [] .ui-space(12px) [];
    margin-top: .ui-space(8px) [];
    color: var(--desc-color);
    font-size: .ui-font(13px) [];
  }
  .rank-panel__caption b {
    color: var(--text-color);
    font-weight: 600;
  }
  .rank-panel__need {
    color: var(--primary-color);
    font-weight: 600;
  }

  .rank-benefits {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    margin-top: .ui-space(16px) [];
    border: 1px solid var(--surface-divider-color);
    border-radius: 12px;
  }
  .rank-benefit {
    display: flex;
    flex-direction: column;
    gap: .ui-space(3px) [];
    min-width: 0;
    padding: .ui-space(12px) [] .ui-space(14px) [];
    border-left: 1px solid var(--surface-divider-color);
  }
  .rank-benefit:first-child {
    border-left: 0;
  }
  .rank-benefit__label {
    display: flex;
    align-items: center;
    gap: .ui-space(6px) [];
    color: var(--desc-color);
    font-size: .ui-font(12px) [];
  }
  .rank-benefit__icon {
    display: grid;
    width: .ui-layout(22px) [];
    height: .ui-layout(22px) [];
    flex: 0 0 auto;
    place-items: center;
    border-radius: 7px;
    background: color-mix(in srgb, var(--primary-color) 10%, transparent);
    color: var(--primary-color);
  }
  .rank-benefit b {
    color: var(--text-color);
    font-size: .ui-font(17px) [];
    font-weight: 700;
    white-space: nowrap;
  }
  .rank-benefit em {
    color: var(--primary-color);
    font-size: .ui-font(12px) [];
    font-style: normal;
    font-weight: 600;
  }
  .rank-benefit em.is-plain {
    color: var(--desc-color);
    font-weight: 500;
  }
  .rank-panel__accum {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: .ui-space(6px) [] .ui-space(16px) [];
    margin-top: .ui-space(14px) [];
    color: var(--desc-color);
    font-size: .ui-font(13px) [];
  }
  .rank-panel__accum b {
    color: var(--text-color);
    font-weight: 600;
  }
  .rank-panel__companion b {
    color: var(--primary-color);
    font-size: .ui-font(15px) [];
  }
  .rank-panel__all.b_btn {
    margin-left: auto;
  }

  .rank-panel-earn {
    display: flex;
    flex-direction: column;
    gap: .ui-space(8px) [];
    box-sizing: border-box;
    width: .ui-layout(344px) [];
    max-width: calc(100vw - 2 * var(--ui-space-16, 16px));
    padding: .ui-space(14px) [] .ui-space(16px) [];
    color: var(--text-color);
    font-size: .ui-font(13px) [];
  }
  .rank-panel-earn__rules {
    margin: 0;
  }
  .rank-panel-earn__row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: baseline;
    column-gap: .ui-space(12px) [];
    padding: .ui-space(6px) [] 0;
    border-top: 1px solid var(--surface-divider-color);
  }
  .rank-panel-earn__row:first-child {
    border-top: 0;
    padding-top: 0;
  }
  .rank-panel-earn__row dt {
    min-width: 0;
    color: var(--desc-color);
  }
  .rank-panel-earn__row dd {
    margin: 0;
    color: var(--text-color);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    text-align: right;
    white-space: nowrap;
  }
  .rank-panel-earn__row.is-stacked {
    grid-template-columns: minmax(0, 1fr);
    row-gap: .ui-space(3px) [];
  }
  .rank-panel-earn__row.is-stacked dd {
    font-weight: 400;
    line-height: 1.55;
    text-align: left;
    white-space: normal;
  }
  .rank-panel-earn__notes {
    display: flex;
    flex-direction: column;
    gap: .ui-space(4px) [];
    padding-top: .ui-space(8px) [];
    border-top: 1px solid var(--surface-divider-color);
  }
  .rank-panel-earn__notes p {
    margin: 0;
    color: var(--desc-color);
    font-size: .ui-font(12px) [];
    line-height: 1.55;
  }

  @media (max-width: 1180px) {
    .rank-benefits {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .rank-benefit:nth-child(3) {
      border-left: 0;
    }
    .rank-benefit:nth-child(n + 3) {
      border-top: 1px solid var(--surface-divider-color);
    }
  }

  .rank-panel--stacked {
    .rank-panel__top {
      gap: .ui-space(12px) [];
    }
    .rank-panel__name h2 {
      font-size: .ui-font(19px) [];
    }
    .rank-track {
      margin: .ui-space(20px) [] .ui-space(10px) [] 0;
    }
    .rank-panel__caption {
      flex-direction: column;
      margin-top: .ui-space(10px) [];
      font-size: .ui-font(12px) [];
    }
    .rank-benefits {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .rank-benefit {
      padding: .ui-space(10px) [] .ui-space(12px) [];
    }
    .rank-benefit:nth-child(3) {
      border-left: 0;
    }
    .rank-benefit:nth-child(n + 3) {
      border-top: 1px solid var(--surface-divider-color);
    }
    .rank-panel__all.b_btn {
      margin-left: 0;
      width: 100%;
      justify-content: flex-start;
    }
  }
</style>
