<template>
  <div class="ps">
    <div class="ps-head">
      <div class="ps-head-left">
        <div class="ps-title">🛍️ {{ t('growth.shopTitle') }}</div>
        <div class="ps-sub">{{ t('growth.shopSubtitle') }}</div>
      </div>
      <div class="ps-balance">
        <span class="ps-balance-label">{{ t('growth.myPoints') }}</span>
        <span class="ps-balance-num">🪙 {{ (shop?.points || 0).toLocaleString('en-US') }}</span>
        <button v-if="!shop?.isVisitor" class="ps-log-link" @click="logVisible = true">{{ t('growth.pointsLogEntry') }} ›</button>
      </div>
    </div>

    <PointsLogModal v-model:visible="logVisible" />

    <div class="ps-earn">💡 {{ t('growth.shopEarnHint') }}</div>
    <div v-if="shop?.isVisitor" class="ps-visitor">{{ t('growth.shopVisitorTip') }}</div>

    <!-- 实用道具 -->
    <div v-if="consumables.length" class="ps-section-title">{{ t('growth.shopSectionConsumable') }}</div>
    <div class="ps-grid">
      <div v-for="it in consumables" :key="it.id" class="ps-item">
        <div class="ps-item-icon">{{ ICONS[it.id] || '🎁' }}</div>
        <div class="ps-item-body">
          <div class="ps-item-name">{{ itemName(it) }}</div>
          <div class="ps-item-desc">{{ itemDesc(it) }}</div>
        </div>
        <div class="ps-item-foot">
          <span class="ps-item-cost">🪙 {{ it.cost }}</span>
          <BButton
            size="small"
            type="primary"
            :disabled="!it.canBuy || buyingId === it.id"
            :loading="buyingId === it.id"
            @click="askBuy(it)"
          >
            {{ consumableBtn(it) }}
          </BButton>
        </div>
      </div>
    </div>

    <!-- 专属称号 -->
    <div v-if="titles.length" class="ps-section-title">{{ t('growth.shopSectionTitle') }}</div>
    <div class="ps-grid">
      <div v-for="it in titles" :key="it.id" class="ps-item" :class="{ 'is-equipped': it.equipped }">
        <div class="ps-item-icon">{{ ICONS[it.id] || '🏅' }}</div>
        <div class="ps-item-body">
          <div class="ps-item-name">
            {{ itemName(it) }}
            <span v-if="it.equipped" class="ps-tag-equipped">{{ t('growth.shopEquipped') }}</span>
          </div>
          <div class="ps-item-desc">{{ itemDesc(it) }}</div>
        </div>
        <div class="ps-item-foot">
          <span v-if="!it.owned" class="ps-item-cost">🪙 {{ it.cost }}</span>
          <span v-else class="ps-item-cost ps-item-cost--owned">{{ t('growth.shopOwned') }}</span>
          <!-- 已拥有:佩戴 / 卸下;未拥有:兑换 -->
          <template v-if="it.owned">
            <BButton v-if="it.equipped" size="small" :disabled="equippingId === it.id" :loading="equippingId === it.id" @click="doEquip(null)">
              {{ t('growth.shopUnequip') }}
            </BButton>
            <BButton v-else size="small" type="primary" :disabled="equippingId === it.id" :loading="equippingId === it.id" @click="doEquip(it.id)">
              {{ t('growth.shopEquip') }}
            </BButton>
          </template>
          <BButton
            v-else
            size="small"
            type="primary"
            :disabled="!it.canBuy || buyingId === it.id"
            :loading="buyingId === it.id"
            @click="askBuy(it)"
          >
            {{ titleBtn(it) }}
          </BButton>
        </div>
      </div>
    </div>

    <div v-if="!consumables.length && !titles.length" class="ps-empty">{{ t('growth.shopEmpty') }}</div>

    <!-- 兑换确认 -->
    <BModal v-model:visible="confirmVisible" :title="t('growth.shopBuy')" width="360px" @ok="confirmBuy">
      <div class="ps-confirm">{{ pending ? t('growth.shopBuyConfirm', { n: pending.cost, name: itemName(pending) }) : '' }}</div>
    </BModal>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useGrowth, type ShopItem } from '@/composables/useGrowth.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import PointsLogModal from '@/components/growth/PointsLogModal.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { recordOperation } from '@/api/commonApi.ts';

  const { t, te } = useI18n();
  const { shop, loadShop, buyItem, equipTitle } = useGrowth();

  // 商品图标(id → emoji);缺省兜底
  const ICONS: Record<string, string> = {
    makeup_card: '🎫',
    ai_pack: '⚡',
    storage_512: '💾',
    storage_2g: '💽',
    title_collector: '📚',
    title_writer: '✍️',
    title_cloud: '☁️',
    title_wellread: '🎓',
    title_ferryman: '⛵',
    title_grandmaster: '👑',
  };

  // 名称/描述优先取 i18n(双语),缺失键则回退后端返回的中文名(单一经济事实源仍在后端)
  function itemName(it: ShopItem) {
    const k = 'growth.shopItems.' + it.id + '.name';
    return te(k) ? t(k) : it.name;
  }
  function itemDesc(it: ShopItem) {
    const k = 'growth.shopItems.' + it.id + '.desc';
    return te(k) ? t(k) : it.desc;
  }

  const consumables = computed(() => shop.value?.items.filter((i) => i.type === 'consumable') || []);
  const titles = computed(() => shop.value?.items.filter((i) => i.type === 'title') || []);

  // 消耗品按钮文案:可买=兑换;否则按原因给出置灰提示
  function consumableBtn(it: ShopItem) {
    if (it.canBuy) return t('growth.shopBuy');
    if (it.id === 'makeup_card' && (shop.value?.protectCards || 0) >= 2) return t('growth.shopCardMax');
    if ((shop.value?.points || 0) < it.cost) return t('growth.shopInsufficient');
    return t('growth.shopBuy');
  }
  // 称号按钮文案:未拥有且不可买 → 等级不足 / 积分不足
  function titleBtn(it: ShopItem) {
    if (it.canBuy) return t('growth.shopBuy');
    if (it.minLevel && (shop.value?.level || 0) < it.minLevel) return t('growth.shopLevelNeed', { n: it.minLevel });
    if ((shop.value?.points || 0) < it.cost) return t('growth.shopInsufficient');
    return t('growth.shopBuy');
  }

  const buyingId = ref<string | null>(null);
  const equippingId = ref<string | null>(null);
  const confirmVisible = ref(false);
  const pending = ref<ShopItem | null>(null);
  const logVisible = ref(false);

  function askBuy(it: ShopItem) {
    if (!it.canBuy) return;
    pending.value = it;
    confirmVisible.value = true;
  }

  async function confirmBuy() {
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

  async function doEquip(titleId: string | null) {
    equippingId.value = titleId || 'unequip';
    try {
      const res = await equipTitle(titleId);
      if (res?.status === 200 && res.data?.ok) {
        if (titleId) {
          const it = titles.value.find((i) => i.id === titleId);
          message.success(t('growth.shopEquipOk', { name: it ? itemName(it) : '' }));
          recordOperation({ module: '成长', operation: `佩戴称号「${it ? itemName(it) : titleId}」` });
        } else {
          message.success(t('growth.shopUnequipOk'));
          recordOperation({ module: '成长', operation: '卸下称号' });
        }
      } else {
        message.error(res?.data?.msg || '操作失败');
      }
    } catch (err) {
      console.error('佩戴称号失败:', err);
    } finally {
      equippingId.value = null;
    }
  }

  onMounted(() => {
    loadShop();
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
    font-size: 18px;
    font-weight: 800;
    color: #d97706;
    font-variant-numeric: tabular-nums;
  }
  .ps-log-link {
    margin-top: 2px;
    background: transparent;
    border: none;
    color: var(--desc-color);
    font-size: 11px;
    cursor: pointer;
    padding: 0;
  }
  .ps-log-link:hover {
    color: var(--primary-color);
  }
  .ps-earn {
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
    border-color: color-mix(in srgb, var(--primary-color) 60%, transparent);
    background: color-mix(in srgb, var(--primary-color) 6%, var(--background-color));
  }
  .ps-item-icon {
    font-size: 26px;
    line-height: 1;
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
  .ps-item-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .ps-item-cost {
    font-size: 13px;
    font-weight: 700;
    color: #d97706;
    font-variant-numeric: tabular-nums;
  }
  .ps-item-cost--owned {
    color: var(--desc-color);
    font-weight: 600;
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
</style>
