import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'src/components/noteLibrary/library/NoteReadonlyPreview.vue'),
  'utf8',
);
const commonStyles = readFileSync(resolve(process.cwd(), 'src/assets/css/common.less'), 'utf8');

describe('NoteReadonlyPreview', () => {
  it('正文加载态在可用预览区域内水平与垂直居中', () => {
    expect(source).toContain('<div v-if="loading" class="note-readonly-preview__loading">');
    expect(source).toMatch(
      /\.note-readonly-preview__loading\s*\{[\s\S]*min-height:\s*100%;[\s\S]*display:\s*grid;[\s\S]*place-items:\s*center;/u,
    );
  });

  it('图文组合保留左右布局，正文图片可以点击或键盘放大', () => {
    expect(source).toContain('note-readonly-preview__content note-rich-content is-image-preview-enabled');
    expect(source).toContain('@click="handlePreviewContentActivation"');
    expect(source).toContain('@keydown="handlePreviewImageActivation"');
    expect(source).toContain('prepareNoteContentPreviewImages');
    expect(commonStyles).toMatch(/\.note-rich-content[\s\S]*\.ln-media-text__item\s*\{[\s\S]*display:\s*flex;/u);
    expect(commonStyles).toContain("&[data-ln-media-position='right'] .ln-media-text__item");
  });

  it('只读正文表格保留原生排版并由独立容器承接横向滚动', () => {
    expect(source).toContain("root.querySelectorAll<HTMLTableElement>('table')");
    expect(source).toContain("table.parentElement?.classList.contains('ln-rich-table-scroll')");
    expect(source).toContain("scrollContainer.className = 'ln-rich-table-scroll'");
    expect(source).toContain('preparePreviewContentTables(previewContentRef.value)');
    expect(commonStyles).toMatch(
      /\.note-rich-content\s*\{[\s\S]*?table\s*\{[\s\S]*?display:\s*block;[\s\S]*?max-width:\s*100%;[\s\S]*?margin:\s*0\.9em auto;[\s\S]*?overflow-x:\s*auto;/u,
    );
    expect(commonStyles).toMatch(
      /th,\s*\n\s*td\s*\{[\s\S]*?min-width:\s*96px;[\s\S]*?border:\s*1px solid var\(--surface-border-color\);[\s\S]*?overflow-wrap:\s*break-word;[\s\S]*?word-break:\s*normal;/u,
    );
    expect(commonStyles).toMatch(
      /\.ln-rich-table-scroll\s*\{[\s\S]*?overflow-x:\s*auto;[\s\S]*?> table\s*\{[\s\S]*?display:\s*table;[\s\S]*?width:\s*100%;[\s\S]*?min-width:\s*100%;/u,
    );
  });

  it('阅读预览拦截站内引用，文件可选择本页预览或进入云空间', () => {
    expect(source).toContain("parseResourceHref(anchor.getAttribute('href'))");
    expect(source).toContain('resolveNoteResourceRefs(refs)');
    expect(source).toContain("t('note.resourceMention.previewHere')");
    expect(source).toContain("t('note.resourceMention.openInCloudSpace')");
    expect(source).toContain("apiBasePost('/api/file/getFileInfo'");
    expect(source).toContain('<FilePreview');
  });

  it('标题区显示权威待整理状态，并把详情状态同步给笔记库', () => {
    expect(source).toContain('<InboxPendingBadge v-if="previewPending" />');
    expect(source).toContain('props.seed?.isPending ?? detail.value.isPending');
    expect(source).toContain("hasOwnProperty.call(detailResult.data, 'isPending')");
    expect(source).toContain("emit('pendingState', Boolean(detailResult.data.isPending))");
  });

  it('子页面数量是带方向提示的浏览按钮，并向父级上抛浏览事件', () => {
    expect(source).toContain('class="note-readonly-preview__child-count"');
    expect(source).toContain(':aria-label="t(\'note.browseChildPages\')"');
    expect(source).toContain('@click="emit(\'browseChildren\')"');
    expect(source).toContain('<SvgIcon :src="icon.arrow_right" size="13"');
    expect(source).toMatch(/\.note-readonly-preview__child-count\.b_btn\s*\{[\s\S]*height:\s*30px;/u);
  });

  it('父级面包屑可在预览态逐级打开，悬浮时不绘制按钮底色', () => {
    expect(source).toContain('openPage: [page: PreviewBreadcrumbItem]');
    expect(source).toContain('@click="emit(\'openPage\', item)"');
    expect(source).toContain('class="note-readonly-preview__crumb"');
    expect(source).toMatch(
      /\.note-readonly-preview__crumb\.b_btn\s*\{[\s\S]*background:\s*transparent !important;[\s\S]*&:hover,[\s\S]*background:\s*transparent !important;/u,
    );
  });

  it('桌面预览轻微收紧标题区，且不在正文重复展示预览提示', () => {
    expect(source).toMatch(
      /\.note-readonly-preview__header\s*\{[\s\S]*min-height:\s*74px;[\s\S]*padding:\s*8px 16px;/u,
    );
    expect(source).toMatch(/\.note-readonly-preview__article\s*\{[\s\S]*width:\s*min\(100%, 1600px\);/u);
    expect(source).not.toContain('note-readonly-preview__notice');
  });

  it('手绘阅读态只保留外层阅读区滚动，可以抵达整张纸底部', () => {
    expect(source).toMatch(/\.note-readonly-preview__drawing\s*\{[\s\S]*min-height:\s*0;[\s\S]*height:\s*auto;/u);
  });

  it('从实际预览 DOM 提取标题并在同一个滚动容器内定位和高亮', () => {
    expect(source).toContain("querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')");
    expect(source).toContain("emit('outlineChange', outline)");
    expect(source).toContain("emit('outlineActiveChange', activeId");
    expect(source).toContain('scrollIntoContainer(root, heading, 8)');
    expect(source).toContain('ref="previewScrollRef"');
  });
});
