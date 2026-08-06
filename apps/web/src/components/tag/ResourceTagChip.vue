<template>
  <BChip
    v-if="!showDetailCorner"
    class="resource-tag-chip"
    tone="tag"
    :size="size"
    :interactive="interactive"
    :selected="selected"
    :disabled="disabled"
    :max-width="maxWidth"
    :title="tag.name"
    @click="handleChipClick"
  >
    <span v-if="showHash" aria-hidden="true">#</span>
    <span class="resource-tag-chip__text">{{ tag.name }}</span>
  </BChip>

  <BChip
    v-else
    class="resource-tag-chip tag-detail-chip"
    tone="tag"
    :size="size"
    :disabled="disabled"
    :max-width="maxWidth"
    :title="tag.name"
  >
    <BButton
      class="resource-tag-chip__label tag-detail-label"
      :disabled="disabled"
      @click.stop="emit('click', $event)"
    >
      <span v-if="showHash" aria-hidden="true">#</span>
      <span class="resource-tag-chip__text">{{ tag.name }}</span>
    </BButton>
    <BButton
      v-if="hasDetail"
      class="resource-tag-chip__detail tag-detail-corner"
      :disabled="disabled"
      :title="t('common.detail')"
      :aria-label="t('common.detail')"
      @click.stop="emit('detail', $event)"
    >
      <SvgIcon :src="icon.arrow_right" size="13" aria-hidden="true" />
    </BButton>
  </BChip>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';

  interface ResourceTagChipData {
    id?: string | number;
    name: string;
  }

  const props = withDefaults(
    defineProps<{
      tag: ResourceTagChipData;
      size?: 'small' | 'medium';
      showDetailCorner?: boolean;
      interactive?: boolean;
      selected?: boolean;
      disabled?: boolean;
      showHash?: boolean;
      maxWidth?: string;
    }>(),
    {
      size: 'small',
      showDetailCorner: false,
      interactive: false,
      selected: false,
      disabled: false,
      showHash: false,
      maxWidth: undefined,
    },
  );

  const emit = defineEmits<{
    click: [event: MouseEvent];
    detail: [event: MouseEvent];
  }>();

  const { t } = useI18n();
  const hasDetail = computed(() => props.tag.id !== undefined && props.tag.id !== null && props.tag.id !== '');

  function handleChipClick(event: MouseEvent) {
    if (!props.interactive || props.disabled) return;
    emit('click', event);
  }
</script>

<style scoped lang="less">
  .resource-tag-chip__text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tag-detail-chip {
    position: relative;
    overflow: visible;
    padding: 0;

    :deep(.b-chip__content) {
      width: 100%;
      overflow: visible;
    }
  }

  :deep(.resource-tag-chip__label.b_btn) {
    min-width: 0;
    width: 100%;
    height: auto;
    min-height: inherit;
    padding: 2px 7px;
    border: 0;
    border-radius: 999px;
    color: inherit;
    background: transparent;
    font: inherit;
    line-height: 16px;
    overflow: hidden;

    &:hover {
      color: inherit;
      background: transparent;
    }
  }

  @media (hover: hover) and (pointer: fine) {
    .tag-detail-chip:hover {
      --b-chip-fg: var(--chip-tag-hover-fg);
      --b-chip-bg: var(--chip-tag-hover-bg);
      --b-chip-border: var(--chip-tag-fg);
    }

  }
</style>
