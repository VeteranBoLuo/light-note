<template>
  <div class="view-mode-toggle">
    <div
      class="toggle-slider"
      :style="{ transform: user.preferences.noteViewMode === 'card' ? 'translateX(0)' : 'translateX(100%)' }"
    ></div>
    <button @click="setMode('card')" :class="{ active: user.preferences.noteViewMode === 'card' }">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 3h18v18H3V3zm16 16V5H5v14h14zM9 7h6v2H9V7zm0 4h6v2H9v11z" />
      </svg>
      {{ $t('note.cardView') }}
    </button>
    <button @click="setMode('list')" :class="{ active: user.preferences.noteViewMode === 'list' }">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 4h18v2H3V4zm0 7h18v2H3v-2zm0 7h18v2H3v-2z" />
      </svg>
      {{ $t('note.listView') }}
    </button>
  </div>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import { useUserStore } from '@/store';
  const { t } = useI18n();
  import userApi from '@/api/userApi.ts';
  const user = useUserStore();
  const setMode = (mode: any) => {
    user.preferences.noteViewMode = mode;
    localStorage.setItem(
      'preferences',
      JSON.stringify({
        ...user.preferences,
        noteViewMode: mode,
      }),
    );
    userApi
      .updateUserInfo({
        id: localStorage.getItem('userId'),
        preferences: JSON.stringify({
          ...user.preferences,
          noteViewMode: mode,
        }),
      })
      .catch((err) => {
        console.error('后台错误：' + err);
      });
  };
</script>

<style lang="less" scoped>
  .view-mode-toggle {
    position: relative;
    display: flex;
    border-radius: 20px;
    overflow: hidden;
    border: 1px solid var(--card-border-color);
    background: var(--background-color);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    transition: box-shadow 0.3s ease;

    &:hover {
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
    }

    .toggle-slider {
      position: absolute;
      top: 0;
      left: 0;
      width: 50%;
      height: 100%;
      background: linear-gradient(135deg, var(--primary-color), var(--primary-color-light, #7c3aed));
      border-radius: 19px;
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }

    button {
      flex: 1;
      padding: 6px 12px;
      background: none;
      border: none;
      cursor: pointer;
      position: relative;
      z-index: 1;
      color: var(--text-color);
      font-size: 14px;
      font-weight: 500;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: color 0.3s ease;

      svg {
        transition: fill 0.3s ease;
      }

      &.active {
        color: white;

        svg {
          fill: white;
        }
      }

      &:hover:not(.active) {
        color: var(--primary-color);
      }
    }
  }
</style>
