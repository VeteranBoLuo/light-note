<template>
  <main class="image-viewer-harness">
    <template v-if="noteTableEntry">
      <section class="image-viewer-harness__note">
        <h1>HTML 表格图片预览</h1>
        <!-- 这里刻意保留原生 table：它模拟的是用户笔记正文，不是轻笺业务表格控件。 -->
        <table @click="handleNoteContentImagePreviewEvent" @keydown="handleNoteContentImagePreviewEvent">
          <tbody>
            <tr>
              <td>表格内图片</td>
              <td>
                <img
                  :src="fixtures[0].src"
                  alt="笔记表格内图片"
                  role="button"
                  tabindex="0"
                  aria-label="查看笔记表格内图片大图"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </section>
      <BViewer v-if="bookmark.viewerKey" />
    </template>
    <template v-else>
      <BButton type="primary" @click="visible = true">{{ t('common.imageViewer.title') }}</BButton>
      <BImageViewer v-model:visible="visible" :images="images" :initial-id="initialId" />
    </template>
  </main>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BImageViewer from '@/components/base/Viewer/BImageViewer.vue';
  import BViewer from '@/components/base/Viewer/BViewer.vue';
  import { bookmarkStore } from '@/store';
  import type { ImageViewerItem } from '@/types/imageViewer';
  import { handleNoteContentImagePreviewEvent } from '@/utils/noteImagePreview';

  const { t } = useI18n();
  const params = new URLSearchParams(window.location.search);
  const state = params.get('state') || 'default';
  const initialId = params.get('initial') || 'wide';
  const noteTableEntry = params.get('entry') === 'note-table';
  const visible = ref(true);
  const bookmark = bookmarkStore();

  function svgDataUrl(width: number, height: number, label: string, accent: string, sections: number) {
    const sectionHeight = height / Math.max(1, sections);
    const blocks = Array.from({ length: sections }, (_, index) => {
      const y = index * sectionHeight;
      const fill = index % 2 === 0 ? '#f4f5f8' : '#e8eaf0';
      return `<rect x="0" y="${y}" width="${width}" height="${sectionHeight}" fill="${fill}"/>
        <rect x="${width * 0.08}" y="${y + sectionHeight * 0.2}" width="${width * 0.5}" height="${Math.max(
          10,
          sectionHeight * 0.12,
        )}" rx="8" fill="${accent}" opacity="${0.92 - (index % 3) * 0.14}"/>
        <rect x="${width * 0.08}" y="${y + sectionHeight * 0.48}" width="${width * 0.78}" height="${Math.max(
          8,
          sectionHeight * 0.07,
        )}" rx="6" fill="#6b7280" opacity="0.48"/>
        <rect x="${width * 0.08}" y="${y + sectionHeight * 0.66}" width="${width * 0.62}" height="${Math.max(
          8,
          sectionHeight * 0.07,
        )}" rx="6" fill="#6b7280" opacity="0.32"/>`;
    }).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="${width}" height="${height}" fill="#f4f5f8"/>
      ${blocks}
      <rect x="2" y="2" width="${width - 4}" height="${height - 4}" rx="18" fill="none" stroke="${accent}" stroke-width="4"/>
      <text x="${width / 2}" y="${Math.min(height - 30, Math.max(54, height * 0.1))}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${Math.max(
        24,
        Math.min(72, width / 12),
      )}" font-weight="700" fill="#1f2937">${label}</text>
    </svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  const fixtures: ImageViewerItem[] = [
    {
      id: 'wide',
      src: svgDataUrl(2400, 1000, 'WIDE · 2400 × 1000', '#615ced', 4),
      alt: '横向图片验收样例',
      width: 2400,
      height: 1000,
    },
    {
      id: 'tall',
      src: svgDataUrl(900, 1800, 'TALL · 900 × 1800', '#0f9f78', 6),
      alt: '竖向图片验收样例',
      width: 900,
      height: 1800,
    },
    {
      id: 'long',
      src: svgDataUrl(900, 3600, 'LONG · 900 × 3600', '#d97706', 12),
      alt: '长图片验收样例',
      width: 900,
      height: 3600,
    },
    {
      id: 'small',
      src: svgDataUrl(240, 160, 'SMALL', '#db2777', 2),
      alt: '小图片验收样例',
      width: 240,
      height: 160,
    },
  ];

  const images = computed<ImageViewerItem[]>(() => {
    if (state === 'empty') return [];
    if (state === 'error') {
      return [{ id: 'error', src: '/__image-viewer-missing__.png', alt: '加载失败验收样例' }];
    }
    return fixtures;
  });
</script>

<style lang="less">
  .image-viewer-harness {
    min-height: 100vh;
    display: grid;
    place-items: center;
    background: var(--background-color);
  }

  .image-viewer-harness__note {
    width: min(820px, calc(100vw - 32px));
    padding: 24px;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--surface-card-bg);
    color: var(--text-color);
  }

  .image-viewer-harness__note h1 {
    margin: 0 0 18px;
    font-size: 20px;
  }

  .image-viewer-harness__note table {
    width: 100%;
    border-collapse: collapse;
  }

  .image-viewer-harness__note td {
    padding: 14px;
    border: 1px solid var(--surface-border-color);
  }

  .image-viewer-harness__note img {
    display: block;
    width: min(420px, 100%);
    margin: 0 auto;
    cursor: zoom-in;
  }

  .image-viewer-harness__note img:focus-visible {
    outline: 2px solid var(--focus-ring-color);
    outline-offset: 3px;
  }

  html.disable-animations .image-viewer-harness,
  html.disable-animations .image-viewer-harness * {
    animation: none !important;
    transition: none !important;
  }
</style>
