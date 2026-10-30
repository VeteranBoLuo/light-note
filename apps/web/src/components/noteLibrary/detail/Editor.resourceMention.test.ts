import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const editorSource = readFileSync(resolve(process.cwd(), 'src/components/noteLibrary/detail/Editor.vue'), 'utf8');

// <script setup> 内的函数统一两格缩进，截到首个两格缩进的右花括号即为函数体。
function functionSource(name: string) {
  const start = editorSource.indexOf(`function ${name}(`);
  expect(start).toBeGreaterThan(-1);
  const end = editorSource.indexOf('\n  }\n', start);
  expect(end).toBeGreaterThan(start);
  return editorSource.slice(start, end);
}

describe('Editor 资源提及触发', () => {
  it('移动端弹窗被关掉后记住这个 @，继续输入不再自动弹出', () => {
    const source = functionSource('closeMentionPicker');
    expect(source).toContain("markdownSource[markdownMentionRange.start] === '@'");
    expect(source).toContain('htmlMentionSelection?.textStart');
    expect(source.indexOf('dismissedMentionStart = pendingStart')).toBeLessThan(
      source.indexOf('mentionPickerVisible.value = false'),
    );
  });

  it('富文本与 Markdown 共用同一个关闭记忆', () => {
    const tryOpen = functionSource('tryOpenTinyMceMention');
    expect(tryOpen).toContain('if (dismissedMentionStart === textStart) return;');
    // 移动端弹窗与桌面浮层两条分支都要带上 @ 的全文位置。
    expect(tryOpen).toContain('...captureTinyMceMentionSelection(editor, replacementRange), textStart }');
    expect(tryOpen).toMatch(/text: '@',\s+textStart,/);
    // 规则只看当前段落，正文纯文本不含段落分隔。
    expect(tryOpen).toContain('resolveMentionQuery(lineBefore, lineBefore.length)');
    expect(functionSource('closeInlineMention')).toContain(
      'markdownMentionRange?.start ?? htmlMentionSelection?.textStart',
    );
    // 续写时重建选区不能丢掉 @ 的位置。
    expect(functionSource('syncTinyMceInlineMention')).toContain('...htmlMentionSelection,');
  });

  it('工具栏插入资源时，紧接英文单词先补空格，避免被当作疑似邮箱', () => {
    expect(functionSource('mentionTriggerTextAfter')).toContain(
      "isAmbiguousAsciiMention(`${textBefore}@`, textBefore.length, '') ? ' @' : '@'",
    );
    expect(functionSource('openResourceMentionPicker')).toContain('mentionTriggerTextAfter(markdownEditor.getValue()');
    const rich = functionSource('openRichResourceMentionPicker');
    expect(rich).toContain('dismissedMentionStart = null');
    expect(rich).toContain('editor.insertContent(mentionTriggerTextAfter(textBefore))');
  });
});
