<template>
  <div v-if="scope.eligible && scope.caps.enabled" class="public-search-scope"
    ><BSwitch
      :checked="scope.included"
      controlled
      :aria-label="t('publicResources.include')"
      @update:checked="change"
    /><span>{{ t('publicResources.include') }}</span
    ><small v-if="hint">{{ t('publicResources.scopeHint') }}</small>
    <BButton
      v-if="publicationEntry && scope.caps.submissionsEnabled"
      type="text"
      class="public-search-scope__publish"
      @click="emit('publish')"
      >{{ t('publicResources.publishMine') }}</BButton
    ></div
  >
</template>
<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import BSwitch from '@/components/base/BasicComponents/BSwitch.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import { usePublicResourceScope } from '@/store/publicResourceScope';
  withDefaults(defineProps<{ hint?: boolean; publicationEntry?: boolean }>(), { hint: true, publicationEntry: false });
  const emit = defineEmits<{ change: [value: boolean]; publish: [] }>(),
    scope = usePublicResourceScope(),
    { t } = useI18n();
  function change(value: boolean) {
    scope.setIncluded(value, { remember: true });
    emit('change', value);
  }
</script>
<style scoped lang="less">
  @import (reference) '@/assets/css/ui-density.less';
  .public-search-scope {
    display: flex;
    align-items: center;
    gap: .ui-space(8px) [];
    flex-wrap: wrap;
    color: var(--text-color);
    font-size: .ui-font(13px) [];
  }
  .public-search-scope > :first-child {
    flex-shrink: 0;
  }
  .public-search-scope > span {
    white-space: nowrap;
  }
  small {
    font-size: .ui-font(12px) [];
    color: var(--desc-color);
  }
  .public-search-scope__publish.b_btn {
    margin-left: auto;
    flex-shrink: 0;
    font-size: .ui-font(12px) [];
  }
  @media (max-width: 767px) {
    .public-search-scope > :first-child {
      min-width: .ui-layout(44px) [];
      min-height: .ui-control(44px) [];
      justify-content: center;
    }
  }
</style>
