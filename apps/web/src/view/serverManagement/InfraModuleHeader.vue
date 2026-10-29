<template>
  <header class="infra-module-header" :class="{ 'has-primary-action': primary }">
    <div class="infra-module-header__main">
      <BButton
        v-if="bookmark.isMobile"
        class="infra-back"
        :aria-label="t('serverManagement.back')"
        @click="router.push('/personCenter')"
        ><SvgIcon :src="icon.arrow_left" size="19"
      /></BButton>
      <div
        ><div class="infra-module-header__title"
          ><h1 :title="title">{{ bookmark.isMobile ? mobileTitle || title : title }}</h1
          ><span class="infra-header-status"><slot name="status" /></span></div
        ><div class="infra-header-detail"><slot name="detail" /></div
      ></div>
    </div>
    <div class="infra-module-header__actions">
      <span v-if="cadence" class="infra-module-header__cadence">{{ cadence }}</span
      ><slot name="controls" />
      <BButton
        :type="primary ? 'primary' : undefined"
        :loading="loading"
        :aria-label="refreshLabel"
        @click="$emit('refresh')"
      >
        <SvgIcon v-if="!loading" :src="icon.infrastructure.refresh" size="16" aria-hidden="true" /><span
          class="infra-refresh-label"
          >{{ refreshLabel }}</span
        >
      </BButton>
    </div>
  </header>
</template>
<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import { bookmarkStore } from '@/store';
  import icon from '@/config/icon';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  defineProps<{
    title: string;
    mobileTitle?: string;
    cadence?: string;
    loading?: boolean;
    refreshLabel: string;
    primary?: boolean;
  }>();
  defineEmits<{ refresh: [] }>();
  const bookmark = bookmarkStore();
  const router = useRouter();
  const { t } = useI18n();
</script>
<style scoped lang="less">
  .infra-module-header,
  .infra-module-header__main,
  .infra-module-header__actions,
  .infra-module-header__title {
    display: flex;
    align-items: center;
    gap: var(--ui-space-12, 12px);
    min-width: 0;
  }
  .infra-module-header {
    justify-content: space-between;
    flex-wrap: wrap;
  }
  h1 {
    margin: 0;
    font-size: var(--ui-font-26, 26px);
    line-height: 1.35;
  }
  .infra-module-header__cadence {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .infra-back {
    background: transparent;
    border-color: transparent;
  }
  @media (max-width: 767px) {
    h1 {
      font-size: var(--ui-font-20, 20px);
    }
    .infra-module-header {
      flex-wrap: nowrap;
    }
    .infra-module-header__cadence,
    .infra-refresh-label,
    .infra-header-status,
    .infra-header-detail {
      display: none;
    }
    .infra-module-header__main {
      flex: 1;
    }
    .infra-module-header__main > div {
      flex: 1;
      min-width: 0;
    }
    .infra-module-header__title {
      justify-content: center;
    }
    h1 {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .infra-back {
      padding: 0;
      min-width: var(--ui-control-32, 32px);
    }
    .infra-module-header__actions {
      gap: var(--ui-space-6, 6px);
    }
    .has-primary-action .infra-refresh-label {
      display: inline;
    }
  }
</style>
