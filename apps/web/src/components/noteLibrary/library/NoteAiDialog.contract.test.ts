import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const dialogSource = readFileSync(
  resolve(process.cwd(), 'src/components/noteLibrary/library/NoteAiDialog.vue'),
  'utf8',
);
const panelSource = readFileSync(resolve(process.cwd(), 'src/components/aiSkills/AiSkillPanel.vue'), 'utf8');
const detailSource = readFileSync(resolve(process.cwd(), 'src/view/noteLibrary/NoteDetail.vue'), 'utf8');
const replySource = readFileSync(resolve(process.cwd(), 'src/components/noteLibrary/detail/AiReply.vue'), 'utf8');
const zhLocaleSource = readFileSync(resolve(process.cwd(), 'src/i18n/locales/zh-CN.ts'), 'utf8');

describe('笔记 AI 封闭能力与新笔记持久化契约', () => {
  it('笔记库只显示真实支持的预设能力，不再保留自由提问和提取待办', () => {
    expect(dialogSource).toContain(':show-prompt="false"');
    expect(dialogSource).toContain("skillId: 'note.batch_summarize'");
    expect(dialogSource).toContain('resourceRefs.value.length >= 2 && resourceRefs.value.length <= 10');
    expect(dialogSource).toMatch(/if \(resourceRefs\.value\.length >= 2\)[\s\S]*skillId: 'note\.create_from_sources'/);
    expect(dialogSource).toContain("skillId: 'note.create_from_sources'");
    expect(dialogSource).not.toContain('extract-todos');
    expect(dialogSource).not.toContain('aiExtractTodos');
    expect(zhLocaleSource).toContain("aiCreateNote: '整理为一篇新笔记'");
  });

  it('新笔记先展示服务端确认动作，确认后立即持久化再打开已保存笔记', () => {
    expect(panelSource).toContain('response.availableActions.length');
    expect(panelSource).toContain("emit('result-action', action, result)");
    expect(dialogSource).toContain("action.id !== 'create_note_from_preview'");
    expect(dialogSource).toContain('persistAiNotePreview(response');
    expect(dialogSource).toContain('await router.push(handoff.route)');
    expect(dialogSource).not.toContain('createAiNoteDraftHandoff(response');
    expect(detailSource).toContain('readAiNoteDraft(query.aiDraft)');
    expect(detailSource).toContain('discardAiNoteDraft(nextQuery.aiDraft)');
  });

  it('正文润色使用服务端 SSE 增量与 reset 修复事件，不以客户端打字机伪装流式', () => {
    expect(replySource).toContain('executeAiSkillStream');
    expect(replySource).toContain('onDelta(content)');
    expect(replySource).toContain('onReset()');
    expect(replySource).not.toContain('executeAiSkill(');
  });

  it('失败态直接展示服务端稳定的可操作原因', () => {
    expect(panelSource).toContain('{{ error.message }}');
  });
});
