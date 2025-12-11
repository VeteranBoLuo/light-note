<template>
  <a-dropdown :trigger="['click']" placement="bottomRight">
    <div type="text" size="small" class="icon-hover">
      {{ currentLang === 'zh-CN' ? '中文' : 'EN' }}
    </div>
    <template #overlay>
      <a-menu @click="handleLangChange">
        <a-menu-item key="zh-CN">中文</a-menu-item>
        <a-menu-item key="en-US">English</a-menu-item>
      </a-menu>
    </template>
  </a-dropdown>
</template>

<script lang="ts" setup>
  import { useI18n } from 'vue-i18n';
  import i18n from '@/i18n';

  const { locale } = useI18n();
  const currentLang = locale;

  const handleLangChange = ({ key }: { key: string }) => {
    const lang = key as 'zh-CN' | 'en-US';
    localStorage.setItem('lang', lang);
    if (i18n.global.locale.value !== lang) {
      location.reload();
    }
  };
</script>
<style>
  .icon-hover {
    padding: 6px;
    cursor: pointer;
    box-sizing: border-box;
    &:hover {
      background-color: var(--menu-item-h-bg-color);
      border-radius: 8px;
    }
  }
</style>
