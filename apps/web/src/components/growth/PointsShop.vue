<template>
  <div class="ps">
    <div class="ps-head">
      <div class="ps-head-left">
        <div class="ps-title"><SvgIcon :src="icon.growth.reward" size="18" /> {{ t('growth.shopTitle') }}</div>
        <div class="ps-sub">{{ t('growth.shopSubtitle') }}</div>
      </div>
      <div class="ps-balance">
        <span class="ps-balance-label">{{ t('growth.myPoints') }}</span>
        <span class="ps-balance-num"
          ><SvgIcon :src="icon.growth.coin" size="17" /> {{ (shop?.points || 0).toLocaleString('en-US') }}</span
        >
      </div>
    </div>

    <div class="ps-earn"><SvgIcon :src="icon.message.info" size="15" /> {{ t('growth.shopEarnHint') }}</div>
    <div v-if="shop?.isVisitor" class="ps-visitor">{{ t('growth.shopVisitorTip') }}</div>

    <!-- 实用道具 -->
    <div v-if="consumables.length" class="ps-section-title">{{ t('growth.shopSectionConsumable') }}</div>
    <div class="ps-grid">
      <div v-for="it in consumables" :key="it.id" class="ps-item">
        <div class="ps-item-icon"><SvgIcon :src="itemIcon(it.id)" size="27" /></div>
        <div class="ps-item-body">
          <div class="ps-item-name">{{ itemName(it) }}</div>
          <div class="ps-item-desc">{{ itemDesc(it) }}</div>
        </div>
        <div class="ps-item-foot">
          <span class="ps-item-cost"><SvgIcon :src="icon.growth.coin" size="13" /> {{ it.cost }}</span>
          <BButton
            size="small"
            type="primary"
            :disabled="readOnly || !canBuyNow(it) || buyingId === it.id"
            :loading="buyingId === it.id"
            :title="readOnly ? t('growth.adminContextActionUnavailable') : ''"
            @click="askBuy(it)"
          >
            {{ consumableBtn(it) }}
          </BButton>
        </div>
      </div>
    </div>

    <!-- 头像框装扮 -->
    <div v-if="frames.length" class="ps-frame-toolbar">
      <div class="ps-section-title">{{ t('growth.shopSectionFrame') }}</div>
      <BTabs
        v-model:active-tab="activeFrameFilter"
        class="ps-frame-filters"
        variant="pill"
        :options="frameFilterOptions"
      />
    </div>
    <div v-if="frames.length" class="ps-grid ps-frame-grid">
      <div
        v-for="it in visibleFrames"
        :key="it.id"
        class="ps-item ps-frame-item"
        :class="[`ps-frame-item--${frameVariant(it.id) || 'default'}`, { 'is-equipped': it.equipped }]"
      >
        <AvatarFramePreview class="ps-frame-preview" :frame-id="it.id" :src="avatarSrc" :size="64" />
        <div class="ps-item-body">
          <div class="ps-item-name">
            {{ itemName(it) }}
            <span v-if="frameVariant(it.id)" class="ps-frame-style">{{ frameStyleName(it.id) }}</span>
            <span v-if="it.rarity" class="ps-frame-rarity" :class="`ps-frame-rarity--${it.rarity}`">{{
              frameRarityName(it.rarity)
            }}</span>
            <span v-if="isAchievementFrame(it)" class="ps-frame-source">{{ t('growth.frameAchievementOnly') }}</span>
            <span v-if="it.equipped" class="ps-tag-equipped">{{ t('growth.shopEquipped') }}</span>
          </div>
          <div class="ps-item-desc">{{ itemDesc(it) }}</div>
          <div v-if="isAchievementFrame(it)" class="ps-achievement-requirement">
            <SvgIcon :src="icon.growth.reward" size="13" />
            {{ t('growth.frameAchievementRequirement', { condition: achievementRequirement(it) }) }}
          </div>
        </div>
        <div class="ps-item-foot">
          <span v-if="!it.owned && isAchievementFrame(it)" class="ps-achievement-progress">
            <SvgIcon :src="icon.growth.reward" size="13" /> {{ achievementProgress(it) }}
          </span>
          <span v-else-if="isAchievementFrame(it)" class="ps-item-cost ps-item-cost--owned">
            {{ t('growth.shopOwned') }}
          </span>
          <span v-else class="ps-purchase-meta">
            <span class="ps-item-cost"><SvgIcon :src="icon.growth.coin" size="13" /> {{ it.cost }}</span>
            <span v-if="it.owned" class="ps-item-owned">{{ t('growth.shopOwned') }}</span>
          </span>
          <template v-if="canEquipFrame(it)">
            <BButton
              v-if="it.equipped"
              size="small"
              :disabled="readOnly || equippingId === it.id"
              :loading="equippingId === it.id"
              :title="readOnly ? t('growth.adminContextActionUnavailable') : ''"
              @click="doEquipFrame(null)"
            >
              {{ t('growth.shopUnequip') }}
            </BButton>
            <BButton
              v-else
              size="small"
              type="primary"
              :disabled="readOnly || equippingId === it.id"
              :loading="equippingId === it.id"
              :title="readOnly ? t('growth.adminContextActionUnavailable') : ''"
              @click="doEquipFrame(it.id)"
            >
              {{ t('growth.shopEquip') }}
            </BButton>
          </template>
          <BButton
            v-else-if="isAchievementFrame(it)"
            size="small"
            type="primary"
            :disabled="readOnly || !achievementFor(it)?.claimable || claimingId === it.id"
            :loading="claimingId === it.id"
            :title="readOnly ? t('growth.adminContextActionUnavailable') : ''"
            @click="doClaimFrame(it)"
          >
            {{ achievementButton(it) }}
          </BButton>
          <BButton
            v-else
            size="small"
            type="primary"
            :disabled="readOnly || !canBuyNow(it) || buyingId === it.id"
            :loading="buyingId === it.id"
            :title="readOnly ? t('growth.adminContextActionUnavailable') : ''"
            @click="askBuy(it)"
          >
            {{ titleBtn(it) }}
          </BButton>
        </div>
      </div>
    </div>

    <div v-if="!consumables.length && !frames.length" class="ps-empty">{{ t('growth.shopEmpty') }}</div>

    <!-- 兑换确认 -->
    <BModal v-model:visible="confirmVisible" :title="t('growth.shopBuy')" width="360px" @ok="confirmBuy">
      <div class="ps-confirm">{{
        pending ? t('growth.shopBuyConfirm', { n: pending.cost, name: itemName(pending) }) : ''
      }}</div>
    </BModal>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useGrowth, type ShopItem } from '@/composables/useGrowth.ts';
  import { useUserStore } from '@/store';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import AvatarFramePreview from '@/components/growth/AvatarFramePreview.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { recordOperation } from '@/api/commonApi.ts';
  import { frameVariant, sortFramesByRarity } from '@/config/growthFrames';

  const { t, te } = useI18n();
  const props = withDefaults(defineProps<{ readOnly?: boolean }>(), { readOnly: false });
  const readOnly = computed(() => props.readOnly);
  const { dashboard, shop, loadShop, buyItem, equipFrame, claimAchievement } = useGrowth();
  const user = useUserStore();
  const avatarSrc = computed(() => user.headPicture || icon.navigation.user);

  function itemIcon(itemId: string) {
    if (itemId.startsWith('ai_pack')) return icon.growth.ai;
    if (itemId.startsWith('storage_')) return icon.growth.storage;
    return icon.growth.reward;
  }

  // 名称/描述优先取 i18n(双语),缺失键则回退后端返回的中文名(单一经济事实源仍在后端)
  function itemName(it: ShopItem) {
    const k = 'growth.shopItems.' + it.id + '.name';
    return te(k) ? t(k) : it.name;
  }
  function itemDesc(it: ShopItem) {
    const k = 'growth.shopItems.' + it.id + '.desc';
    return te(k) ? t(k) : it.desc;
  }

  function frameStyleName(frameId: string) {
    const key = `growth.frameStyles.${frameId}`;
    return te(key) ? t(key) : '';
  }

  const consumables = computed(() => shop.value?.items.filter((i) => i.type === 'consumable') || []);
  const frames = computed(() =>
    sortFramesByRarity(shop.value?.frames || shop.value?.items.filter((i) => i.type === 'cosmetic') || []),
  );
  type FrameFilter = 'all' | 'basic' | 'rare' | 'epic' | 'legendary';
  const activeFrameFilter = ref<FrameFilter>('all');
  const frameFilters: FrameFilter[] = ['all', 'basic', 'rare', 'epic', 'legendary'];
  const frameFilterOptions = computed(() =>
    frameFilters.map((filter) => ({
      key: filter,
      label: t(`growth.frameFilters.${filter}`),
      badge: filter === 'all' ? frames.value.length : frames.value.filter((it) => it.rarity === filter).length,
    })),
  );
  const visibleFrames = computed(() =>
    activeFrameFilter.value === 'all'
      ? frames.value
      : frames.value.filter((it) => it.rarity === activeFrameFilter.value),
  );

  function frameRarityName(rarity: NonNullable<ShopItem['rarity']>) {
    return t(`growth.frameRarity.${rarity}`);
  }

  function isAchievementFrame(it: ShopItem) {
    return it.acquisition === 'achievement' && Boolean(it.achievementKey);
  }

  function canEquipFrame(it: ShopItem) {
    return it.type === 'cosmetic' && Boolean(it.canEquip || it.owned || shop.value?.rootFrameAccess);
  }

  function achievementFor(it: ShopItem) {
    return dashboard.value?.achievements.find((achievement) => achievement.key === it.achievementKey);
  }

  function achievementProgress(it: ShopItem) {
    const achievement = achievementFor(it);
    if (!achievement) return t('growth.frameAchievementLocked');
    if (achievement.claimable) return t('growth.frameAchievementReady');
    if (
      achievement.minLevel &&
      achievement.cur >= achievement.target &&
      Number(achievement.currentLevel || 0) < achievement.minLevel
    ) {
      return t('growth.frameAchievementLevelProgress', {
        cur: achievement.currentLevel || 0,
        target: achievement.minLevel,
      });
    }
    return t('growth.frameAchievementProgress', {
      cur: Math.min(achievement.cur, achievement.target),
      target: achievement.target,
    });
  }

  function achievementRequirement(it: ShopItem) {
    const key = it.achievementKey ? `growth.achDesc.${it.achievementKey}` : '';
    const condition = key && te(key) ? t(key) : achievementProgress(it);
    const minLevel = achievementFor(it)?.minLevel || 0;
    return minLevel ? t('growth.frameAchievementConditionWithLevel', { condition, level: minLevel }) : condition;
  }

  function achievementButton(it: ShopItem) {
    const achievement = achievementFor(it);
    if (achievement?.claimable) return t('growth.frameAchievementClaim');
    if (achievement?.claimed) return t('growth.achClaimed');
    return t('growth.frameAchievementLocked');
  }

  // 可兑换判定:全前端按 live shop.points/level/owned/上限 实时算,积分变动即时生效(不依赖服务端 canBuy 快照,免刷新)
  function canBuyNow(it: ShopItem) {
    if (readOnly.value) return false;
    const s = shop.value;
    if (!s || s.isVisitor || canEquipFrame(it) || it.acquisition === 'achievement') return false;
    if (it.minLevel && (s.level || 0) < it.minLevel) return false;
    if (it.effect === 'makeup_card' && (s.protectCards || 0) >= 2) return false;
    return (s.points || 0) >= Number(it.cost || 0);
  }

  // 消耗品按钮文案:可买=兑换;否则按原因给出置灰提示
  function consumableBtn(it: ShopItem) {
    if (canBuyNow(it)) return t('growth.shopBuy');
    if (it.id === 'makeup_card' && (shop.value?.protectCards || 0) >= 2) return t('growth.shopCardMax');
    if ((shop.value?.points || 0) < Number(it.cost || 0)) return t('growth.shopInsufficient');
    return t('growth.shopBuy');
  }
  // 称号按钮文案:未拥有且不可买 → 等级不足 / 积分不足
  function titleBtn(it: ShopItem) {
    if (canBuyNow(it)) return t('growth.shopBuy');
    if (it.minLevel && (shop.value?.level || 0) < it.minLevel) return t('growth.shopLevelNeed', { n: it.minLevel });
    if ((shop.value?.points || 0) < Number(it.cost || 0)) return t('growth.shopInsufficient');
    return t('growth.shopBuy');
  }

  const buyingId = ref<string | null>(null);
  const equippingId = ref<string | null>(null);
  const claimingId = ref<string | null>(null);
  const confirmVisible = ref(false);
  const pending = ref<ShopItem | null>(null);

  function askBuy(it: ShopItem) {
    if (readOnly.value || !canBuyNow(it)) return;
    pending.value = it;
    confirmVisible.value = true;
  }

  async function confirmBuy() {
    if (readOnly.value) return;
    const it = pending.value;
    confirmVisible.value = false;
    if (!it) return;
    buyingId.value = it.id;
    try {
      const res = await buyItem(it.id);
      if (res?.status === 200 && res.data?.ok) {
        message.success(t('growth.shopBuyOk'));
        recordOperation({ module: '成长', operation: `兑换「${itemName(it)}」（-${it.cost} 积分）` });
      } else {
        message.error(res?.data?.msg || t('growth.shopInsufficient'));
      }
    } catch (err) {
      console.error('兑换失败:', err);
    } finally {
      buyingId.value = null;
      pending.value = null;
    }
  }

  async function doClaimFrame(it: ShopItem) {
    if (readOnly.value || !it.achievementKey || !achievementFor(it)?.claimable) return;
    claimingId.value = it.id;
    try {
      const res = await claimAchievement(it.achievementKey);
      if (res?.status === 200 && res.data?.ok) {
        message.success(t('growth.frameAchievementClaimOk', { name: itemName(it) }));
        recordOperation({ module: '成长', operation: `领取成就头像框「${itemName(it)}」` });
      } else {
        message.error(res?.data?.msg || t('growth.operationFailed'));
      }
    } catch (err) {
      console.error('领取成就头像框失败:', err);
      message.error(t('growth.operationFailed'));
    } finally {
      claimingId.value = null;
    }
  }

  async function doEquipFrame(frameId: string | null) {
    if (readOnly.value) return;
    equippingId.value = frameId || 'unequip';
    try {
      const res = await equipFrame(frameId);
      if (res?.status === 200 && res.data?.ok) {
        if (frameId) {
          const it = frames.value.find((i) => i.id === frameId);
          message.success(t('growth.shopEquipOk', { name: it ? itemName(it) : '' }));
          recordOperation({ module: '成长', operation: `佩戴头像框「${it ? itemName(it) : frameId}」` });
        } else {
          message.success(t('growth.shopUnequipOk'));
          recordOperation({ module: '成长', operation: '卸下头像框' });
        }
      } else {
        message.error(res?.data?.msg || t('growth.operationFailed'));
      }
    } catch (err) {
      console.error('佩戴头像框失败:', err);
    } finally {
      equippingId.value = null;
    }
  }

  onMounted(() => {
    void loadShop();
  });
