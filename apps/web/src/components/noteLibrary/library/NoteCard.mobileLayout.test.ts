import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/components/noteLibrary/library/NoteCard.vue'), 'utf8');

describe('移动端笔记卡片布局', () => {
  it('保留 44px 触控热区，但只绘制 30px 的更多按钮表面', () => {
    expect(source).toContain('class="note-more-button__visual"');
    expect(source).toMatch(/\.note-mobile-actions > \.note-more-button\s*\{[\s\S]*?background:\s*transparent;/u);
    expect(source).toMatch(/\.note-more-button__visual[\s\S]*?width:\s*30px;[\s\S]*?height:\s*30px;/u);
    expect(source).toMatch(
      /@media \(max-width: 1023px\)[\s\S]*?\.note-mobile-actions > \.note-more-button\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/u,
    );
  });

  it('让更多按钮中心与 24px 标题/格式胶囊行中心对齐', () => {
    expect(source).toMatch(/\.note-mobile-actions\s*\{[\s\S]*?top:\s*6px;/u);
    expect(source).toMatch(/@media \(max-width: 1023px\)[\s\S]*?\.note-title-row\s*\{\s*padding-right:\s*44px;/u);
  });

  it('图片使用纵向正文流，而不是固定在摘要右侧的横向 flex', () => {
    expect(source).toMatch(/\.note-preview-body\s*\{\s*display:\s*block;/u);
    expect(source).toContain('v-if="previewTextBeforeImage"');
    expect(source).toContain('v-if="previewTextAfterImage"');
    expect(source).not.toMatch(/\.note-preview-body\.has-image\s*\{[\s\S]*?gap:/u);
  });
});
