<template>
  <span class="note-parent-link" :title="pathText" @click.stop>
    <BButton
      class="note-parent-link__prefix"
      :aria-label="`${$t('note.parentPage')}：${segments.at(-1)?.title || pathText}`"
      @click.stop="emit('activate', parentId)"
    >
      <span class="note-parent-link__icon-shell" aria-hidden="true">
        <SvgIcon :src="icon.resource.note" size="12" />
      </span>
      <span class="note-parent-link__label">{{ $t('note.parentPage') }}</span>
    </BButton>
    <span class="note-parent-link__separator" aria-hidden="true">›</span>
    <template v-for="(segment, index) in segments" :key="index">
      <span v-if="index" class="note-parent-link__separator" aria-hidden="true">/</span>
      <BButton
        v-if="segment.id"
        class="note-parent-link__text"
        :title="segment.title"
        @click.stop="emit('activate', segment.id)"
      >{{ segment.title }}</BButton>
      <span v-else class="note-parent-link__text">{{ segment.title }}</span>
    </template>
  </span>
</template>

<script lang="ts" setup>
  import { computed } from 'vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';

  const props = defineProps<{
    pathText: string;
    parentId: string;
    path?: Array<{ id?: unknown; title?: unknown }> | null;
  }>();
  const emit = defineEmits<{ activate: [id: string] }>();
  const segments = computed(() => {
    if (Array.isArray(props.path) && props.path.length > 1) {
      return props.path.slice(0, -1).map((item, index, parents) => ({
        id: String(item.id || (index === parents.length - 1 ? props.parentId : '')).trim(),
        title: String(item.title || '').trim(),
      })).filter((item) => item.title);
    }
    // 旧响应没有祖先 ID 时，只让直接父级可点击，不能把整条路径误指向它。
    const titles = props.pathText.split(' / ').map((title) => title.trim()).filter(Boolean);
    return titles.map((title, index) => ({
      title,
      id: index === titles.length - 1 ? props.parentId : '',
    }));
  });
</script>

<style lang="less" scoped>
  .note-parent-link {
    // 父级入口是层级导航，不复用格式徽章的中性胶囊表面。
    --primary-color: var(--resource-note-color, #00a884);
    --primary-btn-bg-color: transparent;
    --primary-btn-h-bg-color: color-mix(in srgb, var(--resource-note-color, #00a884) 8%, transparent);

    min-width: 0;
    width: fit-content;
    max-width: 100%;
    height: 24px;
    padding: 0 5px 0 2px;
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    gap: 5px;
    overflow: hidden;
    border: 0;
    border-radius: 7px;
    color: var(--desc-color);
    background: transparent;
    font-size: 12px;
    line-height: 22px;
    text-align: left;
    white-space: nowrap;

    &__prefix,
    &__text.b_btn {
      min-width: 0;
      height: 24px;
      padding: 0 2px;
      border: 0;
      background: transparent;
      font-size: inherit;
      line-height: inherit;
      color: var(--desc-color);
      border-radius: 4px;

      &:focus-visible {
        outline-offset: -2px;
      }

      &:hover,
      &:focus-visible {
        color: var(--text-color);
        text-decoration: underline;
        text-underline-offset: 2px;
      }
    }

    &__text.b_btn {
      display: block;
    }

    &__prefix {
      flex: 0 0 auto;
      gap: 5px;
    }

    &__icon-shell {
      width: 18px;
      height: 18px;
      flex: 0 0 18px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 5px;
      color: var(--resource-note-color, #00a884);
      background: color-mix(in srgb, var(--resource-note-color, #00a884) 12%, var(--card-background));
    }

    &__label {
      flex: 0 0 auto;
      color: var(--resource-note-color, #00a884);
      font-weight: 600;
    }

    &__separator {
      flex: 0 0 auto;
      color: var(--resource-note-color, #00a884);
      font-size: 15px;
      line-height: 1;
      opacity: 0.62;
    }

    &__text {
      min-width: 0;
      overflow: hidden;
      color: var(--desc-color);
      text-overflow: ellipsis;
      transition: color 0.16s ease;
    }
  }

</style>
