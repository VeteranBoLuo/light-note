<template>
  <BModal
    :visible="visible"
    :title="`成长运营 · ${userName || '用户'}`"
    width="420px"
    :show-footer="false"
    :mask-closable="true"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="ga">
      <div class="ga-cur">
        <span class="ga-cur-label">当前</span>
        <span v-if="cur">Lv.{{ cur.level }} {{ cur.name }} · 经验 {{ cur.exp }} · 补签卡 {{ cur.protectCards || 0 }}</span>
        <span v-else class="ga-cur-loading">加载中…</span>
      </div>

      <div class="ga-field">
        <label>发放 / 扣减经验</label>
        <BInput v-model:value="expDelta" type="number" class="ga-control" placeholder="正数发放，负数扣减" />
      </div>
      <div class="ga-field">
        <label>直接设定等级<em>(优先于经验)</em></label>
        <BSelect v-model:value="setLevel" class="ga-control" :options="levelOptions" />
      </div>
      <div class="ga-field">
        <label>增减补签卡</label>
        <BInput v-model:value="cardDelta" type="number" class="ga-control" placeholder="正数赠送，负数扣除" />
      </div>

      <div class="ga-actions">
        <BButton type="primary" :loading="saving" @click="submit">确认调整</BButton>
      </div>
    </div>
  </BModal>

  <AdminRiskActionModal
    v-model:visible="confirmVisible"
    title="确认调整成长资产"
    :impact="confirmImpact"
    confirm-phrase="确认调整成长"
    :loading="saving"
    @confirm="confirmSubmit"
  />
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import AdminRiskActionModal from '@/components/admin/AdminRiskActionModal.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import growthApi from '@/api/growthApi.ts';

  const props = defineProps<{ visible: boolean; userId: string; userName?: string }>();
  const emit = defineEmits<{ (e: 'update:visible', v: boolean): void }>();

  const cur = ref<any>(null);
  const expDelta = ref('');
  const setLevel = ref<string | number>('');
  const cardDelta = ref('');
  const saving = ref(false);
  const confirmVisible = ref(false);
  const levelOptions = [{ value: '', label: '不改' }, ...Array.from({ length: 15 }, (_, index) => ({
    value: index + 1,
    label: `Lv.${index + 1}`,
  }))];
  const pendingPayload = computed(() => {
    const payload: { userId: string; expDelta?: number; setLevel?: number; cardDelta?: number } = {
      userId: props.userId,
    };
    if (setLevel.value !== '') payload.setLevel = Number(setLevel.value);
    else if (expDelta.value) payload.expDelta = Number(expDelta.value);
    if (cardDelta.value) payload.cardDelta = Number(cardDelta.value);
    return payload;
  });
  const confirmImpact = computed(() => {
    const pieces = [
      pendingPayload.value.setLevel != null ? `设为 Lv.${pendingPayload.value.setLevel}` : '',
      pendingPayload.value.expDelta ? `经验 ${pendingPayload.value.expDelta > 0 ? '+' : ''}${pendingPayload.value.expDelta}` : '',
      pendingPayload.value.cardDelta
        ? `补签卡 ${pendingPayload.value.cardDelta > 0 ? '+' : ''}${pendingPayload.value.cardDelta}`
        : '',
    ].filter(Boolean);
    return `目标：${props.userName || props.userId}（${props.userId}）。将执行：${pieces.join(' · ')}。升级通知仍遵循用户通知偏好。`;
  });

  async function loadCur() {
    cur.value = null;
    try {
      const res = await growthApi.adminGetUserGrowth(props.userId);
      if (res?.status === 200) cur.value = res.data;
    } catch {
      /* 忽略 */
    }
  }

  function submit() {
    if (saving.value) return;
    const payload = pendingPayload.value;
    if (payload.setLevel === undefined && !payload.expDelta && !payload.cardDelta) {
      message.info('请填写要调整的项');
      return;
    }
    confirmVisible.value = true;
  }

  async function confirmSubmit(action: { reason: string; confirmed: true; confirmText: string }) {
    const payload = { ...pendingPayload.value, ...action };
    saving.value = true;
    try {
      const res = await growthApi.adminAdjustGrowth(payload);
      if (res?.status === 200 && res.data?.ok) {
        confirmVisible.value = false;
        message.success(
          `已调整：Lv.${res.data.level} ${res.data.name} · 经验 ${res.data.exp} · 补签卡 ${
            res.data.cards
          } · 审计 ${String(res.data.auditId || '').slice(0, 8)}`,
        );
        cur.value = { level: res.data.level, name: res.data.name, exp: res.data.exp, protectCards: res.data.cards };
        expDelta.value = '';
        setLevel.value = '';
        cardDelta.value = '';
      } else {
        message.warning(res?.msg || '调整失败');
      }
    } catch (err) {
      console.error('成长运营调整失败:', err);
    } finally {
      saving.value = false;
    }
  }

  watch(
    () => props.visible,
    (v) => {
      if (v && props.userId) {
        expDelta.value = '';
        setLevel.value = '';
        cardDelta.value = '';
        loadCur();
      }
    },
    { immediate: true },
  );
</script>

<style scoped lang="less">
  .ga {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 4px 2px;
  }
  .ga-cur {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--primary-color) 8%, var(--background-color));
    border: 1px solid color-mix(in srgb, var(--card-border-color) 45%, transparent);
    font-size: 13px;
    color: var(--text-color);
  }
  .ga-cur-label {
    font-size: 11px;
    font-weight: 700;
    color: var(--primary-color);
  }
  .ga-cur-loading {
    color: var(--desc-color);
  }
  .ga-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .ga-field label {
    font-size: 12.5px;
    color: var(--desc-color);
  }
  .ga-field label em {
    font-style: normal;
    opacity: 0.7;
    margin-left: 4px;
  }
  .ga-control {
    width: 100%;
  }

  html.light-note-mobile-rendering .ga-cur {
    background: var(--card-background);
    border-color: var(--card-border-color);
    box-shadow: none;
  }
  .ga-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 4px;
  }
</style>
