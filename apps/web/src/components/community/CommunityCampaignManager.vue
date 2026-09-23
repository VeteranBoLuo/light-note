<template>
  <BModal
    :visible="true"
    :title="t('community.feed.rechargeManagement')"
    :show-footer="false"
    width="min(var(--ui-layout-640, 640px),94vw)"
    @close="$emit('close')"
  >
    <p class="campaign-visibility-hint">{{ t('community.feed.rechargeVisibilityHint') }}</p>
    <BLoading :loading="loading">
      <p v-if="error" role="alert"
        >{{ t('community.feed.loadError') }} <BButton @click="load">{{ t('community.feed.retry') }}</BButton></p
      >
      <div v-for="campaign in campaigns" :key="campaign.id" class="campaign-visibility-row">
        <div
          ><strong>{{ campaign.title }}</strong
          ><p
            ><BChip :tone="campaign.publicEnabled ? 'success' : 'pending'">{{
              t(campaign.publicEnabled ? 'community.feed.topicPublic' : 'community.feed.topicDisabled')
            }}</BChip></p
          ></div
        >
        <BButton
          :disabled="
            busy ||
            !canWrite ||
            (!campaign.publicEnabled &&
              (campaign.status !== 'published' || new Date(campaign.endsAt).getTime() <= Date.now()))
          "
          @click="toggle(campaign)"
          >{{ t(campaign.publicEnabled ? 'community.feed.hideCampaign' : 'community.feed.showCampaign') }}</BButton
        >
      </div>
      <p v-if="!loading && !error && !campaigns.length">{{ t('adminSupport.campaigns.empty') }}</p>
    </BLoading>
  </BModal>
</template>
<script setup lang="ts">
  import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useUserStore } from '@/store';
  import {
    getAdminSupportCampaigns,
    setAdminCampaignVisibility,
    type AdminSupportCampaign,
  } from '@/api/adminSupportApi';
  import { refreshCampaignEntry } from '@/composables/useCampaignEntry';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  defineEmits<{ close: [] }>();
  const { t } = useI18n();
  const user = useUserStore();
  const canWrite = computed(() => user.role === 'root' && !user.adminContext);
  const campaigns = ref<AdminSupportCampaign[]>([]);
  const loading = ref(false),
    busy = ref(false),
    error = ref(false);
  let generation = 0,
    alive = true;
  async function load() {
    const current = ++generation;
    loading.value = true;
    error.value = false;
    try {
      const data = await getAdminSupportCampaigns();
      if (current === generation) campaigns.value = data;
    } catch {
      if (current === generation) error.value = true;
    } finally {
      if (current === generation) loading.value = false;
    }
  }
  function toggle(campaign: AdminSupportCampaign) {
    if (!canWrite.value || busy.value) return;
    const enabled = !campaign.publicEnabled;
    Alert.alert({
      title: t(enabled ? 'community.feed.showCampaign' : 'community.feed.hideCampaign'),
      content: t('community.feed.rechargeVisibilityHint'),
      okText: t('common.confirm'),
      onOk: async () => {
        if (!alive || !canWrite.value || busy.value) return;
        busy.value = true;
        try {
          await setAdminCampaignVisibility(campaign.id, enabled);
          await refreshCampaignEntry(true);
          if (alive) await load();
        } catch {
          if (alive) message.error(t('community.feed.error'));
        } finally {
          if (alive) busy.value = false;
        }
      },
    });
  }
  onMounted(load);
  onBeforeUnmount(() => {
    alive = false;
    generation++;
  });
</script>
<style scoped>
  .campaign-visibility-hint {
    margin: 0 0 var(--ui-space-16, 16px);
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
    line-height: 1.7;
  }
  .campaign-visibility-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-16, 16px);
    padding: var(--ui-space-16, 16px) 0;
    border-bottom: 1px solid var(--workspace-divider);
  }
  .campaign-visibility-row > div {
    min-width: 0;
  }
  .campaign-visibility-row strong {
    font-size: var(--ui-font-14, 14px);
    overflow-wrap: anywhere;
  }
  .campaign-visibility-row p {
    font-size: var(--ui-font-12, 12px);
    color: var(--desc-color);
    margin: var(--ui-space-6, 6px) 0 0;
  }
  .campaign-visibility-row :deep(.b_btn) {
    flex-shrink: 0;
  }
</style>
