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

  it('移动端文件操作抽屉不提供 AI 助手入口', () => {
    const mobileActionsSource = source.match(
      /const mobileFileActions = computed<MobilePageActionItem\[\]>\(\(\) => \{([\s\S]*?)\n  \}\);/,
    )?.[1];
    const mobileHandlerSource = source.match(
      /function handleMobileFileAction\(action: MobilePageActionItem\) \{([\s\S]*?)\n  \}/,
    )?.[1];

    expect(mobileActionsSource).toBeDefined();
    expect(mobileActionsSource).not.toContain("key: 'ai'");
    expect(mobileHandlerSource).toBeDefined();
    expect(mobileHandlerSource).not.toContain("action.key === 'ai'");
    expect(source).toContain("label: $t('cloudSpace.aiUseFile')");
  });

  it('批量下载先选择分别下载或 ZIP，单文件仍直接下载', () => {
    expect(source).toContain('v-model:visible="batchDownloadChoiceVisible"');
    expect(source).toContain(`startBatchDownload('individual')`);
    expect(source).toContain(`startBatchDownload('zip')`);
    expect(source).toContain('const runBrowserIndividualDownloads = async');
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
