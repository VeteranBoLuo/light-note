import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/components/noteLibrary/detail/Editor.vue'), 'utf8');
const menuSource = readFileSync(
  resolve(process.cwd(), 'src/components/noteLibrary/detail/EditorSlashCommandMenu.vue'),
  'utf8',
);

describe('HTML / Markdown 斜杠命令', () => {
  it('两种编辑器共享菜单并与资源提及互斥', () => {
    expect(source).toContain('<EditorSlashCommandMenu');
    expect(source).toContain('syncMarkdownInlineMenus');
    expect(source).toContain('syncTinyMceSlashCommand(editor)');
    expect(source).toMatch(/slashCommandVisible\.value[\s\S]*?closeInlineMention\(\)/);
    expect(source).toMatch(/tryOpenTinyMceMention[\s\S]*?slashCommandVisible\.value/);
  });

  it('按键处理尊重输入法并复用编辑器历史链路', () => {
    expect(source).toContain('if (event.isComposing) return');
    expect(source).toContain('editor.replaceRange(range.start, range.end, replacement.text, caret, caret)');
    expect(source).toContain("editor.undoManager.transact(() => editor.selection.setContent(''))");
    expect(menuSource).toContain("scrollNearestIntoContainer(container, activeItem, 'auto')");
  });

  it('菜单与资源选择器共用紧凑高度预算，翻转时不覆盖触发字符', () => {
    expect(menuSource).toContain('max-height: min(340px, calc(100vh - 140px))');
    expect(source).toContain('height: `${(Math.max(rect.height, 18) + 6) / zoom}px`');
  });

  it('菜单项按参考交互采用单行视觉密度，同时保留说明的辅助语义', () => {
    expect(menuSource).toMatch(
      /\.slash-command-menu__item \{[\s\S]*?min-height: 40px;[\s\S]*?padding: 4px 8px;[\s\S]*?line-height: 1\.35;/,
    );
    expect(menuSource).toMatch(/\.slash-command-menu__icon \{[\s\S]*?width: 28px;[\s\S]*?height: 28px;/);
    expect(menuSource).toMatch(
      /\.slash-command-menu__copy small \{[\s\S]*?position: absolute;[\s\S]*?clip: rect\(0, 0, 0, 0\);/,
    );
    expect(menuSource).toContain('v-if="command.syntax"');
    expect(source).toContain("syntax: '#'.repeat(level)");
    expect(source).toContain("syntax: '- [ ]'");
    expect(source).toContain("syntax: '```'");
  });

  it('Markdown 先选语言，富文本复用 codesample 高亮', () => {
    expect(menuSource).toContain("view.value = 'languages'");
    expect(source).toContain("buildCodeBlock(command.language || 'plaintext')");
    expect(source).toContain("editor.execCommand('codesample')");
    expect(source).not.toContain("key === 'insertCodeBlock') return editor.execCommand('FormatBlock', false, 'pre')");
  });
});
