<template>
  <div
    v-if="items.length > 1"
    class="ai-answer-version"
    :class="{ 'is-mobile': isMobile }"
    role="group"
    :aria-label="t('ai.versions.label')"
  >
    <BTooltip :title="t('ai.versions.previous')">
      <BButton
        class="ai-answer-version__button"
        :disabled="currentIndex <= 0"
        :aria-label="t('ai.versions.previous')"
        @click="navigate(-1)"
      >
        <SvgIcon :src="icon.arrow_left" size="13" aria-hidden="true" />
      </BButton>
    </BTooltip>
    <span aria-live="polite">
      {{ t('ai.versions.position', { current: currentIndex + 1, total: items.length }) }}
    </span>
    <BTooltip :title="t('ai.versions.next')">
      <BButton
        class="ai-answer-version__button"
        :disabled="currentIndex < 0 || currentIndex >= items.length - 1"
        :aria-label="t('ai.versions.next')"
        @click="navigate(1)"
      >
        <SvgIcon class="is-next" :src="icon.arrow_left" size="13" aria-hidden="true" />
      </BButton>
    </BTooltip>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { listAiMessageVersions, type AiMessageVersionSummary } from '@/api/aiWorkspaceApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';

  const props = defineProps<{
    conversationId: string;
    messageId: string;
    versionGroupId: string;
    refreshToken?: string;
    isMobile?: boolean;
  }>();
  const emit = defineEmits<{ navigate: [messageId: string] }>();
  const { t } = useI18n();
  const items = ref<AiMessageVersionSummary[]>([]);
  let requestEpoch = 0;

  const currentIndex = computed(() => items.value.findIndex((item) => item.messageId === props.messageId));

  async function load() {
    const conversationId = String(props.conversationId || '').trim();
    const messageId = String(props.messageId || '').trim();
    const epoch = ++requestEpoch;
    if (!conversationId || !messageId || !props.versionGroupId) {
      items.value = [];
      return;
    }
    try {
      const result = await listAiMessageVersions(conversationId, messageId);
      if (epoch !== requestEpoch || props.conversationId !== conversationId || props.messageId !== messageId) return;
      items.value = result.items;
    } catch {
      if (epoch === requestEpoch) items.value = [];
    }
  }

  function navigate(offset: number) {
    const target = items.value[currentIndex.value + offset];
    if (target) emit('navigate', target.messageId);
  }

  watch(() => [props.conversationId, props.messageId, props.versionGroupId, props.refreshToken], load, {
    immediate: true,
  });
</script>

<style scoped lang="less">
  .ai-answer-version {
    display: flex;
    align-items: center;
    gap: 4px;
    width: max-content;
    margin: -4px 0 7px 48px;
    color: var(--sub-text-color);
    font-size: 11px;
  }

  .ai-answer-version__button {
    width: 26px;
    height: 26px;
    padding: 0;
    border-radius: 999px;
  }

  .is-next {
    transform: rotate(180deg);
  }

  .ai-answer-version.is-mobile {
    margin-left: 10px;
  }

  .ai-answer-version.is-mobile .ai-answer-version__button {
    width: 40px;
    height: 40px;
  }
</style>
