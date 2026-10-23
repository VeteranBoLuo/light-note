<template>
  <ResourcePageShell
    class="public-resource-detail"
    :title="t('publicResources.public')"
    accent="neutral"
    :show-header="false"
    ><div ref="scrollRef" v-auto-scrollbar class="public-detail-scroll" tabindex="0">
      <div class="public-detail-layout">
        <nav class="public-detail-breadcrumb" :aria-label="t('publicResources.public')">
          <BButton type="text" class="public-detail-back" @click="back">
            <SvgIcon :src="icon.noteDetail.back" size="16" />{{ t('common.back') }}
          </BButton>
          <span aria-hidden="true">/</span><span>{{ t('publicResources.public') }}</span>
        </nav>
        <PublicResourceReader :resource-id="String(route.params.id || '')" :scroll-container="scrollRef" @back="back" />
      </div> </div
  ></ResourcePageShell>
</template>
<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import ResourcePageShell from '@/components/base/ResourcePageShell.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import PublicResourceReader from '@/components/publicResources/PublicResourceReader.vue';
  import { trackSearchReturnNavigation } from '@/utils/searchReturnNavigation';
  import { returnFromPublicResource } from '@/utils/publicResourceNavigation';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';
  import { ref, watch } from 'vue';
  import { useDensityScrollAnchor } from '@/composables/useDensityScrollAnchor';
  const { t } = useI18n(),
    route = useRoute(),
    router = useRouter();
  trackSearchReturnNavigation(router);
  const scrollRef = ref<HTMLElement | null>(null);
  useDensityScrollAnchor(scrollRef);
  watch(
    () => route.params.id,
    () => {
      if (scrollRef.value) scrollRef.value.scrollTop = 0;
    },
  );
  function back() {
    returnFromPublicResource(router, route.query.from);
  }
  useMobileTopBar(['publicResourceDetail'], {
    ownTopBar: true,
    title: () => t('publicResources.public'),
    onBack: back,
  });
</script>
<style scoped lang="less">
  @import (reference) '@/assets/css/ui-density.less';
  @import (reference) '@/assets/css/workspace-surfaces.less';
  .public-resource-detail.resource-page-shell {
    .workspace-open-surface();
    padding: 0;
    gap: 0;
  }
  .public-resource-detail :deep(.resource-page-body) {
    width: 100%;
    display: flex;
    overflow: hidden;
  }
  .public-detail-scroll {
    width: 100%;
    height: 100%;
    overflow: auto;
    scrollbar-gutter: stable;
    overscroll-behavior-y: contain;
  }
  .public-detail-layout {
    width: calc(100% - .ui-space(80px) []);
    max-width: .ui-layout(1120px) [];
    min-height: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    margin: 0 auto;
    padding: .ui-space(14px) [] 0 .ui-space(40px) [];
  }
  .public-detail-breadcrumb {
    display: flex;
    align-items: center;
    gap: .ui-space(12px) [];
    flex-shrink: 0;
    min-height: .ui-control(36px) [];
    margin-bottom: .ui-space(15px) [];
    color: var(--desc-color);
    font-size: .ui-font(12px) [];
    line-height: 1.5;
  }
  .public-detail-back {
    gap: .ui-space(6px) [];
    padding-inline: 0;
    color: var(--text-color);
    font-size: inherit;
  }
  @media (max-width: 767px) {
    .public-detail-layout {
      width: calc(100% - .ui-space(44px) []);
      padding-top: 0;
      padding-bottom: 0;
    }
    .public-detail-breadcrumb {
      min-height: .ui-control(52px) [];
      margin-bottom: .ui-space(22px) [];
      position: sticky;
      top: 0;
      z-index: 1;
      background: var(--workspace-open-canvas);
    }
    .public-detail-back {
      min-height: .ui-control(44px) [];
      padding-inline: .ui-space(4px) [];
    }
  }
</style>
