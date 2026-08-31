<template>
  <div class="tag-space-entry-route">
    <div class="tag-space-entry">
      <BLoading v-if="loading" :loading="true" class="tag-space-entry__loading" />

      <BCard v-else-if="loadError" variant="card" padding="28px" class="tag-space-entry__state" role="alert">
        <span class="tag-space-entry__symbol">!</span>
        <strong>{{ t('tagSpace.loadFailedTitle') }}</strong>
        <p>{{ t('tagSpace.loadFailedDesc') }}</p>
        <BButton type="primary" @click="enterTagSpace">{{ t('common.retry') }}</BButton>
      </BCard>

      <BCard v-else variant="card" padding="28px" class="tag-space-entry__state">
        <span class="tag-space-entry__symbol"><SvgIcon :src="icon.resource.tag" size="22" /></span>
        <strong>{{ t('tagSpace.emptyTitle') }}</strong>
        <p>{{ t('tagSpace.emptyDesc') }}</p>
        <BButton v-if="!isReadOnly" type="primary" @click="createTag">{{ t('tagSpace.createTag') }}</BButton>
      </BCard>
    </div>

    <TagEditorDialog
      v-if="tagEditorVisible"
      v-model:visible="tagEditorVisible"
      tag-id="add"
      @saved="handleTagCreated"
    />
  </div>
</template>

<script lang="ts" setup>
  import { computed, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import { bookmarkStore, useUserStore } from '@/store';
  import icon from '@/config/icon';
  import { resolveTagSpaceEntryId } from '@/utils/tagSpaceNavigation';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import TagEditorDialog from '@/components/manage/tagEditMg/TagEditorDialog.vue';

  const { t } = useI18n();
  const route = useRoute();
  const router = useRouter();
  const bookmark = bookmarkStore();
  const user = useUserStore();
  const loading = ref(true);
  const loadError = ref(false);
  const tagEditorVisible = ref(false);
  const creationHandled = ref(false);
  const isReadOnly = computed(() => user.adminContext?.mode === 'readonly');

  async function enterTagSpace() {
    loading.value = true;
    loadError.value = false;
    try {
      const entryId = await resolveTagSpaceEntryId();
      if (entryId) {
        await router.replace(`/tag/${entryId}`);
        return;
      }
    } catch {
      loadError.value = true;
    } finally {
      loading.value = false;
    }
  }

  function createTag() {
    if (isReadOnly.value || blockGuestWrite('create-tag')) return;
    tagEditorVisible.value = true;
  }

  async function handleTagCreated(id: string) {
    creationHandled.value = true;
    bookmark.refreshTag();
    await router.replace(`/tag/${id}`);
  }

  watch(tagEditorVisible, (visible, previous) => {
    if (visible || !previous || creationHandled.value || String(route.query.create || '') !== '1') return;
    const query = { ...route.query };
    delete query.create;
    void router.replace({ name: 'tagMg', query }).then(enterTagSpace);
  });

  onMounted(() => {
    if (String(route.query.create || '') === '1' && !isReadOnly.value) {
      loading.value = false;
      tagEditorVisible.value = true;
      return;
    }
    void enterTagSpace();
  });
</script>

<style scoped lang="less">
  .tag-space-entry-route {
    width: 100%;
    height: 100%;
    padding: 18px clamp(16px, 1.6vw, 40px) 24px;
    box-sizing: border-box;
    background: var(--surface-page-bg, var(--background-color));
  }

  .tag-space-entry {
    height: 100%;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .tag-space-entry__loading {
    width: 100%;
    min-height: 260px;
  }

  .tag-space-entry__state {
    width: min(480px, 100%);
    min-height: 270px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    text-align: center;
  }

  .tag-space-entry__state p {
    max-width: 360px;
    margin: 0;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.6;
  }

  .tag-space-entry__symbol {
    width: 42px;
    height: 42px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--resource-tag-color, #ec4899);
    border-radius: 12px;
    color: var(--resource-tag-color, #ec4899);
    background: var(--workspace-panel-bg-color);
    font-size: 20px;
    font-weight: 750;
  }
</style>
