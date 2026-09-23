<template>
  <div v-if="resources?.length" class="community-resources">
    <div v-for="item in resources" :key="item.publicId" class="resource-row" :class="{ 'is-compact': compact }">
      <BButton class="resource-card" @click="open(item)">
        <span class="resource-glyph" :class="item.kind"><SvgIcon :src="icon.resource[item.kind]" /></span>
        <span class="resource-copy"
          ><strong>{{ item.title }}</strong
          ><span
            >{{ t('community.feed.resource' + (item.kind === 'note' ? 'Note' : 'Bookmark')) }} ·
            {{ t('community.feed.fixedVersion') }}</span
          ></span
        >
        <span class="resource-read">{{ t('community.feed.preview') }}</span>
      </BButton>
      <BButton
        class="resource-remove"
        v-if="editable"
        :disabled="disabled"
        :aria-label="t('community.feed.removeResource', { title: item.title })"
        @click="$emit('remove', item)"
        >{{ t('community.feed.removeImage') }}</BButton
      >
    </div>
    <BModal
      v-if="selected"
      :key="selected.publicId"
      :visible="true"
      :title="selected.title"
      width="min(var(--ui-layout-800, 800px), 94vw)"
      :show-footer="false"
      @close="close"
    >
      <template #title>
        <span class="reader-heading"
          ><SvgIcon :src="icon.resource[selected.kind]" />{{
            t('community.feed.resource' + (selected.kind === 'note' ? 'Note' : 'Bookmark'))
          }}</span
        >
      </template>
      <div class="resource-reader" :class="'reader-' + selected.kind">
        <div v-if="loading" class="resource-loading"
          ><BLoading :loading="true" :title="t('community.feed.loading')"
        /></div>
        <div v-else-if="failed" class="resource-loading" role="alert">
          <p>{{ t('community.feed.resourceUnavailable') }}</p
          ><BButton @click="open(selected!)">{{ t('community.feed.retry') }}</BButton>
        </div>
        <template v-else-if="content">
          <article v-if="content.kind === 'note'" class="reader-paper">
            <span class="paper-marker" aria-hidden="true"></span>
            <h2>{{ selected.title }}</h2>
            <div class="resource-text">{{ content.body }}</div>
          </article>
          <article v-else class="reader-browser">
            <div class="browser-bar"
              ><span class="browser-dots" aria-hidden="true"><i></i><i></i><i></i></span
              ><span class="browser-address">{{ domain || t('community.feed.resourceBookmark') }}</span></div
            >
            <div class="browser-page">
              <span class="bookmark-emblem"><SvgIcon :src="icon.resource.bookmark" /></span>
              <h2>{{ selected.title }}</h2>
              <p class="resource-url">{{ safeUrl || t('community.feed.resourceUnavailable') }}</p>
              <a v-if="safeUrl" class="resource-visit" :href="safeUrl" target="_blank" rel="noopener noreferrer"
                >{{ t('community.feed.visitWebsite') }}<SvgIcon :src="icon.noteTree.openPage"
              /></a>
            </div>
          </article>
        </template>
        <div class="reader-meta">
          <BTooltip
            :title="
              t('community.feed.snapshotHint') +
              (selected.kind === 'bookmark' ? ' ' + t('community.feed.bookmarkSnapshotHint') : '')
            "
            always
            :z-index="12000"
          >
            <BButton class="version-toggle">{{ t('community.feed.sharedVersion') }}</BButton>
          </BTooltip>
        </div>
      </div>
    </BModal>
  </div>
</template>
<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useUserStore } from '@/store';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { feedGet, type FeedResource, type FeedResourceContent } from '@/api/communityFeedApi';
  const props = defineProps<{
    resources?: FeedResource[];
    editable?: boolean;
    disabled?: boolean;
    compact?: boolean;
  }>();
  defineEmits<{ remove: [item: FeedResource] }>();
  const { t } = useI18n(),
    user = useUserStore();
  const selected = ref<FeedResource | null>(null),
    content = ref<FeedResourceContent | null>(null),
    loading = ref(false),
    failed = ref(false);
  const domain = computed(() => (safeUrl.value ? new URL(safeUrl.value).hostname : ''));
  let generation = 0;
  const safeUrl = computed(() => {
    try {
      const url = new URL(content.value?.url || '');
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
    } catch {
      return '';
    }
  });
  function close() {
    generation++;
    selected.value = content.value = null;
  }
  async function open(item: FeedResource) {
    const current = ++generation;
    selected.value = item;
    content.value = null;
    loading.value = true;
    failed.value = false;
    try {
      const result = await feedGet<FeedResourceContent>(
        'resources/' + item.publicId,
        item.postId ? { postId: item.postId, revision: item.revision } : {},
      );
      if (current === generation) content.value = result;
    } catch {
      if (current === generation) failed.value = true;
    } finally {
      if (current === generation) loading.value = false;
    }
  }
  watch(() => [user.id, user.role, user.adminContext?.id, props.resources], close);
  onBeforeUnmount(close);
