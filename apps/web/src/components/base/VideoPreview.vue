<template>
  <div class="video-preview">
    <div class="video-stage">
      <video
        ref="videoPlayer"
        controls
        preload="metadata"
        playsinline
        @loadedmetadata="handleLoaded"
        @play="hasStarted = true"
        @ended="hasStarted = false"
        @error="handleError"
      >
        <source :src="videoUrl" :type="mimeType || undefined" />
      </video>
      <span v-if="formatLabel" class="video-format">{{ formatLabel }}</span>
      <BButton
        v-if="loaded && !hasStarted"
        class="video-play-button"
        :aria-label="t('cloudSpace.previewPanel.playVideo')"
        @click="playVideo"
      >
        <SvgIcon :src="icon.ai.play" size="30" aria-hidden="true" />
      </BButton>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { nextTick, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';

  const { t } = useI18n();
  const props = defineProps<{
    videoUrl: string;
    mimeType?: string;
    formatLabel?: string;
  }>();
  const videoPlayer = ref<HTMLVideoElement | null>(null);
  const loaded = ref(false);
  const hasStarted = ref(false);
  const emit = defineEmits<{
    loaded: [];
    error: [error: Error];
  }>();

  const handleLoaded = () => {
    loaded.value = true;
    emit('loaded');
  };

  const handleError = () => {
    loaded.value = false;
    hasStarted.value = false;
    emit('error', new Error(t('cloudSpace.previewPanel.mediaLoadFailed')));
  };

  async function playVideo() {
    if (!videoPlayer.value) return;
    try {
      await videoPlayer.value.play();
    } catch {
      emit('error', new Error(t('cloudSpace.previewPanel.mediaPlayFailed')));
    }
  }

  watch(
    () => [props.videoUrl, props.mimeType],
    async () => {
      loaded.value = false;
      hasStarted.value = false;
      await nextTick();
      videoPlayer.value?.load();
    },
  );
</script>

<style scoped>
  .video-preview {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px 20px 88px;
  }

  .video-stage {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: fit-content;
    max-width: 100%;
    height: fit-content;
    max-height: calc(100vh - 160px);
    max-height: calc(100dvh - 160px);
    overflow: hidden;
    border: 1px solid var(--card-border-color);
    border-radius: 14px;
    background: #050608;
    box-shadow: 0 18px 52px color-mix(in srgb, #000 28%, transparent);
  }

  video {
    display: block;
    width: auto;
    max-width: 100%;
    height: auto;
    max-height: calc(100vh - 162px);
    max-height: calc(100dvh - 162px);
    background: #000;
    object-fit: contain;
  }

  .video-format {
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 2;
    padding: 4px 8px;
    border: 1px solid rgba(255, 255, 255, 0.28);
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.72);
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
    pointer-events: none;
  }

  .video-play-button {
    position: absolute;
    left: 50%;
    top: 50%;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 68px;
    min-width: 68px;
    height: 68px;
    padding: 0;
    border: 2px solid rgba(255, 255, 255, 0.92);
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.78);
    color: #fff;
    transform: translate(-50%, -50%);
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.34);
  }

  @media (max-width: 600px) {
    .video-preview {
      padding: 12px 10px 76px;
    }

    .video-stage {
      border-radius: 10px;
    }

    .video-play-button {
      width: 60px;
      min-width: 60px;
      height: 60px;
    }
  }
</style>
