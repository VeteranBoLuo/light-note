import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const editorSource = readFileSync(resolve(process.cwd(), 'src/components/noteLibrary/detail/Editor.vue'), 'utf8');

function editorInitSource() {
  const start = editorSource.indexOf('const editorInit = computed');
  const end = editorSource.indexOf('watchEffect(', start + 1);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return editorSource.slice(start, end);
}

/**
 * 移动端富文本的长按/选择必须落到系统菜单（复制/粘贴/全选）。
 *
 * 曾经出的问题：移动端同时开着两层自定义菜单，把系统菜单顶掉了——
 *   1. quickbars 选区条只有 copy，没有 paste/全选；
 *   2. contextmenu 不显式设置时 TinyMCE 用默认值，未加载的付费插件被过滤后
 *      普通文字上只剩「链接」，而 longpress 也走 contextmenu 分支。
 * 实测（TinyMCE 8.6.0）：不设置 contextmenu 时事件被 preventDefault，原生菜单不出现；
 * 设为 false 后放行。所以这两项在移动端都不能再打开。
 */
describe('移动端富文本交给系统菜单', () => {
  it('移动端关闭 quickbars 选区条，桌面端保留自研快捷条', () => {
    const source = editorInitSource();
    expect(source).toMatch(/quickbars_selection_toolbar:\s*bookmark\.isMobile\s*\?\s*false/);
    // 桌面分支仍要有自研入口，别在修移动端时把桌面一起关掉
    expect(source).toMatch(/aiEdit \| myHeadingMenu/);
  });

  it('移动端显式把 contextmenu 设为 false，不落回 TinyMCE 默认值', () => {
    const source = editorInitSource();
    expect(source).toMatch(/bookmark\.isMobile\s*\?\s*\{\s*contextmenu:\s*false\s*\}\s*:\s*\{\}/);
  });

  it('移动端仍保留底部主工具栏，格式化能力不因关菜单而丢失', () => {
    expect(editorSource).toContain('id="editor-toolbar"');
    expect(editorInitSource()).toContain("fixed_toolbar_container: '#editor-toolbar'");
  });
});