</script>

<style scoped lang="less">
  .ps {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .ps-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }
  .ps-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 16px;
    font-weight: 700;
  }
  .ps-sub {
    margin-top: 4px;
    font-size: 12.5px;
    color: var(--desc-color);
    max-width: 420px;
  }
  .ps-balance {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    padding: 8px 14px;
    border-radius: 12px;
    background: color-mix(in srgb, #f59e0b 10%, var(--background-color));
    border: 1px solid color-mix(in srgb, #f59e0b 30%, transparent);
    white-space: nowrap;
  }
  .ps-balance-label {
    font-size: 11px;
    color: var(--desc-color);
  }
  .ps-balance-num {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 18px;
    font-weight: 800;
    color: #d97706;
    font-variant-numeric: tabular-nums;
  }
  .ps-earn {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--desc-color);
    padding: 8px 12px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--primary-color) 5%, var(--background-color));
    border: 1px dashed color-mix(in srgb, var(--primary-color) 30%, transparent);
  }
  .ps-visitor {
    font-size: 12.5px;
    color: var(--primary-color);
  }
  .ps-section-title {
    font-size: 12.5px;
    font-weight: 700;
    color: var(--desc-color);
    letter-spacing: 0.03em;
    margin-top: 4px;
  }
  .ps-frame-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px 16px;
    margin-top: 4px;
    flex-wrap: wrap;
  }
  .ps-frame-toolbar .ps-section-title {
    margin-top: 0;
  }
  .ps-frame-filters {
    flex-wrap: wrap;
  }
  .ps-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }
  @media (max-width: 560px) {
    .ps-grid {
      grid-template-columns: 1fr;
    }
  }
  .ps-item {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px;
    border-radius: 14px;
    background: var(--background-color);
    border: 1px solid color-mix(in srgb, var(--card-border-color) 50%, transparent);
    transition:
      border-color 0.15s,
      transform 0.15s,
      box-shadow 0.15s;
  }
  .ps-item:hover {
    border-color: color-mix(in srgb, var(--primary-color) 40%, transparent);
    transform: translateY(-2px);
    box-shadow: 0 10px 24px -18px rgba(30, 35, 70, 0.5);
  }
  .ps-item.is-equipped {
    border-color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 6%, var(--background-color));
    box-shadow: inset 0 0 0 1px var(--primary-color);
  }
  .ps-item-icon {
    color: var(--primary-color);
  }
  .ps-frame-grid {
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  }
  .ps-frame-item {
    display: grid;
    grid-template-areas:
      'preview body'
      'preview foot';
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    column-gap: 15px;
    row-gap: 10px;
    min-height: 112px;
    padding: 16px;
    overflow: hidden;
  }
  .ps-frame-item--mint {
    background:
      radial-gradient(circle at 8% 50%, color-mix(in srgb, #5eead4 12%, transparent), transparent 33%),
      linear-gradient(135deg, color-mix(in srgb, #14b8a6 12%, var(--background-color)), var(--background-color) 54%);
  }
  .ps-frame-item--ink {
    background:
      radial-gradient(circle at 8% 50%, color-mix(in srgb, #cbd5e1 9%, transparent), transparent 34%),
      linear-gradient(135deg, color-mix(in srgb, #64748b 11%, var(--background-color)), var(--background-color) 54%);
  }
  .ps-frame-item--moonstone {
    background:
      radial-gradient(circle at 8% 50%, color-mix(in srgb, #dbeafe 12%, transparent), transparent 34%),
      linear-gradient(135deg, color-mix(in srgb, #94a3b8 10%, var(--background-color)), var(--background-color) 54%);
  }
  .ps-frame-item--gold {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, #f59e0b 11%, var(--background-color)),
      var(--background-color) 52%
    );
  }
  .ps-frame-item--sakura {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, #ec4899 10%, var(--background-color)),
      var(--background-color) 54%
    );
  }
  .ps-frame-item--neon {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, #6366f1 15%, var(--background-color)),
      color-mix(in srgb, #22d3ee 7%, var(--background-color)) 52%,
      var(--background-color) 54%
    );
  }
  .ps-frame-item--sunset {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, #fb7185 11%, var(--background-color)),
      var(--background-color) 54%
    );
  }
  .ps-frame-item--ocean {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, #0ea5e9 11%, var(--background-color)),
      var(--background-color) 54%
    );
  }
  .ps-frame-item--aurora {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, #10b981 13%, var(--background-color)),
      color-mix(in srgb, #7c3aed 7%, var(--background-color)) 55%,
      var(--background-color)
    );
  }
  .ps-frame-item--streak-month {
    background:
      radial-gradient(circle at 9% 50%, color-mix(in srgb, #c4b5fd 14%, transparent), transparent 34%),
      linear-gradient(135deg, color-mix(in srgb, #4f46e5 13%, var(--background-color)), var(--background-color) 58%);
  }
  .ps-frame-item--galaxy,
  .ps-frame-item--galaxy.is-equipped {
    background:
      radial-gradient(circle at 87% 18%, rgba(255, 255, 255, 0.86) 0 1px, transparent 1.6px),
      radial-gradient(circle at 74% 77%, rgba(224, 231, 255, 0.72) 0 1px, transparent 1.5px),
      linear-gradient(135deg, color-mix(in srgb, #7c3aed 16%, var(--background-color)), var(--background-color) 58%);
  }
  .ps-frame-item--galaxy:hover {
    border-color: color-mix(in srgb, #a78bfa 68%, var(--card-border-color));
    box-shadow: 0 12px 26px -18px rgba(91, 33, 182, 0.68);
  }
  .ps-frame-item--flame {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, #ef4444 14%, var(--background-color)),
      color-mix(in srgb, #f59e0b 7%, var(--background-color)) 56%,
      var(--background-color)
    );
  }
  .ps-frame-item--dragon,
  .ps-frame-item--dragon.is-equipped {
    background:
      radial-gradient(circle at 86% 18%, rgba(254, 243, 199, 0.72) 0 1px, transparent 1.7px),
      linear-gradient(135deg, color-mix(in srgb, #b91c1c 16%, var(--background-color)), var(--background-color) 58%);
  }
  .ps-frame-item--dragon:hover {
    border-color: #d97706;
    box-shadow: 0 12px 26px -18px rgba(153, 27, 27, 0.75);
  }
  .ps-frame-item--celestial,
  .ps-frame-item--celestial.is-equipped {
    background:
      radial-gradient(circle at 11% 50%, rgba(250, 204, 21, 0.2) 0, transparent 33%),
      radial-gradient(circle at 87% 18%, rgba(254, 243, 199, 0.92) 0 1px, transparent 1.7px),
      radial-gradient(circle at 73% 78%, rgba(221, 214, 254, 0.82) 0 1px, transparent 1.6px),
      linear-gradient(
        135deg,
        color-mix(in srgb, #312e81 26%, var(--background-color)),
        color-mix(in srgb, #d97706 9%, var(--background-color)) 54%,
        var(--background-color) 78%
      );
  }
  .ps-frame-item--celestial:hover {
    border-color: #f59e0b;
    box-shadow: 0 12px 28px -17px rgba(49, 46, 129, 0.82);
  }
  .ps-frame-item--note-constellation,
  .ps-frame-item--note-constellation.is-equipped {
    background:
      radial-gradient(circle at 10% 50%, rgba(52, 211, 153, 0.18) 0, transparent 32%),
      radial-gradient(circle at 86% 20%, rgba(254, 240, 138, 0.86) 0 1px, transparent 1.7px),
      linear-gradient(
        135deg,
        color-mix(in srgb, #064e3b 20%, var(--background-color)),
        color-mix(in srgb, #312e81 8%, var(--background-color)) 56%,
        var(--background-color) 80%
      );
  }
  .ps-frame-item--note-constellation:hover {
    border-color: #10b981;
    box-shadow: 0 12px 30px -17px rgba(6, 95, 70, 0.82);
  }
  .ps-frame-item--file-constellation,
  .ps-frame-item--file-constellation.is-equipped {
    background:
      radial-gradient(circle at 10% 50%, rgba(56, 189, 248, 0.18) 0, transparent 32%),
      radial-gradient(circle at 86% 20%, rgba(224, 242, 254, 0.92) 0 1px, transparent 1.7px),
      linear-gradient(
        135deg,
        color-mix(in srgb, #075985 21%, var(--background-color)),
        color-mix(in srgb, #f59e0b 8%, var(--background-color)) 56%,
        var(--background-color) 80%
      );
  }
  .ps-frame-item--file-constellation:hover {
    border-color: #38bdf8;
    box-shadow: 0 12px 30px -17px rgba(3, 105, 161, 0.82);
  }
  .ps-frame-item--streak-eternal,
  .ps-frame-item--streak-eternal.is-equipped {
    background:
      radial-gradient(circle at 11% 50%, rgba(253, 224, 71, 0.15) 0, transparent 31%),
      radial-gradient(circle at 86% 20%, rgba(219, 234, 254, 0.9) 0 1px, transparent 1.7px),
      linear-gradient(
        135deg,
        color-mix(in srgb, #1d4ed8 19%, var(--background-color)),
        color-mix(in srgb, #7c3aed 10%, var(--background-color)) 55%,
        var(--background-color) 80%
      );
  }
  .ps-frame-item--streak-eternal:hover {
    border-color: #facc15;
    box-shadow: 0 12px 30px -17px rgba(79, 70, 229, 0.86);
  }
  .ps-frame-preview {
    grid-area: preview;
  }
  .ps-frame-item .ps-item-body {
    grid-area: body;
    align-self: end;
  }
  .ps-frame-item .ps-item-foot {
    grid-area: foot;
    align-self: start;
  }
  .ps-item-body {
    flex: 1 1 auto;
    min-width: 0;
  }
  .ps-item-name {
    font-size: 14px;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .ps-frame-style {
    padding: 2px 7px;
    border-radius: 999px;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 9%, transparent);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.02em;
  }
  .ps-frame-rarity {
    padding: 2px 7px;
    border: 1px solid #cbd5e1;
    border-radius: 999px;
    color: #475569;
    background: #f8fafc;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.06em;
  }
  .ps-frame-rarity--rare {
    border-color: #7dd3fc;
    color: #075985;
    background: #e0f2fe;
  }
  .ps-frame-rarity--epic {
    border-color: #c4b5fd;
    color: #5b21b6;
    background: #ede9fe;
  }
  .ps-frame-rarity--legendary {
    border-color: #fde68a;
    color: #fff7ed;
    background: linear-gradient(135deg, #7c3aed, #92400e);
    box-shadow: 0 2px 8px -4px rgba(76, 29, 149, 0.92);
  }
  .ps-frame-source {
    padding: 2px 7px;
    border: 1px solid var(--primary-color);
    border-radius: 999px;
    color: var(--primary-color);
    background: var(--background-color);
    font-size: 10px;
    font-weight: 700;
  }
  .ps-tag-equipped {
    font-size: 10.5px;
    font-weight: 600;
    padding: 1px 7px;
    border-radius: 999px;
    color: #fff;
    background: linear-gradient(135deg, var(--primary-color), #22d3ee);
  }
  .ps-item-desc {
    margin-top: 4px;
    font-size: 12px;
    color: var(--desc-color);
    line-height: 1.5;
  }
  .ps-achievement-requirement {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 5px;
    color: var(--primary-color);
    font-size: 11.5px;
    font-weight: 600;
    line-height: 1.4;
  }
  .ps-item-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .ps-item-cost {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 13px;
    font-weight: 700;
    color: #d97706;
    font-variant-numeric: tabular-nums;
  }
  .ps-item-cost--owned {
    color: var(--desc-color);
    font-weight: 600;
  }
  .ps-purchase-meta {
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    flex-wrap: wrap;
  }
  .ps-item-owned {
    color: var(--desc-color);
    font-size: 11px;
    font-weight: 700;
  }
  .ps-achievement-progress {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--primary-color);
    font-size: 12px;
    font-weight: 700;
  }
  .ps-empty {
    text-align: center;
    color: var(--desc-color);
    font-size: 13px;
    padding: 20px 0;
  }
  .ps-confirm {
    font-size: 14px;
    line-height: 1.6;
    padding: 4px 2px;
  }
  @media (max-width: 560px) {
    .ps-frame-toolbar {
      align-items: flex-start;
      flex-direction: column;
    }
    .ps-frame-filters {
      width: 100%;
    }
    .ps-frame-item {
      column-gap: 12px;
      padding: 14px;
    }
  }
</style>
