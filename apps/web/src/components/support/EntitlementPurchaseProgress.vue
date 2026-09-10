<template>
  <BButton v-if="intentId && !visible" size="small" @click="visible = true">{{ t('autumn.viewOrder') }}</BButton>
  <BModal v-model:visible="visible" :title="t('autumn.checkoutTitle')" width="480px" :show-footer="false">
    <div class="purchase-progress">
      <BLoading v-if="creating" inline loading :title="t('autumn.creating')" />
      <template v-else>
        <p>{{ t('autumn.account', { name: user.alias || user.userName }) }}</p>
        <strong v-if="status" role="status">{{ t(`autumn.${status.status}`) }}</strong>
        <p v-if="status"
          >¥{{ status.amount }} · {{ t(status.status === 'credited' ? 'autumn.actual' : 'autumn.quote') }}:
          {{ formatAiQuotaTokens(status.benefit.aiTokens, locale) }} Token · {{ status.benefit.storageMb }} MB</p
        >
        <p v-if="error" role="alert">{{ t(intentId ? 'autumn.queryError' : 'autumn.createFailed') }}</p>
        <p>{{ t('autumn.paymentHint') }}</p>
        <div class="purchase-progress__actions">
          <BButton
            v-if="paymentUrl && (!status || status.status === 'pending')"
            type="primary"
            @click="openAfdianSupportPage(paymentUrl)"
            >{{ t('autumn.pay') }}</BButton
          >
          <BButton v-if="intentId" :loading="querying" @click="refresh">{{ t('common.refresh') }}</BButton>
        </div>
      </template>
    </div>
  </BModal>
</template>
<script setup lang="ts">
  import { ref, watch, onBeforeUnmount } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useUserStore } from '@/store';
  import { createCheckoutIntent, queryCheckoutIntent, type CheckoutStatus } from '@/api/supportApi';
  import { openAfdianSupportPage } from '@/config/support';
  import { formatAiQuotaTokens } from '@/composables/useAiQuotaStatus';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  const emit = defineEmits<{ credited: [] }>();
  const { t, locale } = useI18n();
  const user = useUserStore();
  const visible = ref(false),
    creating = ref(false),
    querying = ref(false),
    error = ref(false);
  const savedKey = 'lightnote:checkout-status:v1';
  function readSaved() {
    try {
      const value = JSON.parse(sessionStorage.getItem(savedKey) || 'null');
      return value?.owner === user.id && value?.expires > Date.now() && typeof value?.id === 'string' ? value.id : '';
    } catch {
      return '';
    }
  }
  const intentId = ref(readSaved()),
    paymentUrl = ref(''),
    status = ref<CheckoutStatus | null>(null);
  let generation = 0,
    notified = '',
    attempts = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function stop() {
    clearTimeout(timer);
    timer = undefined;
  }
  async function refresh() {
    if (!intentId.value || querying.value || document.hidden || !visible.value) return;
    const id = intentId.value,
      owner = user.id,
      gen = generation;
    querying.value = true;
    error.value = false;
    stop();
    try {
      const result = await queryCheckoutIntent(id);
      if (owner !== user.id || gen !== generation) return;
      status.value = result;
      if (result.status === 'credited' && notified !== id) {
        notified = id;
        emit('credited');
      }
    } catch {
      if (gen === generation) error.value = true;
    } finally {
      if (gen === generation) {
        querying.value = false;
        if (
          visible.value &&
          !document.hidden &&
          ++attempts < 12 &&
          (!status.value || ['pending', 'processing'].includes(status.value.status))
        )
          timer = setTimeout(refresh, 5000);
      }
    }
  }
  async function start(skuId: string, version: string, flowId?: string) {
    if (creating.value) return;
    stop();
    const gen = ++generation,
      owner = user.id;
    intentId.value = '';
    paymentUrl.value = '';
    status.value = null;
    error.value = false;
    querying.value = false;
    attempts = 0;
    visible.value = true;
    creating.value = true;
    try {
      const result = await createCheckoutIntent(skuId, version, flowId);
      if (gen !== generation || owner !== user.id) return;
      intentId.value = result.intentId;
      paymentUrl.value = result.url;
      try {
        sessionStorage.setItem(
          savedKey,
          JSON.stringify({ owner, id: result.intentId, expires: Date.now() + 86400000 }),
        );
      } catch {
        /* current-page query remains available */
      }
      void refresh();
    } catch {
      if (gen === generation) error.value = true;
    } finally {
      if (gen === generation) creating.value = false;
    }
  }
  function foreground() {
    if (document.hidden) stop();
    else {
      attempts = 0;
      void refresh();
    }
  }
  document.addEventListener('visibilitychange', foreground);
  window.addEventListener('focus', foreground);
  watch(visible, (value) => {
    if (value) {
      attempts = 0;
      void refresh();
    } else stop();
  });
  watch(
    () => user.id,
    () => {
      try {
        sessionStorage.removeItem(savedKey);
      } catch {
        /* optional storage */
      }
      ++generation;
      stop();
      visible.value = false;
      intentId.value = '';
      paymentUrl.value = '';
      status.value = null;
      creating.value = false;
      querying.value = false;
    },
  );
  onBeforeUnmount(() => {
    ++generation;
    stop();
    document.removeEventListener('visibilitychange', foreground);
    window.removeEventListener('focus', foreground);
  });
  defineExpose({ start });
</script>
<style scoped>
  .purchase-progress {
    display: grid;
    gap: 14px;
    font-size: 14px;
    line-height: 1.7;
    overflow-wrap: anywhere;
  }
  .purchase-progress p {
    margin: 0;
    color: var(--desc-color);
  }
  .purchase-progress__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }
</style>
