<template>
  <header class="header-overlay-fixture">
    <BTooltip title="切换编辑器模式"><BButton class="header-overlay-mode">HTML</BButton></BTooltip>
    <!-- Match NoteHeader: placement=header with compact left at its default. -->
    <ResourceBacklinks target-type="note" target-id="density-header-note" placement="header" />
    <BButton>右侧操作</BButton>
  </header>
  <main class="header-overlay-content">编辑区域</main>
</template>
<script setup lang="ts">
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import ResourceBacklinks from '@/components/noteLibrary/detail/ResourceBacklinks.vue';
</script>
<style scoped>
  .header-overlay-fixture {
    position: fixed;
    inset: 0 0 auto;
    height: 60px;
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: var(--ui-space-20, 20px);
    padding: 0 var(--ui-space-20, 20px);
    border-bottom: 1px solid var(--surface-border-color);
  }
  .header-overlay-content {
    margin-top: 90px;
  }
</style>
