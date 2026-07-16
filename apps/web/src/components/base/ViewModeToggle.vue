<template>
  <div class="view-mode-toggle" :aria-label="$t('note.viewMode')">
    <BButton
      class="view-mode-button"
      :class="{ active: user.preferences.noteViewMode === 'card' }"
      @click="setMode('card')"
    >
      <SvgIcon :src="icon.navigation.portal" size="15" />
      {{ $t('note.cardView') }}
    </BButton>
    <BButton
      class="view-mode-button"
      :class="{ active: user.preferences.noteViewMode === 'list' }"
      @click="setMode('list')"
    >
      <SvgIcon :src="icon.filterPanel.list" size="15" />
      {{ $t('note.listView') }}
    </BButton>
  </div>
</template>

<script setup lang="ts">
  import { useUserStore } from '@/store';
  import { recordOperation } from '@/api/commonApi.ts';
  import { updatePreference, isGuestUser } from '@/utils/savePreference';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  const user = useUserStore();
  const setMode = async (mode: any) => {
    // 统一走 updatePreference(本地生效 + 游客只本地 + 登录同步后端并失败回滚)
    try {
      await updatePreference({ noteViewMode: mode });
      if (!isGuestUser()) recordOperation({ module: '笔记库', operation: `保存视图模式成功【${mode}】` });
    } catch (err) {
      console.error('后台错误：' + err);
    }
  };
</script>

<style lang="less" scoped>
  .view-mode-toggle {
    display: flex;
    gap: 3px;
    padding: 3px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--card-border-color) 42%, transparent);
  }

  .view-mode-button {
    height: 30px;
    padding: 0 9px;
    gap: 5px;
    border-radius: 8px;
    color: var(--desc-color);
    background: transparent;
    font-size: 12px;
  }

  .view-mode-button.active {
    color: var(--resource-note-color, #00a884);
    background: var(--menu-body-bg-color);
    box-shadow: 0 2px 7px color-mix(in srgb, var(--text-color) 12%, transparent);
  }
</style>
