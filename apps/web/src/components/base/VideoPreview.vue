<template>
  <div class="video-preview">
    <video ref="videoPlayer" controls :src="videoUrl" type="video/mp4" @loadedmetadata="handleLoaded"></video>
    <p v-if="loading">加载中...</p>
    <p v-if="error">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
  import { ref, onMounted } from 'vue';

  const props = defineProps<{ videoUrl: string }>();
  const videoPlayer = ref<HTMLVideoElement | null>(null);
  const loading = ref(true);
  const error = ref<string | null>(null);
  const emit = defineEmits(['play']);
  const handleLoaded = () => {
    loading.value = false;
    // 自动播放（需要静音）
    videoPlayer.value?.play().catch((e) => {
      error.value = '自动播放失败: ' + e.message;
    });
    emit('play');
  };
</script>

<style scoped>
  .video-preview {
    max-width: 90vw;
    max-height: 90vh;
  }

  video {
    max-width: 100%; /* 确保宽度不超过容器 */
    max-height: 85vh; /* 留出空间给控制条 */
    background: #000;
    object-fit: contain; /* 保持比例完整显示 */
  }
</style>
