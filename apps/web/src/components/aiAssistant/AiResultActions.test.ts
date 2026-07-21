import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';

const routerPush = vi.fn();
const alert = vi.fn();
const recordOperation = vi.fn();
const listAiResultNoteTargets = vi.fn();
const listAiResultReusableBlocks = vi.fn();
const prepareAiResultNoteReuse = vi.fn();
const applyAiChangeSet = vi.fn();
const undoAiChangeSet = vi.fn();
const saveAiMessageAsNote = vi.fn();
const submitAiFeedback = vi.fn();
const branchAiConversation = vi.fn();

vi.mock('vue-router', () => ({ useRouter: () => ({ push: routerPush }) }));
vi.mock('@/components/base/BasicComponents/BModal/Alert.ts', () => ({ default: { alert } }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage.ts', () => ({
  default: { success: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock('@/api/commonApi.ts', () => ({ recordOperation }));
vi.mock('@/api/aiWorkspaceApi', () => ({
  listAiResultNoteTargets,
  listAiResultReusableBlocks,
  prepareAiResultNoteReuse,
  applyAiChangeSet,
  undoAiChangeSet,
  saveAiMessageAsNote,
  submitAiFeedback,
  branchAiConversation,
}));

const { default: AiResultActions } = await import('./AiResultActions.vue');

let cleanup: (() => void) | undefined;

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
}

function buttonByText(text: string) {
  return [...document.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
    button.textContent?.trim().includes(text),
  );
}

function mountActions() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup() {
      return () =>
        h(AiResultActions, {
          conversationId: 'conversation-1',
          messageId: 'message-1',
          contentLength: 120,
          content: '## 结论\n\n结论内容 [1]\n\n## 建议\n\n建议内容',
          sourceCount: 2,
          evidenceCount: 3,
        });
    },
  });
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: { 'zh-CN': zhCN },
    }),
  );
  app.component('OriginalIcon', { render: () => h('span', { 'data-test-icon': '' }) });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

