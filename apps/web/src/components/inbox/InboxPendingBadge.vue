<template>
  <span class="inbox-pending-badge">{{ t('inbox.pendingBadge') }}</span>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';

  const { t } = useI18n();
</script>

<style scoped>
  .inbox-pending-badge {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    padding: 2px 7px;
    border-radius: 999px;
    /*
     * 用 warning 而不是 primary：标签胶囊本身就是紫色系（--tag-bg-color 一族），
     * 同为紫色的「待整理」混在标签堆里几乎分不出来，而它表达的是「这条还没归置」，
     * 是要被一眼看到的状态，不该和内容标签同色。
     *
     * 必须混向 transparent 而不是 var(--background-color)：两个操作数都不透明时，
     * androidColorMixFallback 认不出这是「弱底色」，会按权重回退成占比大的那个 ——
     * 也就是页面背景色本身，APK 里这个胶囊就彻底没了底色（实测如此）。
     * 混向 transparent 才会被替换成稳定的 warning-soft-background RGBA。
     */
    color: var(--warning-color);
    background: color-mix(in srgb, var(--warning-color) 14%, transparent);
    font-size: 11px;
    font-weight: 600;
    line-height: 1.5;
    white-space: nowrap;
  }
</style>
