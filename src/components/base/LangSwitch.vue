<template>
  <a-dropdown :trigger="['click']" placement="bottomRight">
    <div type="text" size="small" class="icon-hover">
      {{ i18n.global.locale.value === 'zh-CN' ? '中文' : 'EN' }}
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
  import i18n, { setLocale } from '@/i18n';
  import { useUserStore } from '@/store';
  import userApi from '@/api/userApi.ts';
  const user = useUserStore();

  const handleLangChange = ({ key }: { key: string }) => {
    const lang = key as 'zh-CN' | 'en-US';
    document.documentElement.lang = lang;
    userApi
      .updateUserInfo({
        id: localStorage.getItem('userId'),
        preferences: JSON.stringify({
          ...user.preferences,
          lang: lang,
        }),
      })
      .then(() => {
        if (i18n.global.locale.value !== lang) {
          location.reload();
          localStorage.setItem(
            'preferences',
            JSON.stringify({
              ...JSON.parse(localStorage.getItem('preferences') || '{}'),
              lang: lang,
            }),
          );
        }
      })
      .catch((err) => {
        console.error('后台错误：' + err);
      });
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
