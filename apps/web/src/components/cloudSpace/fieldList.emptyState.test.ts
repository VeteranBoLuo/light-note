import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/components/cloudSpace/fieldList.vue'), 'utf8');
const batchBarSource = readFileSync(
  resolve(process.cwd(), 'src/components/resourceActions/ResourceBatchActionBar.vue'),
  'utf8',
);
const themeSource = readFileSync(resolve(process.cwd(), 'src/assets/css/theme.less'), 'utf8');

describe('cloud file empty state layout', () => {
  it('does not keep an empty scroll container above the empty state', () => {
    expect(source).toContain(`v-if="viewMode === 'card' && (cloud.loading || cloud.fileList.length)"`);
    expect(source).toContain(`v-if="viewMode === 'table' && (cloud.loading || cloud.fileList.length)"`);
    expect(source).toMatch(/\.file-empty-state\s*\{[\s\S]*?min-height:\s*0;[\s\S]*?flex:\s*1;/);
  });

  it('移动列表为 44px 更多按钮和待整理角标保留独立间距', () => {
    expect(source).toMatch(/@media \(max-width: 767px\)[\s\S]*?\.file-label\s*\{[\s\S]*?width:\s*calc\(100% - 54px\)/);
    expect(source).toMatch(/\.mobile-file-more\.b_btn\s*\{[\s\S]*?width:\s*44px/);
  });

  it('移动端文件操作抽屉只提供当前文件的模块 AI，不进入全局助手', () => {
    const mobileActionsSource = source.match(
      /const mobileFileActions = computed<MobilePageActionItem\[\]>\(\(\) => \{([\s\S]*?)\n  \}\);/,
    )?.[1];
    const mobileHandlerSource = source.match(
      /function handleMobileFileAction\(action: MobilePageActionItem\) \{([\s\S]*?)\n  \}/,
    )?.[1];

    expect(mobileActionsSource).toBeDefined();
    expect(mobileActionsSource).toContain("key: 'ai'");
    expect(mobileActionsSource).toContain("label: t('cloudSpace.aiUseFile')");
    expect(mobileHandlerSource).toBeDefined();
    expect(mobileHandlerSource).toContain("action.key === 'ai'");
    expect(mobileHandlerSource).toContain('openFilesInAi([file])');
    expect(source).toContain('<AiSkillDialog');
    expect(source).not.toContain("router.push('/ai')");
  });

  it('桌面卡片与列表的更多菜单都复用单文件分析能力，并按文件支持范围显示', () => {
    expect(source.match(/label: \$t\('cloudSpace\.aiUseFile'\)/g)).toHaveLength(2);
    expect(source.match(/function: \(\) => openFilesInAi\(\[item\]\)/g)).toHaveLength(2);
    expect(source.match(/\.\.\.\(isAiDocumentFileNameSupported\(item\.fileName\)/g)).toHaveLength(2);
  });

  it('桌面批量栏脱离文档流，数量变化不会重排文件列表和后续操作', () => {
    expect(source).toContain('<ResourceBatchActionBar');
    expect(batchBarSource).toMatch(/\.resource-batch-action-bar\s*\{[\s\S]*?position:\s*fixed/);
    expect(batchBarSource).toMatch(/\.resource-batch-action-bar__selection\s*\{[\s\S]*?min-width:\s*176px/);
    expect(batchBarSource).toMatch(
      /\.resource-batch-action-bar__copy strong,[\s\S]*?overflow:\s*hidden;[\s\S]*?text-overflow:\s*ellipsis;/,
    );
  });

  it('移动批量栏直接提供全选控制，并把生成与处理收进更多抽屉', () => {
    expect(source).not.toContain(`:detail="$t('resourceOutcome.batch.cloudDetail')"`);
    expect(source).toContain(':show-mobile-primary="false"');
    expect(source).toContain('<template #leading>');
    expect(source).toContain("key: 'outcome'");
    expect(source).toContain("label: t('resourceOutcome.primaryAction')");
    expect(source).not.toMatch(/mobileBatchActions[\s\S]*?key: 'toggleAll'/);
    expect(batchBarSource).toContain('v-if="$slots.leading"');
    expect(batchBarSource).toContain('v-if="showMobilePrimary"');
  });

  it('卡片正文高度包含内边距，不会比原卡片密度额外增高', () => {
    expect(source).toMatch(/\.file-card-body\s*\{[\s\S]*?box-sizing:\s*border-box/);
  });

  it('移动端卡片隐藏直接下载，卡片本身仍可拖入文件夹', () => {
    expect(source).toContain('v-if="!batchMode && !bookmark.isMobile"');
    expect(source).toContain(':draggable="canDragFile(item)"');
    expect(source).toContain('@dragstart="onFileDragStart($event, item)"');
    expect(source).toContain('@dragend="onFileDragEnd"');
    expect(source).toContain('suppressCardClickUntil = Number.POSITIVE_INFINITY');
    expect(source).toContain('suppressCardClickUntil = Date.now() + 250');
  });

  it('批量下载先选择分别下载或 ZIP，分别下载按顺序交给浏览器默认下载器', () => {
    expect(source).toContain('v-model:visible="batchDownloadChoiceVisible"');
    expect(source).toContain(`startBatchDownload('individual')`);
    expect(source).toContain(`startBatchDownload('zip')`);
    expect(source).toContain('const runBrowserSequentialDownloads = async');
    expect(source).toContain('submitBrowserBatchDownloads({');
    expect(source).toContain('submit: triggerPreparedBrowserDownload');
    expect(source).not.toContain('showDirectoryPicker');
    expect(source).not.toContain('preparedDownloadsVisible');
    expect(source).not.toContain('batchDownloadBrowserSubmitted');
    expect(source).toContain('const runZipBatchDownload = async');
    expect(source).toMatch(
      /if \(selectedFiles\.length === 1\)[\s\S]*?downloadField\(selectedFiles\[0\]\.id\)[\s\S]*?batchDownloadChoiceVisible\.value = true/,
    );
  });

  it('旧版 App 没有入队回执时按已开始下载收口，不再显示无法确认警告', () => {
    expect(source).toContain('const submitted = succeeded + unconfirmed');
    expect(source).toContain("message.success(t('cloudSpace.batchDownloadHandedOff', { count: submitted }))");
    expect(source).not.toContain('batchDownloadAndroidUnconfirmed');
  });

  it('列表表头与普通行 hover 使用稳定主题色，不再动态混入资源橙色', () => {
    expect(source).toContain('background: var(--cloud-file-list-header-bg, var(--card-background));');
    expect(source).toContain('background: var(--cloud-file-list-row-hover-bg, var(--card-background));');
    expect(themeSource).toContain('--cloud-file-list-header-bg: #fffefc;');
    expect(themeSource).toContain('--cloud-file-list-row-hover-bg: #fffcf8;');
    expect(themeSource).toContain('--cloud-file-list-header-bg: #30343d;');
    expect(themeSource).toContain('--cloud-file-list-row-hover-bg: #33363c;');
  });

  it('列表批量态点击整行、文件名或标签都只切换选择，不再打开预览或标签页', () => {
    const rowHandler = source.match(/const onListRowClick = \(item: any\) => \{([\s\S]*?)\n  \};/)?.[1] || '';
    const labelHandler = source.match(/const onFileLabelClick = \(item: any\) => \{([\s\S]*?)\n  \};/)?.[1] || '';
    const tagHandler =
      source.match(/const onFileTagClick = \(item: any, tagId: string\) => \{([\s\S]*?)\n  \};/)?.[1] || '';

    expect(rowHandler.indexOf('if (batchMode.value)')).toBeLessThan(rowHandler.indexOf('if (!bookmark.isMobile)'));
    expect(rowHandler).toContain('toggleRow(item.id, !selectedRows.value.includes(item.id))');
    expect(labelHandler).toContain('if (batchMode.value)');
    expect(labelHandler).toContain('toggleRow(item.id, !selectedRows.value.includes(item.id))');
    expect(tagHandler).toContain('if (batchMode.value)');
    expect(tagHandler).toContain('toggleRow(item.id, !selectedRows.value.includes(item.id))');
    expect(source).toContain('@click.stop="onFileTagClick(item, tag.id)"');
  });

  it('批量删除确认只预览少量文件名，并用危险操作和分层富文本明确后果', () => {
    expect(source).toContain('const previewLimit = 3;');
    expect(source).toContain("t('cloudSpace.batchDeleteRemaining', { count: remainingCount })");
    expect(source).toContain('class="b-alert-rich-content__lead"');
    expect(source).toContain('class="b-alert-rich-content__file"');
    expect(source).toContain("okType: 'danger'");
    expect(source).toContain("okText: t('cloudSpace.batchDeleteConfirmAction')");
    expect(source).toContain("escapeHtml(file.fileName || t('cloudSpace.unnamedFile'))");
    expect(source).not.toContain("map((f) => f.fileName).join('、')");
  });
});
