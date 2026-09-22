<template><div class="community-markdown" v-html="html" /></template>
<script setup lang="ts">
  import '@/assets/css/community-content.css';
  import { computed } from 'vue';
  import { renderCommunityMarkdown } from '@/utils/communityMarkdown';
  const props = defineProps<{ body: string }>();
  const html = computed(() => renderCommunityMarkdown(props.body));
</script>
