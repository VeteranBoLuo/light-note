import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const manifest = JSON.parse(readSource('extension/manifest.json'));
const serviceWorkerSource = readSource('src/extension/service-worker.ts');
const captureSource = readSource('src/extension/capture.ts');
const appSource = readSource('src/extension/ExtensionApp.vue');
const homeSource = readSource('src/extension/components/ExtensionHome.vue');
const loginSource = readSource('src/extension/components/ExtensionLogin.vue');
const bookmarkSource = readSource('src/extension/components/BookmarkCapture.vue');
const noteSource = readSource('src/extension/components/NoteCapture.vue');
const fileSource = readSource('src/extension/components/FileCapture.vue');
const successSource = readSource('src/extension/components/ExtensionSuccessView.vue');
const richTextSource = readSource('src/extension/components/ExtensionRichTextEditor.vue');
const draftPersistenceSource = readSource('src/extension/draftPersistence.ts');
const operationIdempotencySource = readSource('src/extension/operationIdempotency.ts');
const pageTextImportSource = readSource('src/extension/pageTextImport.ts');
const viteConfigSource = readSource('vite.extension.config.ts');
const stylesSource = readSource('src/extension/styles.less');

function extensionIdFromPublicKey(publicKey: string): string {
  const digest = crypto.createHash('sha256').update(Buffer.from(publicKey, 'base64')).digest().subarray(0, 16);
  return [...digest]
    .map((byte) => `${String.fromCharCode(97 + (byte >> 4))}${String.fromCharCode(97 + (byte & 15))}`)
    .join('');
}

describe('浏览器插件 Manifest 与隐私边界', () => {
  it('使用 MV3 原生 Side Panel，并把网页正文访问声明为按站点可选权限', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toEqual(['sidePanel', 'tabs', 'activeTab', 'scripting', 'storage', 'identity']);
    expect(manifest.side_panel.default_path).toBe('sidepanel.html');
    expect(manifest.background).toEqual({ service_worker: 'service-worker.js', type: 'module' });
    expect(manifest.icons).toMatchObject({
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    });
    expect(manifest.action.default_icon).toMatchObject({
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    });
    expect(manifest.content_scripts).toBeUndefined();
    expect(manifest.host_permissions).not.toContain('<all_urls>');
    expect(manifest.host_permissions).toEqual([
      'https://boluo66.top/*',
      'https://light-note-files.obs.cn-south-1.myhuaweicloud.com/*',
    ]);
    expect(manifest.host_permissions.some((permission: string) => permission.includes('*.obs.'))).toBe(false);
    expect(manifest.optional_host_permissions).toEqual(['http://*/*', 'https://*/*']);
  });

  it('公开构建键产生稳定扩展 ID，供服务端精确白名单使用', () => {
    expect(extensionIdFromPublicKey(manifest.key)).toBe('nkdlhmfjnokoicodeepadkamopdblbnd');
  });

  it('工具栏入口使用浏览器原生行为打开侧栏，不因异步调用丢失用户手势', () => {
    expect(serviceWorkerSource).toContain('setPanelBehavior({ openPanelOnActionClick: true })');
    expect(serviceWorkerSource).not.toContain('chrome.action.onClicked.addListener');
    expect(serviceWorkerSource).not.toContain('chrome.sidePanel.open');
    expect(serviceWorkerSource).not.toContain("from './capture'");
    expect(serviceWorkerSource).not.toContain('chrome.scripting.executeScript');
    expect(serviceWorkerSource).not.toContain('lightNoteTriggerTabId');
    expect(captureSource).toContain('chrome.tabs.query({ active: true, lastFocusedWindow: true })');
    expect(captureSource).toContain('chrome.scripting.executeScript');
    expect(captureSource).toContain('chrome.permissions.request({ origins: [target.originPattern] })');
    expect(appSource).not.toContain('captureTriggeredPage');
  });

  it('构建启用 Vue I18n JIT 并阻止 MV3 CSP 不允许的动态代码生成', () => {
    expect(viteConfigSource).toContain('__INTLIFY_JIT_COMPILATION__: true');
    expect(viteConfigSource).toContain('__INTLIFY_DROP_MESSAGE_COMPILER__: false');
    expect(viteConfigSource).toContain('light-note-extension-csp-gate');
    expect(viteConfigSource).toContain('Manifest V3 CSP forbids eval/new Function');
  });
});

