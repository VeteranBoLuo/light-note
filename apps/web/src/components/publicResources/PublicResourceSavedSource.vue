<template>
  <aside v-if="source" class="saved-public-source" :aria-label="t('publicResources.workspace.savedSource')">
    <span>{{ t('publicResources.workspace.savedAuthor') }}：{{ source.authorName }}</span>
    <BButton type="text" :title="source.url" @click="openSource">{{
      t('publicResources.workspace.openOriginal')
    }}</BButton>
  </aside>
</template>
<script setup lang="ts">
  import { onBeforeUnmount, ref, watch } from 'vue';
  import { useRouter } from 'vue-router';
  import { useI18n } from 'vue-i18n';
  import { publicGet } from '@/api/publicResources';
  import { usePublicResourceScope } from '@/store/publicResourceScope';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  interface SavedSource {
    authorName: string;
    authorPublicId: string;
    url: string;
    revision: number;
  }
  const props = defineProps<{ resourceId: string; kind?: 'bookmark' | 'note' }>();
  const { t } = useI18n(),
    router = useRouter(),
    scope = usePublicResourceScope();
  const source = ref<SavedSource | null>(null);
  let generation = 0;
  function sourcePath(url: string) {
    try {
      const path = new URL(url).pathname;
      return /^\/public-resources\/[0-9a-f-]{36}$/i.test(path) ? path : '';
    } catch {
      return '';
    }
  }
  function openSource() {
    const path = source.value && sourcePath(source.value.url);
    if (path) void router.push(path);
  }
  watch(
    () => [props.resourceId, props.kind, scope.identity, scope.eligible],
    async () => {
      const current = ++generation;
      source.value = null;
      if (!props.resourceId || !scope.eligible) return;
      try {
        const data = await publicGet<{ source: SavedSource | null }>('saved-source', {
          kind: props.kind || 'bookmark',
          resourceId: props.resourceId,
        });
        if (current === generation && scope.eligible && data.source && sourcePath(data.source.url))
          source.value = data.source;
      } catch {
        /* Optional provenance cannot block personal resource editing or a saved copy's content. */
      }
    },
    { immediate: true, flush: 'sync' },
  );
  onBeforeUnmount(() => {
    generation++;
    source.value = null;
  });
</script>
<style scoped lang="less">
  @import (reference) '@/assets/css/ui-density.less';
  .saved-public-source {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: .ui-space(8px) [] .ui-space(16px) [];
    max-width: .ui-layout(800px) [];
    margin: .ui-space(12px) [] auto;
    padding: .ui-space(12px) [] .ui-space(16px) [];
    box-sizing: border-box;
    border-top: 1px solid var(--workspace-divider);
    color: var(--desc-color);
    font-size: .ui-font(13px) [];
    line-height: 1.7;
    overflow-wrap: anywhere;
  }
  @media (max-width: 767px) {
    .saved-public-source > .b_btn {
      min-height: .ui-control(44px) [];
      height: auto;
      white-space: normal;
      line-height: 1.5;
    }
  }
</style>
