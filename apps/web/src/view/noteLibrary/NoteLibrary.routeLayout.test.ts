import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/view/noteLibrary/NoteLibrary.vue'), 'utf8');
const templateSource = source.match(/^<template>\s*([\s\S]*)\s*<\/template>\s*<script/)?.[1]?.trim() || '';

describe('笔记库路由布局根节点', () => {
  it('保持 ResourcePageShell 单根结构以继承路由视图的桌面定位样式', () => {
    expect(templateSource.startsWith('<ResourcePageShell')).toBe(true);
    expect(templateSource.endsWith('</ResourcePageShell>')).toBe(true);
    expect(templateSource.match(/<ResourcePageShell\b/g)).toHaveLength(1);
  });

  it('笔记详情跳转加载层位于页面壳内部，不产生并列根节点', () => {
    const loadingLayerIndex = templateSource.indexOf('class="note-detail-navigation-loading"');
    const shellClosingIndex = templateSource.lastIndexOf('</ResourcePageShell>');

    expect(loadingLayerIndex).toBeGreaterThan(-1);
    expect(loadingLayerIndex).toBeLessThan(shellClosingIndex);
  });
});