describe('AiResultActions result reuse workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listAiResultNoteTargets.mockResolvedValue({
      items: [
        {
          id: 'note-1',
          title: '目标笔记',
          type: 'markdown',
          contentLength: 80,
          resourceVersion: 'version-1',
          updatedAt: '2026-07-19 12:00:00',
        },
      ],
      total: 1,
    });
    listAiResultReusableBlocks.mockResolvedValue({
      items: [
        {
          id: 'block-0-0123456789abcdef',
          index: 0,
          kind: 'section',
          title: '结论',
          preview: '结论 结论内容 [1]',
          charCount: 18,
          citationKeys: ['1'],
        },
        {
          id: 'block-1-fedcba9876543210',
          index: 1,
          kind: 'section',
          title: '建议',
          preview: '建议 建议内容',
          charCount: 12,
          citationKeys: [],
        },
      ],
      total: 2,
      sourceCount: 2,
      evidenceCount: 3,
    });
    prepareAiResultNoteReuse.mockResolvedValue({
      changeSetId: 'change-set-1',
      preview: {
        mode: 'append',
        target: {
          id: 'note-1',
          title: '目标笔记',
          type: 'markdown',
          resourceVersion: 'version-1',
        },
        beforeLength: 80,
        afterLength: 260,
        addedLength: 180,
        sourceCount: 2,
        evidenceCount: 3,
        uniqueBlockCount: null,
        duplicateBlockCount: null,
        selectedBlockCount: null,
        totalBlockCount: null,
        selectedCitationCount: null,
        undoSupported: true,
        versionCheck: 'content_hash',
      },
    });
    applyAiChangeSet.mockResolvedValue({ id: 'change-set-1', status: 'applied' });
    undoAiChangeSet.mockResolvedValue({ id: 'change-set-1', status: 'undone' });
    saveAiMessageAsNote.mockResolvedValue({
      note: { id: 'new-note', title: '新成果' },
      sourceMessageId: 'message-1',
      sourceCount: 2,
      evidenceCount: 3,
      receipt: {
        action: 'create_note',
        target: { resourceType: 'note', resourceId: 'new-note', title: '新成果' },
        sourceMessageId: 'message-1',
        sourceCount: 2,
        evidenceCount: 3,
        appliedAt: '2026-07-19T12:00:00.000Z',
        undo: { supported: false, reasonCode: 'CREATED_NOTE_REQUIRES_MANUAL_TRASH' },
      },
    });
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    document.body.innerHTML = '';
  });

  it('把新建、追加和合并作为三个明确动作展示，新建写入前必须经过 Alert 确认', async () => {
    const host = mountActions();
    expect(host.textContent).toContain('保存为新笔记');
    expect(host.textContent).toContain('追加到笔记');
    expect(host.textContent).toContain('合并进笔记');

    buttonByText('保存为新笔记')?.click();
    await flush();
    expect(document.body.textContent).toContain('创建一篇 Markdown 笔记');
    buttonByText('确认写入')?.click();
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0][0].content).toContain('来源与证据元数据会一起保存');

    alert.mock.calls[0][0].onOk();
    await flush();
    expect(saveAiMessageAsNote).toHaveBeenCalledWith('conversation-1', 'message-1', undefined);
    expect(document.body.textContent).toContain('新笔记已创建');
    expect(document.body.textContent).toContain('回收站');
  });

  it('追加流程支持目标搜索选择、差异预览、版本化执行回执和二次确认撤销', async () => {
    mountActions();
    buttonByText('追加到笔记')?.click();
    await flush();
    expect(listAiResultNoteTargets).toHaveBeenCalledWith({ keyword: '', limit: 40 });

    document.querySelector<HTMLElement>('.select-trigger')?.click();
    await nextTick();
    document.querySelector<HTMLElement>('.select-option')?.click();
    await nextTick();
    buttonByText('生成差异预览')?.click();
    await flush();
    expect(prepareAiResultNoteReuse).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      messageId: 'message-1',
      mode: 'append',
      targetNoteId: 'note-1',
      targetVersion: 'version-1',
    });
    expect(document.body.textContent).toContain('80 → 260 字');

    buttonByText('确认写入')?.click();
    expect(alert).toHaveBeenCalledTimes(1);
    alert.mock.calls[0][0].onOk();
    await flush();
    expect(applyAiChangeSet).toHaveBeenCalledWith('change-set-1', null);
    expect(document.body.textContent).toContain('执行回执已保存');
    expect(buttonByText('撤销本次写入')).toBeTruthy();

    buttonByText('撤销本次写入')?.click();
    expect(alert).toHaveBeenCalledTimes(2);
    alert.mock.calls[1][0].onOk();
    await flush();
    expect(undoAiChangeSet).toHaveBeenCalledWith('change-set-1');
    expect(document.body.textContent).toContain('本次写入已撤销');
  });

  // “选段应用”入口已按产品决策下线(保留 新建/追加/合并),本用例暂跳过。Codex 决定移除或恢复。
  it.skip('将服务端块清单展示为可访问多选，只提交勾选块 ID 并沿用 Change Set 预览执行', async () => {
    prepareAiResultNoteReuse.mockResolvedValueOnce({
      changeSetId: 'change-selection',
      preview: {
        mode: 'selection',
        target: {
          id: 'note-1',
          title: '目标笔记',
          type: 'markdown',
          resourceVersion: 'version-1',
        },
        beforeLength: 80,
        afterLength: 188,
        addedLength: 108,
        sourceCount: 2,
        evidenceCount: 3,
        uniqueBlockCount: null,
        duplicateBlockCount: null,
        selectedBlockCount: 1,
        totalBlockCount: 2,
        selectedCitationCount: 1,
        undoSupported: true,
        versionCheck: 'content_hash',
      },
    });

    mountActions();
    buttonByText('选段应用')?.click();
    await flush();
    expect(listAiResultReusableBlocks).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      messageId: 'message-1',
    });
    expect(document.body.textContent).toContain('已选 0/2 个片段');

    const blockCheckboxes = document.querySelectorAll<HTMLElement>('.ai-result-reuse__block[role="checkbox"]');
    expect(blockCheckboxes).toHaveLength(2);
    blockCheckboxes[0].click();
    await nextTick();
    expect(document.body.textContent).toContain('已选 1/2 个片段');

    document.querySelector<HTMLElement>('.select-trigger')?.click();
    await nextTick();
    document.querySelector<HTMLElement>('.select-option')?.click();
    await nextTick();
    buttonByText('生成差异预览')?.click();
    await flush();

    expect(prepareAiResultNoteReuse).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      messageId: 'message-1',
      mode: 'selection',
      selectedBlockIds: ['block-0-0123456789abcdef'],
      targetNoteId: 'note-1',
      targetVersion: 'version-1',
    });
    expect(JSON.stringify(prepareAiResultNoteReuse.mock.calls.at(-1)?.[0])).not.toContain('结论内容');
    expect(document.body.textContent).toContain('应用 1/2 个片段');

    buttonByText('确认写入')?.click();
    expect(alert.mock.calls.at(-1)?.[0].content).toContain('从已保存回答重建所选内容');
    alert.mock.calls.at(-1)?.[0].onOk();
    await flush();
    expect(applyAiChangeSet).toHaveBeenCalledWith('change-selection', null);
    expect(document.body.textContent).toContain('所选回答片段已应用');
  });
});
