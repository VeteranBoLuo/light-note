import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'NoteDetail.vue'), 'utf8');
const detailDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../components/noteLibrary/detail');
const versionHistorySource = fs.readFileSync(path.resolve(detailDirectory, 'NoteVersionHistory.vue'), 'utf8');
const zhLocaleSource = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../i18n/locales/zh-CN.ts'),
  'utf8',
);
const enLocaleSource = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../i18n/locales/en-US.ts'),
  'utf8',
);

describe('NoteDetail autosave policy', () => {
  it('正文使用 1.5 秒合并窗口，但离开路由前仍强制落库', () => {
    expect(source).toContain('const TEXT_SAVE_DEBOUNCE_DELAY = 1_500');
    expect(source).toContain('timer.value = setTimeout(');
    expect(source).toContain('onBeforeRouteLeave(async () =>');
    expect(source).toContain('return await persistBeforeLeave()');
    expect(source).toContain('const saved = await flushPendingSave()');
  });

  it('Command/Ctrl+S 只立即普通保存，不创建手动历史版本', () => {
    const shortcutStart = source.indexOf('const handleKeyDown = (event) =>');
    const shortcutEnd = source.indexOf('function captureTitleBeforeLeave', shortcutStart);
    const shortcutSource = source.slice(shortcutStart, shortcutEnd);

    expect(shortcutSource).toContain('event.preventDefault()');
    expect(shortcutSource).toContain('event.repeat || readonly.value');
    expect(shortcutSource).toContain('void saveImmediately(true)');
    expect(shortcutSource).not.toContain('saveManualVersion');
  });

  it('历史版本按后端 reason 区分手动与自动保存', () => {
    const reasonStart = versionHistorySource.indexOf('function versionReasonLabel');
    const reasonEnd = versionHistorySource.indexOf('onMounted(fetchVersions)', reasonStart);
    const reasonSource = versionHistorySource.slice(reasonStart, reasonEnd);

    expect(reasonSource).toContain("'manual'");
    expect(reasonSource).toContain("normalized === 'drawing_autosave'");
    expect(reasonSource).toContain("knownReasons.has(normalized) ? normalized : 'other'");
    expect(zhLocaleSource).toContain("manual: '手动保存'");
    expect(zhLocaleSource).toContain("other: '其他版本'");
    expect(enLocaleSource).toContain("manual: 'Manual save'");
    expect(enLocaleSource).toContain("other: 'Other version'");
  });
});