</script>
<style scoped>
  .community-resources {
    display: grid;
    gap: var(--ui-space-10, 10px);
    margin: var(--ui-space-18, 18px) 0;
  }
  .resource-row {
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    min-width: 0;
  }
  .resource-card.b_btn {
    display: flex;
    align-items: center;
    gap: var(--ui-space-12, 12px);
    flex: 1;
    min-width: 0;
    width: 100%;
    padding: var(--ui-space-14, 14px) var(--ui-space-16, 16px);
    height: auto;
    min-height: var(--ui-layout-72, 72px);
    line-height: 1.5;
    box-sizing: border-box;
    background: var(--workspace-content);
    border: 1px solid var(--workspace-border);
    border-radius: 10px;
    text-align: left;
    white-space: normal;
  }
  .resource-card.b_btn:hover {
    border-color: var(--primary-color);
  }
  .resource-glyph {
    display: flex;
    flex-shrink: 0;
    padding: var(--ui-space-9, 9px);
    border-radius: 8px;
    color: var(--workspace-note-text);
    background: var(--card-background);
  }
  .resource-glyph.bookmark {
    color: var(--primary-color);
  }
  .resource-glyph :deep(svg) {
    width: var(--ui-layout-22, 22px);
    height: var(--ui-layout-22, 22px);
  }
  .resource-copy {
    min-width: 0;
    flex: 1;
    display: grid;
    gap: var(--ui-space-4, 4px);
  }
  .resource-copy strong {
    font-size: var(--ui-font-14, 14px);
    color: var(--text-color);
    overflow-wrap: anywhere;
  }
  .resource-copy > span,
  .resource-read {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .resource-read {
    flex-shrink: 0;
  }
  .resource-row.is-compact {
    display: block;
    position: relative;
    border: 1px solid var(--workspace-border);
    border-radius: 10px;
    background: var(--workspace-open-canvas);
    overflow: hidden;
  }
  .is-compact .resource-card.b_btn {
    display: grid;
    grid-template-columns: var(--ui-layout-28, 28px) minmax(0, 1fr);
    gap: var(--ui-space-10, 10px);
    padding: var(--ui-space-12, 12px);
    border: 0;
    border-radius: 0;
    background: transparent;
  }
  .is-compact .resource-glyph {
    padding: var(--ui-space-5, 5px);
    border-radius: 6px;
    background: var(--workspace-hover);
  }
  .is-compact .resource-glyph :deep(svg) {
    width: var(--ui-layout-18, 18px);
    height: var(--ui-layout-18, 18px);
  }
  .is-compact .resource-copy strong {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
    line-height: 1.5;
  }
  .is-compact .resource-copy > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--ui-font-11, 11px);
  }
  .is-compact .resource-read {
    display: block;
    grid-column: 1 / -1;
    border-top: 1px solid var(--workspace-border);
    padding-top: var(--ui-space-10, 10px);
    line-height: var(--ui-layout-28, 28px);
    color: var(--workspace-purple-text);
  }
  .is-compact .resource-remove.b_btn {
    position: absolute;
    right: var(--ui-space-10, 10px);
    bottom: var(--ui-space-12, 12px);
    min-height: var(--ui-layout-28, 28px);
    padding: var(--ui-space-3, 3px) var(--ui-space-8, 8px);
    font-size: var(--ui-font-12, 12px);
    background: transparent;
    color: var(--desc-color);
  }
  .is-compact .resource-remove.b_btn:hover {
    color: var(--danger-color);
    background: var(--workspace-hover);
  }
  .reader-heading {
    display: flex;
    align-items: center;
    gap: var(--ui-space-9, 9px);
    font-size: var(--ui-font-14, 14px);
    color: var(--desc-color);
  }
  .reader-heading :deep(svg) {
    width: var(--ui-layout-18, 18px);
    height: var(--ui-layout-18, 18px);
  }
  .resource-reader {
    min-width: 0;
  }
  .reader-paper {
    position: relative;
    margin: var(--ui-space-4, 4px) var(--ui-space-6, 6px) var(--ui-space-14, 14px);
    padding: var(--ui-space-44, 44px) var(--ui-space-48, 48px) var(--ui-space-48, 48px);
    border: 1px solid var(--workspace-border);
    border-radius: 3px 12px 12px 3px;
    background: var(--workspace-content);
    box-shadow:
      4px 4px 0 var(--workspace-open-canvas),
      5px 5px 0 var(--workspace-border);
    border-left: 6px solid var(--workspace-note-text);
  }
  .paper-marker {
    position: absolute;
    top: 0;
    right: 32px;
    width: 18px;
    height: 30px;
    background: var(--workspace-note-text);
    opacity: 0.6;
    border-radius: 0 0 8px 2px;
  }
  .resource-reader h2 {
    margin: 0 0 var(--ui-space-28, 28px);
    color: var(--text-color);
    font-size: var(--ui-font-25, 25px);
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
  .reader-paper h2 {
    font-size: 25px;
  }
  .resource-text {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    line-height: 2;
    color: var(--text-color);
    font-size: 15px;
  }
  .reader-browser {
    overflow: hidden;
    border: 1px solid var(--workspace-border);
    border-radius: 12px;
    background: var(--workspace-content);
  }
  .browser-bar {
    display: flex;
    align-items: center;
    gap: var(--ui-space-20, 20px);
    padding: var(--ui-space-12, 12px) var(--ui-space-18, 18px);
    background: var(--workspace-open-canvas);
    border-bottom: 1px solid var(--workspace-border);
  }
  .browser-dots {
    display: flex;
    gap: var(--ui-space-6, 6px);
  }
  .browser-dots i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--desc-color);
    opacity: 0.35;
  }
  .browser-address {
    flex: 1;
    min-width: 0;
    text-align: center;
    font-size: var(--ui-font-12, 12px);
    color: var(--desc-color);
    overflow-wrap: anywhere;
    padding-right: var(--ui-space-33, 33px);
  }
  .browser-page {
    padding: var(--ui-space-38, 38px) var(--ui-space-32, 32px);
    text-align: center;
  }
  .bookmark-emblem {
    display: inline-flex;
    padding: var(--ui-space-14, 14px);
    border: 1px solid var(--workspace-border);
    border-radius: 16px;
    color: var(--primary-color);
    margin-bottom: var(--ui-space-20, 20px);
  }
  .bookmark-emblem :deep(svg) {
    width: var(--ui-layout-28, 28px);
    height: var(--ui-layout-28, 28px);
  }
  .browser-page h2 {
    margin-bottom: var(--ui-space-12, 12px);
  }
  .resource-url {
    overflow-wrap: anywhere;
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
    line-height: 1.7;
    margin: 0 0 var(--ui-space-26, 26px);
  }
  .resource-visit {
    display: inline-flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    color: var(--primary-color);
    font-size: var(--ui-font-14, 14px);
    text-decoration: none;
  }
  .resource-visit:hover {
    text-decoration: underline;
  }
  .resource-visit :deep(svg) {
    width: 16px;
    height: 16px;
  }
  .reader-meta {
    margin-top: var(--ui-space-18, 18px);
  }
  .version-toggle.b_btn {
    display: flex;
    align-items: center;
    gap: var(--ui-space-6, 6px);
    padding: var(--ui-space-4, 4px) 0;
    height: auto;
    background: transparent;
    border: 0;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  @media (max-width: 767px) {
    .reader-paper {
      padding: 36px 20px 28px;
      margin: 2px 4px 12px 0;
    }
    .reader-paper h2,
    .resource-reader h2 {
      font-size: 21px;
    }
    .browser-page {
      padding: 28px 18px;
    }
  }
  .resource-loading {
    min-height: var(--ui-layout-180, 180px);
    display: grid;
    place-content: center;
    text-align: center;
  }
  @media (max-width: 767px) {
    .resource-card.b_btn {
      padding: 12px;
      gap: 8px;
    }
    .resource-read {
      display: none;
    }
  }
</style>
