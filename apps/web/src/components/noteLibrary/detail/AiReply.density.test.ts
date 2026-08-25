import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/components/noteLibrary/detail/AiReply.vue'), 'utf8');

function sourceBetween(startText: string, endText: string) {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start + startText.length);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('笔记 AI 建议结果密度', () => {
  it('默认侧栏折叠富内容源码空白，并分别收紧段落、标题与列表节奏', () => {
    const compactStyles = sourceBetween(
      '.output-body :deep(.typewriter-content)',
      "[data-theme='night'] .ai-container",
    );
    expect(compactStyles).toMatch(/typewriter-content--markup[\s\S]*white-space:\s*normal/u);
    expect(compactStyles).toMatch(/:deep\(p\)[\s\S]*margin:\s*0 0 6px/u);
    expect(compactStyles).toMatch(/:deep\(ul\),[\s\S]*margin:\s*5px 0/u);
    expect(compactStyles).toMatch(/:deep\(li\)[\s\S]*margin:\s*2px 0/u);
  });

  it('放大弹窗保留独立的舒展排版，不继承侧栏紧凑规则', () => {
    const previewStyles = sourceBetween('.ai-preview-body {', '.ai-preview-actions {');
    expect(previewStyles).toMatch(/white-space:\s*normal/u);
    expect(previewStyles).toMatch(/font-size:\s*15px/u);
    expect(previewStyles).toMatch(/line-height:\s*1\.7/u);
    expect(previewStyles).toMatch(/:deep\(p\),[\s\S]*margin:\s*0 0 10px/u);
  });

  it('移动端放大弹窗按内容区宽度收敛，不把视口宽度与弹窗 padding 叠加', () => {
    const mobilePreviewStyles = sourceBetween('@media (max-width: 768px)', '/* 放大预览里的「追问迭代」输入区 */');
    expect(mobilePreviewStyles).toMatch(/\.ai-preview--split\s*\{[\s\S]*width:\s*100%;[\s\S]*max-width:\s*100%;/u);
    expect(mobilePreviewStyles).not.toContain('86vw');
  });

  it('首段内容到达前失败时清理内部正文标记，部分结果到达后仍保留可读内容', () => {
    expect(source).toMatch(/let receivedContent = '';[\s\S]*try\s*\{/u);
    expect(source).toMatch(/catch \(error: any\)[\s\S]*if \(!receivedContent\) outputFull\.value = '';/u);
  });
});
