<template>
  <div class="push-help">
    <BButton size="small" :aria-expanded="expanded" @click="expanded = !expanded">{{
      t('browserPush.helpTitle')
    }}</BButton>
    <div v-if="expanded" class="push-help__content" role="note">
      <p>{{ t('browserPush.helpLimit') }}</p>
      <p>{{ t('browserPush.helpAndroid') }}</p>
      <p>{{ t('browserPush.helpIos') }}</p>
      <p>{{ t('browserPush.helpMac') }}</p>
      <p>{{ t('browserPush.helpWindows') }}</p>
      <p>{{ t('browserPush.helpFocus') }}</p>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  const { t } = useI18n();
  const expanded = ref(false);
</script>
<style scoped lang="less">
  .push-help {
    color: var(--desc-color);
    font-size: 12px;
  }
  .push-help__content {
    margin-top: 8px;
    padding: 10px 12px;
    border: 1px solid var(--border-color);
    border-radius: 8px;
  }
  .push-help__content p {
    margin: 0;
    line-height: 1.6;
  }
  .push-help__content p + p {
    margin-top: 6px;
  }
</style>
