<template>
  <!-- 数据安心的三条承诺；第三条与用户协议第 9 条一致，修改时两处同步。 -->
  <div class="data-promise" :class="{ 'is-stacked': stacked }">
    <ul>
      <li v-for="item in items" :key="item.key" :class="`is-${item.tone}`">
        <span class="promise-icon"><SvgIcon :src="item.icon" size="17" /></span>
        <span class="promise-text">
          <b>{{ t(`dataExport.promise.${item.key}Title`) }}</b>
          <span>{{ t(`dataExport.promise.${item.key}Body`) }}</span>
        </span>
      </li>
    </ul>
    <i18n-t keypath="dataExport.promise.legal" tag="p" class="promise-legal">
      <template #agreement>
        <BButton type="text" size="small" class="promise-link" @click="emit('open-legal', 'user-agreement.html')">{{
          t('dataExport.promise.agreement')
        }}</BButton>
      </template>
      <template #privacy>
        <BButton type="text" size="small" class="promise-link" @click="emit('open-legal', 'privacy-policy.html')">{{
          t('dataExport.promise.privacy')
        }}</BButton>
      </template>
    </i18n-t>
  </div>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import icon from '@/config/icon';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';

  defineProps<{ stacked?: boolean }>();
  const emit = defineEmits<{ 'open-legal': [document: 'user-agreement.html' | 'privacy-policy.html'] }>();
  const { t } = useI18n();
  const items = [
    { key: 'own', tone: 'purple', icon: icon.settings.account },
    { key: 'portable', tone: 'green', icon: icon.toolbox.download },
    { key: 'notice', tone: 'orange', icon: icon.settings.privacy },
  ];
</script>

<style scoped lang="less">
  .data-promise {
    color: var(--text-color);
  }
  .data-promise ul {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(var(--ui-layout-220, 220px), 1fr));
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .data-promise li {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-10, 10px);
    padding: var(--ui-space-4, 4px) var(--ui-space-22, 22px);
    border-left: 1px solid var(--workspace-divider, var(--border-color));
  }
  .data-promise li:first-child {
    padding-left: 0;
    border-left: 0;
  }
  .promise-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--ui-layout-32, 32px);
    height: var(--ui-layout-32, 32px);
    border: 1px solid currentColor;
    border-radius: 9px;
  }
  .is-purple .promise-icon {
    color: var(--workspace-purple-text, var(--primary-color));
  }
  .is-green .promise-icon {
    color: var(--success-color);
  }
  .is-orange .promise-icon {
    color: var(--warning-color);
  }
  .promise-text {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-4, 4px);
  }
  .promise-text b {
    font-size: var(--ui-font-15, 15px);
  }
  .promise-text span {
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
    line-height: 1.7;
  }
  .promise-legal {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0 var(--ui-space-4, 4px);
    margin: var(--ui-space-18, 18px) 0 0;
    padding-top: var(--ui-space-14, 14px);
    border-top: 1px solid var(--workspace-divider, var(--border-color));
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .promise-link {
    padding: 0;
    color: var(--workspace-purple-text, var(--primary-color));
  }
  .is-stacked li {
    display: grid;
    grid-template-columns: var(--ui-layout-32, 32px) minmax(0, 1fr);
    gap: var(--ui-space-12, 12px);
    padding: var(--ui-space-12, 12px) 0;
    border-left: 0;
    border-top: 1px solid var(--workspace-divider, var(--border-color));
  }
  .is-stacked li:first-child {
    padding-top: 0;
    border-top: 0;
  }
  .is-stacked ul {
    grid-template-columns: minmax(0, 1fr);
  }
</style>
