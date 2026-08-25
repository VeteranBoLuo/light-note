import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/components/cloudSpace/fieldList.vue'), 'utf8');
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

  it('桌面批量栏为选中数量保留固定宽度，数量变化不再推动后续按钮', () => {
    expect(source).toMatch(
      /@media \(min-width: 768px\)[\s\S]*?\.batch-actions \.selected-count\s*\{[\s\S]*?width:\s*148px;[\s\S]*?flex:\s*0 0 148px;/,
    );
    expect(source).toContain('font-variant-numeric: tabular-nums;');
    expect(source).toMatch(
      /\.ai-file-analysis-action\s*\{[\s\S]*?min-width:\s*128px;[\s\S]*?border:\s*1px solid transparent;/,
    );
    expect(source).toMatch(/\.ai-file-analysis-action:not\(\.disabled\)\s*\{[\s\S]*?border-color:/);
  });

  it('移动端卡片隐藏直接下载，卡片本身仍可拖入文件夹', () => {
    expect(source).toContain('v-if="!batchMode && !bookmark.isMobile"');
    expect(source).toContain(':draggable="canDragFile(item)"');
    expect(source).toContain('@dragstart="onFileDragStart($event, item)"');
    expect(source).toContain('@dragend="onFileDragEnd"');
    expect(source).toContain('suppressCardClickUntil = Number.POSITIVE_INFINITY');
    expect(source).toContain('suppressCardClickUntil = Date.now() + 250');
  });

  it('批量下载先选择分别下载或 ZIP，分别下载不再连续触发自动下载，单文件仍直接下载', () => {
    expect(source).toContain('v-model:visible="batchDownloadChoiceVisible"');
    expect(source).toContain('v-model:visible="preparedDownloadsVisible"');
    expect(source).toContain(`startBatchDownload('individual')`);
    expect(source).toContain(`startBatchDownload('zip')`);
    expect(source).toContain('const runBrowserDirectoryDownloads = async');
    expect(source).toContain('const prepareBrowserIndividualDownloads = async');
    expect(source).toContain('triggerPreparedBrowserDownload(item.meta)');
    expect(source).not.toContain('const runBrowserIndividualDownloads = async');
    expect(source).toContain('const runZipBatchDownload = async');
    expect(source).toMatch(
      /if \(selectedFiles\.length === 1\)[\s\S]*?downloadField\(selectedFiles\[0\]\.id\)[\s\S]*?batchDownloadChoiceVisible\.value = true/,
    );
  });

  it('列表表头与普通行 hover 使用稳定主题色，不再动态混入资源橙色', () => {
    expect(source).toContain('background: var(--cloud-file-list-header-bg, var(--card-background));');
    expect(source).toContain('background: var(--cloud-file-list-row-hover-bg, var(--card-background));');
    expect(themeSource).toContain('--cloud-file-list-header-bg: #fffefc;');
    expect(themeSource).toContain('--cloud-file-list-row-hover-bg: #fffcf8;');
    expect(themeSource).toContain('--cloud-file-list-header-bg: #30343d;');
    expect(themeSource).toContain('--cloud-file-list-row-hover-bg: #33363c;');
  });
});
