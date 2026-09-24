<template>
  <AccountPasswordDialog v-model:visible="visible" />
</template>

<script setup lang="ts">
  import AccountPasswordDialog from '@/components/settings/AccountPasswordDialog.vue';
  const visible = defineModel<boolean>('visible', { default: false });
</script>