describe('浏览器插件三类流程接线', () => {
  it('入口页明确让用户选择书签、笔记或文件', () => {
    expect(homeSource).toContain("emit('select', 'bookmark')");
    expect(homeSource).toContain("emit('select', 'note')");
    expect(homeSource).toContain("emit('select', 'file')");
    expect(homeSource).not.toContain('browserExtension.home.description');
    expect(appSource).toContain(':src="icon.arrow_left"');
    expect(appSource).not.toContain(':src="icon.back"');
    expect(loginSource).toContain('@keydown.esc.stop.prevent="emit(\'close\')"');
  });

  it('侧栏只让主内容区滚动，并在三类视图切换后回到顶部', () => {
    expect(appSource).toContain('ref="mainRef"');
    expect(appSource).toContain('watch(view, async () =>');
    expect(appSource).toContain('mainRef.value.scrollTop = 0');
    expect(stylesSource).toMatch(/html,[\s\S]*#app \{[\s\S]*width: 100%;[\s\S]*overflow: hidden;/u);
    expect(stylesSource).toMatch(/body \{[\s\S]*display: block;/u);
    expect(stylesSource).toMatch(
      /\.ln-extension-shell \{[\s\S]*grid-template-rows: auto minmax\(0, 1fr\);[\s\S]*overflow: hidden;/u,
    );
    expect(stylesSource).toMatch(/\.ln-extension-main \{[\s\S]*min-height: 0;[\s\S]*overflow-y: auto;/u);
  });

  it('未登录状态同时提供可点击页头和明确主按钮', () => {
    expect(appSource).toContain("t('browserExtension.login.headerAction')");
    expect(appSource).toContain('@click="openAuth"');
    expect(homeSource).toContain("'is-unauthenticated': !authenticated");
    expect(homeSource).toContain('<BButton v-else type="primary" @click="emit(\'login\')">');
  });

  it('书签视图读取当前页并支持网址与名称一起回填，同时保留 AI、正式保存与待整理三条路径', () => {
    expect(bookmarkSource).toContain('await captureTriggeredPage()');
    expect(bookmarkSource).toContain('await captureCurrentTabAddress()');
    expect(bookmarkSource).toContain('@click="fillCurrentPage"');
    expect(bookmarkSource).toContain('ln-extension-current-page-fill');
    expect(bookmarkSource).not.toContain('ln-extension-field__action-row');
    expect(bookmarkSource).toContain('draft.url = page.url');
    expect(bookmarkSource).toContain('draft.name = page.title.slice(0, 255)');
    expect(bookmarkSource).toContain('generateWithAi');
    expect(bookmarkSource).toContain('browserExtension.bookmark.aiDescription');
    expect(bookmarkSource).not.toContain('browserExtension.bookmark.modeInboxDescription');
    expect(bookmarkSource).not.toContain('ln-extension-mode-note');
    expect(bookmarkSource).toContain('v-if="draft.mode === \'formal\'"');
    expect(bookmarkSource).toContain('saveSelectedMode');
    expect(bookmarkSource).toContain('saveFormal');
    expect(bookmarkSource).toContain('saveToInbox');
    expect(bookmarkSource).toContain("relatedTagNames: mode === 'formal'");
    expect(bookmarkSource).toContain('@update:value="updateSelectedTagIds"');
    expect(bookmarkSource).toContain('draft.selectedTagIds.length + draft.selectedNewTags.length > 4');
    expect(stylesSource).toMatch(
      /\.ln-extension-form-view > \.ln-extension-current-page-fill\.b_btn \{[\s\S]*min-height: 42px;[\s\S]*border-left-width: 3px;/u,
    );
  });

  it('书签草稿只在同一次侧栏实例内恢复，重新打开后从当前页开始', () => {
    expect(appSource).toContain('const draftSessionId = crypto.randomUUID()');
    expect(appSource).toContain(':draft-session-id="draftSessionId"');
    expect(bookmarkSource).toContain('draftSessionId: string');
    expect(bookmarkSource).toContain('sessionId: props.draftSessionId');
    expect(bookmarkSource).toContain('belongsToExtensionDraftSession(stored.sessionId, props.draftSessionId)');
    expect(bookmarkSource).toContain('await clearBookmarkDraft()');
    expect(draftPersistenceSource).toContain('belongsToExtensionDraftSession');
  });

  it('笔记支持两种格式、安全预览和非空正文切换确认', () => {
    expect(noteSource).toContain("draft.type === 'markdown'");
    expect(noteSource).toContain('v-if="draft.type === \'markdown\'"');
    expect(noteSource).toContain("v-if=\"draft.type === 'html' || editorMode === 'edit'\"");
    expect(noteSource).toContain('DOMPurify.sanitize');
    expect(richTextSource).toContain('contenteditable="true"');
    expect(richTextSource).toContain('DOMPurify.sanitize');
    expect(richTextSource).toContain('@paste.prevent="insertClipboardContent"');
    expect(richTextSource).not.toContain('tinymce');
    expect(noteSource).toContain('if (!hasBody.value) return apply()');
    expect(noteSource).toContain('Alert.alert');
    expect(noteSource).toContain('@click="importCurrentPageText"');
    expect(noteSource).toContain('captureCurrentPageText(target)');
    expect(noteSource).toContain('prepareCurrentPageTextCapture()');
    expect(noteSource).toContain('appendImportedText(page.text)');
    expect(noteSource).toContain('pageImportError.value = t');
    expect(noteSource).toContain('ln-extension-page-import-error');
    expect(pageTextImportSource).toContain('document.createTextNode(line)');
    expect(pageTextImportSource).toContain('DOMPurify.sanitize');
    expect(noteSource).toContain('page.title.slice(0, 255)');
    expect(noteSource).toContain('isUntouchedDraft()');
    expect(draftPersistenceSource).toContain('await tail.catch');
    expect(draftPersistenceSource).toContain('await clear()');
    expect(noteSource).toContain('await draftPersistence.save(noteDraftSnapshot())');
    expect(bookmarkSource).toContain('await draftPersistence.save(bookmarkDraftSnapshot())');
    expect(operationIdempotencySource).toContain("crypto.subtle.digest('SHA-256'");
    expect(noteSource).toContain('ln-extension-note-title-field');
    expect(stylesSource).toContain('.ln-extension-note-title-field');
    expect(stylesSource).toMatch(
      /\.ln-extension-note-editor \{[\s\S]*&:focus-within[\s\S]*\.b-textarea \{[\s\S]*border: 0 !important;/u,
    );
    expect(richTextSource).not.toContain('&:focus-visible');
  });

  it('书签与笔记使用紧凑表单密度，笔记编辑和预览区拥有稳定的可见高度与完整边框', () => {
    expect(bookmarkSource).toContain('ln-extension-bookmark-view');
    expect(bookmarkSource).toContain(':rows="3"');
    expect(noteSource).toContain('ln-extension-note-view');
    expect(noteSource).toContain('height="38px"');
    expect(noteSource).toContain(':rows="18"');
    expect(stylesSource).toMatch(/\.ln-extension-bookmark-view,[\s\S]*gap: 11px;[\s\S]*padding-top: 14px;/u);
    expect(stylesSource).toMatch(/\.ln-extension-bookmark-mode \{[\s\S]*min-height: 48px;/u);
    expect(stylesSource).toMatch(
      /\.ln-extension-note-editor \{[\s\S]*height: clamp\(360px, 50vh, 520px\);[\s\S]*resize: none;/u,
    );
    expect(stylesSource).toMatch(
      /\.ln-extension-note-preview \{[\s\S]*height: clamp\(360px, 50vh, 520px\);[\s\S]*overflow-y: auto;/u,
    );
    expect(richTextSource).toMatch(/height: 100%;[\s\S]*overflow-y: auto;[\s\S]*scrollbar-gutter: stable;/u);
  });

  it('文件支持 BUpload、拖拽、取消、重试与部分失败，成功页提供两个后续动作', () => {
    expect(fileSource).toContain('<BUpload');
    expect(fileSource).toContain('@drop.prevent="handleDrop"');
    expect(fileSource).toContain('cancelTask(task)');
    expect(fileSource).toContain('retryTask(task)');
    expect(fileSource.match(/:disabled="uploading"/gu)).toHaveLength(5);
    expect(fileSource).toContain('if (uploading.value) return;');
    expect(fileSource).toContain('partialFailure');
    expect(successSource).toContain("emit('continue')");
    expect(successSource).toContain('openResource');
  });
});
