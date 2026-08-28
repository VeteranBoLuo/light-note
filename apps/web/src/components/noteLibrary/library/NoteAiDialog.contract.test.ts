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

describe('笔记分析与新笔记持久化契约', () => {
  it('笔记分析打开即执行单一只读能力，不再要求用户先选总结、比较或生成', () => {
    expect(dialogSource).toContain(':show-prompt="false"');
    expect(dialogSource).toContain(':show-grounding="false"');
    expect(dialogSource).toContain(":auto-run-action-id=\"resourceRefs.length ? 'summarize' : ''\"");
    expect(dialogSource).toContain("skillId: 'note.batch_summarize'");
    expect(dialogSource).not.toContain("skillId: 'note.batch_compare'");
    expect(dialogSource).not.toContain("skillId: 'note.create_from_sources'");
    expect(dialogSource).not.toContain('extract-todos');
    expect(dialogSource).not.toContain('aiExtractTodos');
    expect(zhLocaleSource).toContain("aiSummarizeSelected: '分析所选笔记'");
  });

  it('分析结果底部由用户选择保存为笔记，复用同一结果且不再次调用模型', () => {
    expect(panelSource).toContain('response.availableActions.length');
    expect(dialogSource).toContain('#result-actions');
    expect(dialogSource).toContain("t('aiSkills.saveAsNote')");
    expect(dialogSource).toContain('persistAiMarkdownResultAsNote(response');
    expect(dialogSource).toContain('await router.push(handoff.route)');
    expect(dialogSource).not.toContain('persistAiNotePreview(response');
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
