<template>
  <BCard
    v-if="nodes.length > 1"
    class="ai-lineage"
    variant="panel"
    padding="6px 8px"
    radius="10px"
    :aria-label="t('ai.conversations.lineage.label')"
  >
    <BPopover
      v-model:open="popoverOpen"
      trigger="click"
      placement="bottom-left"
      overlay-class-name="ai-lineage-popover"
    >
      <BButton class="ai-lineage__trigger" :aria-expanded="popoverOpen">
        <SvgIcon :src="icon.ai.branch" size="14" aria-hidden="true" />
        <span>
          <strong>{{ currentNode?.title || t('ai.conversations.untitled') }}</strong>
          <small>{{ t('ai.conversations.lineage.count', { count: nodes.length }) }}</small>
        </span>
      </BButton>
      <template #content>
        <div class="ai-lineage-popover__content" role="tree" :aria-label="t('ai.conversations.lineage.tree')">
          <header>
            <strong>{{ t('ai.conversations.lineage.tree') }}</strong>
            <small v-if="truncated">{{ t('ai.conversations.lineage.truncated') }}</small>
          </header>
          <BButton
            v-for="node in nodes"
            :key="node.id"
            class="ai-lineage-popover__node"
            :class="{ 'is-current': node.current }"
            :style="nodeStyle(node.depth)"
            role="treeitem"
            :aria-level="node.depth + 1"
            :aria-current="node.current ? 'page' : undefined"
            @click="openNode(node.id)"
          >
            <span class="ai-lineage-popover__rail" aria-hidden="true"></span>
            <span>
              <strong>{{ node.title || t('ai.conversations.untitled') }}</strong>
              <small>
                {{
                  node.parentConversationId ? t('ai.conversations.lineage.branch') : t('ai.conversations.lineage.root')
                }}
                · {{ formatDate(node.createdAt) }}
              </small>
            </span>
            <span v-if="node.current" class="ai-lineage-popover__current">
              {{ t('ai.conversations.lineage.current') }}
            </span>
          </BButton>
        </div>
      </template>
    </BPopover>

    <div class="ai-lineage__steps">
      <BTooltip :title="t('ai.conversations.lineage.previous')">
        <BButton
          class="ai-lineage__step"
          :disabled="currentIndex <= 0"
          :aria-label="t('ai.conversations.lineage.previous')"
          @click="goRelative(-1)"
        >
          <SvgIcon :src="icon.arrow_left" size="14" aria-hidden="true" />
        </BButton>
      </BTooltip>
      <span aria-live="polite">{{ currentIndex + 1 }} / {{ nodes.length }}</span>
      <BTooltip :title="t('ai.conversations.lineage.next')">
        <BButton
          class="ai-lineage__step"
          :disabled="currentIndex < 0 || currentIndex >= nodes.length - 1"
          :aria-label="t('ai.conversations.lineage.next')"
          @click="goRelative(1)"
        >
          <SvgIcon class="is-next" :src="icon.arrow_left" size="14" aria-hidden="true" />
        </BButton>
      </BTooltip>
    </div>
  </BCard>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { getAiConversationLineage, type AiConversationLineageNode } from '@/api/aiWorkspaceApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';

  const props = defineProps<{ conversationId: string }>();
  const emit = defineEmits<{
    open: [conversationId: string];
    unavailable: [conversationId: string];
  }>();
  const { t, locale } = useI18n();
  const nodes = ref<AiConversationLineageNode[]>([]);
  const truncated = ref(false);
  const popoverOpen = ref(false);
  let requestEpoch = 0;

  const currentIndex = computed(() => nodes.value.findIndex((node) => node.current));
  const currentNode = computed(() => nodes.value[currentIndex.value] || null);

  async function load() {
    const conversationId = String(props.conversationId || '').trim();
    const epoch = ++requestEpoch;
    popoverOpen.value = false;
    if (!conversationId) {
      nodes.value = [];
      truncated.value = false;
      return;
    }
    try {
      const result = await getAiConversationLineage(conversationId);
      if (epoch !== requestEpoch || props.conversationId !== conversationId) return;
      nodes.value = result.nodes;
      truncated.value = result.truncated;
    } catch (error) {
      if (epoch !== requestEpoch || props.conversationId !== conversationId) return;
      if (String((error as { code?: unknown } | null)?.code || '') === 'CONVERSATION_NOT_FOUND') {
        emit('unavailable', conversationId);
      }
      nodes.value = [];
      truncated.value = false;
    }
  }

  function openNode(conversationId: string) {
    popoverOpen.value = false;
    if (!conversationId || conversationId === props.conversationId) return;
    emit('open', conversationId);
  }

  function goRelative(offset: number) {
    const target = nodes.value[currentIndex.value + offset];
    if (target) openNode(target.id);
  }

  function formatDate(value: string) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return new Intl.DateTimeFormat(locale.value, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  function nodeStyle(depth: number) {
    const boundedDepth = Math.max(0, Math.min(8, Number(depth) || 0));
    return { '--lineage-indent': `${boundedDepth * 14}px` };
  }

  watch(() => props.conversationId, load, { immediate: true });
</script>

<style scoped lang="less">
  .ai-lineage {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin: 6px 10px 0;
  }

  .ai-lineage__trigger {
    min-width: 0;
    max-width: 100%;
    height: 30px;
    padding: 0 8px;
    gap: 7px;
    background: transparent;
  }

  .ai-lineage__trigger > span {
    min-width: 0;
    display: grid;
    text-align: left;
    line-height: 1.15;
  }

  .ai-lineage__trigger strong,
  .ai-lineage__trigger small {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ai-lineage__trigger strong {
    font-size: 12px;
  }

  .ai-lineage__trigger small {
    color: var(--sub-text-color);
    font-size: 10px;
  }

  .ai-lineage__steps {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--sub-text-color);
    font-size: 11px;
  }

  .ai-lineage__step {
    width: 28px;
    height: 28px;
    padding: 0;
  }

  .is-next {
    transform: rotate(180deg);
  }

  .is-next :deep(svg) {
    transform: inherit;
  }

  @media (max-width: 768px) {
    .ai-lineage {
      margin-inline: 8px;
    }

    .ai-lineage__trigger,
    .ai-lineage__step {
      min-height: 40px;
    }

    .ai-lineage__step {
      width: 40px;
    }
  }
</style>

<style lang="less">
  .ai-lineage-popover {
    width: min(360px, calc(100vw - 16px));
    max-height: min(460px, calc(100vh - 24px));
    overflow: auto;
    padding: 10px;
    box-sizing: border-box;
  }

  .ai-lineage-popover__content {
    display: grid;
    gap: 4px;
  }

  .ai-lineage-popover__content > header {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding: 2px 4px 7px;
  }

  .ai-lineage-popover__content > header small {
    color: var(--sub-text-color);
  }

  .ai-lineage-popover__node.b_btn {
    width: 100%;
    min-width: 0;
    height: auto;
    min-height: 42px;
    justify-content: flex-start;
    gap: 8px;
    padding: 6px 8px 6px calc(8px + var(--lineage-indent, 0px));
    line-height: 1.25;
    white-space: normal;
    text-align: left;
  }

  .ai-lineage-popover__node.is-current {
    color: var(--primary-color, #615ced);
    background: var(--primary-btn-h-bg-color);
  }

  .ai-lineage-popover__rail {
    width: 6px;
    height: 6px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: currentColor;
  }

  .ai-lineage-popover__node > span:nth-child(2) {
    min-width: 0;
    flex: 1;
    display: grid;
    gap: 2px;
  }

  .ai-lineage-popover__node strong,
  .ai-lineage-popover__node small {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ai-lineage-popover__node small {
    color: var(--sub-text-color);
    font-size: 11px;
  }

  .ai-lineage-popover__current {
    flex: 0 0 auto;
    font-size: 10px;
  }
</style>
