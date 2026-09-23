<template>
  <BModal
    :visible="true"
    :title="t('community.feed.addResources')"
    width="min(var(--ui-layout-760, 760px), 94vw)"
    :show-footer="false"
    :close-disabled="busy"
    :mask-closable="false"
    @close="cancel"
  >
    <section class="snapshot-picker">
      <p>{{ t('community.feed.resourceLimits') }}</p>
      <template v-if="!prepared">
        <ResourcePickerPanel
          :allowed-types="['bookmark', 'note']"
          :filter-items="filterShareable"
          show-search
          :disabled="busy"
          @select="prepare"
        />
        <div v-if="busy" role="status"><BLoading :loading="true" :title="t('community.feed.preparingResource')" /></div>
        <p v-if="error" role="alert" class="snapshot-error">{{ t('community.feed.' + error) }}</p>
        <BButton v-if="pending" :disabled="busy" @click="retry">{{ t('community.feed.retry') }}</BButton>
      </template>
      <template v-else>
        <div class="snapshot-preview">
          <span class="snapshot-label">{{ t('community.feed.publicPreview') }}</span>
          <h3>{{ prepared.title }}</h3>
          <div class="snapshot-text">{{ prepared.kind === 'bookmark' ? prepared.url : prepared.body }}</div>
        </div>
        <p>{{ t('community.feed.snapshotConfirm') }}</p>
        <div class="snapshot-actions"
          ><BButton @click="chooseAgain">{{ t('community.feed.chooseAgain') }}</BButton
          ><BButton type="primary" @click="add">{{ t('community.feed.addSnapshot') }}</BButton></div
        >
      </template>
    </section>
  </BModal>
</template>
<script setup lang="ts">
  import { onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useUserStore } from '@/store';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import ResourcePickerPanel from '@/components/resourcePicker/ResourcePickerPanel.vue';
  import {
    feedGet,
    feedOperation,
    discardFeedResource,
    type FeedResource,
    type FeedResourceContent,
  } from '@/api/communityFeedApi';
  import { type ResourcePickerItem, resourceItemKey } from '@/composables/useResourcePickerSearch';
  async function filterShareable(items: ResourcePickerItem[]) {
    if (!items.length) return items;
    const result = await feedGet<{ keys: string[] }>('resources/eligible', {
      items: JSON.stringify(items.map(({ type, id }) => ({ type, id }))),
    });
    const keys = new Set(result.keys);
    return items.filter((item) => keys.has(resourceItemKey(item)));
  }
  const emit = defineEmits<{ close: []; add: [resource: FeedResource] }>();
  const { t } = useI18n(),
    user = useUserStore();
  const busy = ref(false),
    error = ref(''),
    prepared = ref<FeedResourceContent | null>(null);
  const pending = ref<{ type: string; id: string } | null>(null);
  let operation: (() => Promise<FeedResource>) | null = null,
    generation = 0,
    stagedId = '';
  async function prepare(item: { type: string; id: string }) {
    if (busy.value) return;
    discard();
    pending.value = item;
    operation = feedOperation('resources/prepare', { type: item.type, id: item.id });
    await retry();
  }
  async function retry() {
    if (!operation || busy.value) return;
    const current = ++generation;
    busy.value = true;
    error.value = '';
    try {
      const result = await operation();
      if (current !== generation) return;
      stagedId = result.publicId;
      const content = await feedGet<FeedResourceContent>('resources/' + result.publicId);
      if (current === generation) prepared.value = content;
    } catch (e: any) {
      if (current === generation)
        error.value =
          (
            {
              COMMUNITY_RESOURCE_TEXT_ONLY: 'resourceTextOnly',
              COMMUNITY_RESOURCE_TOO_LARGE: 'resourceTooLarge',
              COMMUNITY_RESOURCE_LIMIT: 'resourceLimitReached',
              COMMUNITY_RESOURCE_INVALID_URL: 'resourceInvalidUrl',
              COMMUNITY_RESOURCE_EMPTY: 'resourceEmpty',
            } as Record<string, string>
          )[e.code || e.response?.data?.data?.code] || 'resourceUnavailable';
    } finally {
      if (current === generation) busy.value = false;
    }
  }
  function discard() {
    if (stagedId) void discardFeedResource(stagedId).catch(() => {});
    stagedId = '';
  }
  function chooseAgain() {
    discard();
    prepared.value = null;
    pending.value = null;
    operation = null;
    error.value = '';
  }
  function add() {
    if (!prepared.value) return;
    const { body, url, ...metadata } = prepared.value;
    stagedId = ''; // Ownership of this staged snapshot passes to the editor draft.
    emit('add', metadata);
    emit('close');
  }
  function cancel() {
    if (!busy.value) emit('close');
  }
  watch(
    () => [user.id, user.role, user.adminContext?.id],
    () => {
      generation++;
      stagedId = '';
      emit('close');
    },
  );
  onBeforeUnmount(() => {
    generation++;
    discard();
  });
</script>
<style scoped>
  .snapshot-picker {
    display: grid;
    gap: var(--ui-space-16, 16px);
  }
  .snapshot-picker > p {
    margin: 0;
    font-size: var(--ui-font-13, 13px);
    color: var(--desc-color);
    line-height: 1.8;
  }
  .snapshot-preview {
    padding: var(--ui-space-20, 20px);
    border: 1px solid var(--workspace-border);
    border-radius: 12px;
    background: var(--workspace-hover);
  }
  .snapshot-label {
    font-size: var(--ui-font-12, 12px);
    color: var(--primary-color);
  }
  .snapshot-preview h3 {
    margin: var(--ui-space-10, 10px) 0 var(--ui-space-16, 16px);
    overflow-wrap: anywhere;
  }
  .snapshot-text {
    max-height: 42vh;
    overflow: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    line-height: 1.9;
    font-size: 14px;
  }
  .snapshot-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--ui-space-8, 8px);
  }
  .snapshot-picker .snapshot-error {
    color: var(--danger-color);
  }
</style>
