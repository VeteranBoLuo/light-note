import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import type { AiSkillResponse } from '@lightnote/shared/ai-skill-protocol';
import type { AiSkillPanelAction } from './types';

const executeAiSkill = vi.hoisted(() => vi.fn());

vi.mock('@/api/aiSkillApi', () => ({
  createAiSkillRequest: (value: Record<string, unknown>) => value,
  executeAiSkill,
}));

vi.mock('@/api/aiTelemetry', () => ({
  aiResourceCountBucket: () => '1',
  recordAiProductEvent: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/composables/useAiSkillAvailability', () => ({
  useAiSkillAvailability: () => ({ available: { value: true }, loading: { value: false } }),
}));

vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIcon', render: () => null },
}));

const { default: AiSkillPanel } = await import('./AiSkillPanel.vue');

let cleanup: (() => void) | undefined;

function completedResponse(skillId: string): AiSkillResponse {
  return {
    protocolVersion: 1,
    requestId: `request-${skillId}`,
    skillId,
    skillVersion: 1,
    status: 'completed',
    threadId: null,
    scopeDigest: null,
    result: { kind: 'grounded_markdown', content: '分析完成' },
    sources: [{ sourceId: 'bookmark:1', title: '示例书签' }],
    coverage: null,
    availableActions: [],
    receipt: null,
    error: null,
  };
}

async function flushExecution() {
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
}

function mountPromptPanel(overrides: Record<string, unknown> = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(AiSkillPanel, {
        title: '问问轻笺助手',
        skillId: 'help.answer',
        surface: 'help.center',
        showPrompt: true,
        submitLabel: '提问',
        ...overrides,
      }),
  });
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: {
        'zh-CN': {
          aiSkills: {
            processing: '处理中',
            retry: '重试',
            unavailableTitle: '暂不可用',
            unavailableDescription: '请稍后重试',
            errorTitle: '执行失败',
            quotaErrorTitle: '额度不足',
            retryLater: '请稍后重试',
            send: '发送',
            stop: '停止',
            promptPlaceholder: '请输入',
            sources: '来源 {count}',
            sourceFallback: '来源 {index}',
          },
        },
      },
    }),
  );
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

async function enterPrompt(host: HTMLElement, value: string) {
  const textarea = host.querySelector('textarea') as HTMLTextAreaElement;
  textarea.value = value;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
  return textarea;
}

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

beforeEach(() => {
  executeAiSkill.mockReset();
  executeAiSkill.mockImplementation((request) => Promise.resolve(completedResponse(String(request.skillId))));
});

describe('AiSkillPanel 自动执行预设动作', () => {
  it('只在显式指定动作时自动执行，并在资源范围变化后以新材料重新执行', async () => {
    const resourceRefs = ref([{ type: 'bookmark' as const, id: '1' }]);
    const actions = ref<AiSkillPanelAction[]>([
      {
        id: 'analyze',
        label: '重新分析',
        skillId: 'search.summarize_selected',
        input: { instruction: '请分析书签《示例书签》，概括核心内容和关键信息。' },
      },
    ]);
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({
      render: () =>
        h(AiSkillPanel, {
          title: '资源分析',
          skillId: 'search.summarize_selected',
          surface: 'search',
          resourceRefs: resourceRefs.value,
          scopeLabel: `书签 · ${resourceRefs.value[0].id}`,
          actions: actions.value,
          showPrompt: false,
          autoRunActionId: 'analyze',
        }),
    });
    app.use(
      createI18n({
        legacy: false,
        locale: 'zh-CN',
        messages: {
          'zh-CN': {
            aiSkills: {
              processing: '处理中',
              retry: '重试',
              unavailableTitle: '暂不可用',
              unavailableDescription: '请稍后重试',
              errorTitle: '执行失败',
              quotaErrorTitle: '额度不足',
              retryLater: '请稍后重试',
              send: '发送',
              promptPlaceholder: '请输入',
              sources: '来源 {count}',
              sourceFallback: '来源 {index}',
            },
          },
        },
      }),
    );
    app.mount(host);
    cleanup = () => {
      app.unmount();
      host.remove();
    };

    await flushExecution();
    expect(executeAiSkill).toHaveBeenCalledTimes(1);
    expect(executeAiSkill.mock.calls[0][0]).toMatchObject({
      skillId: 'search.summarize_selected',
      input: { instruction: '请分析书签《示例书签》，概括核心内容和关键信息。' },
      resourceRefs: [{ type: 'bookmark', id: '1' }],
    });
    expect(host.querySelector('textarea')).toBeNull();
    expect(host.textContent).not.toContain('重新分析');

    resourceRefs.value = [{ type: 'bookmark', id: '2' }];
    actions.value = [
      {
        id: 'analyze',
        label: '重新分析',
        skillId: 'search.summarize_selected',
        input: { instruction: '请分析书签《另一个书签》，概括核心内容和关键信息。' },
      },
    ];
    await nextTick();
    await flushExecution();

    expect(executeAiSkill).toHaveBeenCalledTimes(2);
    expect(executeAiSkill.mock.calls[1][0]).toMatchObject({
      input: { instruction: '请分析书签《另一个书签》，概括核心内容和关键信息。' },
      resourceRefs: [{ type: 'bookmark', id: '2' }],
    });
  });

  it('自动动作失败后只显示重试，不恢复成任务选择按钮', async () => {
    executeAiSkill.mockRejectedValueOnce(Object.assign(new Error('网页暂时无法读取'), { code: 'READ_FAILED' }));
    executeAiSkill.mockResolvedValueOnce(completedResponse('bookmark.summarize_page'));
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({
      render: () =>
        h(AiSkillPanel, {
          title: '书签内容分析',
          skillId: 'bookmark.summarize_page',
          surface: 'bookmark_manage',
          resourceRefs: [{ type: 'bookmark', id: '1' }],
          actions: [
            {
              id: 'summarize',
              label: '总结网页',
              input: { instruction: '总结当前网页' },
            },
          ],
          autoRunActionId: 'summarize',
        }),
    });
    app.use(
      createI18n({
        legacy: false,
        locale: 'zh-CN',
        messages: {
          'zh-CN': {
            aiSkills: {
              processing: '处理中',
              retry: '重试',
              unavailableTitle: '暂不可用',
              unavailableDescription: '请稍后重试',
              errorTitle: '执行失败',
              quotaErrorTitle: '额度不足',
              retryLater: '请稍后重试',
              send: '发送',
              promptPlaceholder: '请输入',
              sources: '来源 {count}',
              sourceFallback: '来源 {index}',
            },
          },
        },
      }),
    );
    app.mount(host);
    cleanup = () => {
      app.unmount();
      host.remove();
    };

    await flushExecution();
    expect(host.textContent).toContain('网页暂时无法读取');
    expect(host.textContent).not.toContain('总结网页');
    const retry = Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('重试'));
    expect(retry).toBeTruthy();
    retry?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushExecution();
    expect(executeAiSkill).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain('分析完成');
  });

  it('展示服务端返回的精确覆盖统计，不把一个标签选择器误显示成一项材料', async () => {
    executeAiSkill.mockResolvedValueOnce({
      ...completedResponse('tag.analyze'),
      coverage: {
        complete: false,
        warnings: [],
        requestedResources: 46,
        analyzedResources: 43,
        unreadableResources: 3,
        metadataOnlyResources: 5,
        truncatedResources: 2,
      },
    });
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({
      render: () =>
        h(AiSkillPanel, {
          title: '标签分析',
          skillId: 'tag.analyze',
          surface: 'tag_detail',
          resourceRefs: [{ type: 'tag', id: 'tag-1' }],
          scopeResourceCount: 46,
          scopeLabel: '完整分析当前标签下的 46 项资料',
          actions: [{ id: 'analyze', label: '分析', input: {} }],
          autoRunActionId: 'analyze',
        }),
    });
    app.use(
      createI18n({
        legacy: false,
        locale: 'zh-CN',
        messages: {
          'zh-CN': {
            aiSkills: {
              processing: '处理中',
              retry: '重试',
              unavailableTitle: '暂不可用',
              unavailableDescription: '请稍后重试',
              errorTitle: '执行失败',
              quotaErrorTitle: '额度不足',
              retryLater: '请稍后重试',
              send: '发送',
              promptPlaceholder: '请输入',
              sources: '来源 {count}',
              sourceFallback: '来源 {index}',
              coverageSummary: '已纳入分析 {analyzed}/{total} 项资料',
              coverageUnreadable: '{count} 项暂无可读正文',
              coverageMetadataOnly: '{count} 项仅使用元数据',
              coverageTruncated: '{count} 项正文按单项预算截取',
            },
          },
        },
      }),
    );
    app.mount(host);
    cleanup = () => {
      app.unmount();
      host.remove();
    };

    await flushExecution();
    expect(host.textContent).toContain('完整分析当前标签下的 46 项资料');
    expect(host.textContent).toContain('已纳入分析 43/46 项资料');
    expect(host.textContent).toContain('3 项暂无可读正文');
    expect(host.textContent).toContain('5 项仅使用元数据');
    expect(host.textContent).toContain('2 项正文按单项预算截取');
  });
});

describe('AiSkillPanel 手动提问草稿', () => {
  it('显式启用后仅在回答成功时清空输入，并可同时隐藏引用角标与来源条', async () => {
    const response = completedResponse('help.answer');
    response.result = { kind: 'grounded_markdown', content: '满级每日额度为 80 万 [1]' };
    executeAiSkill.mockResolvedValueOnce(response);
    const host = mountPromptPanel({ clearPromptOnSuccess: true, showGrounding: false });
    const textarea = await enterPrompt(host, '不同等级的权益是什么？');

    const submit = Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('提问'));
    submit?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(textarea.value).toBe('不同等级的权益是什么？');
    await flushExecution();

    expect(textarea.value).toBe('');
    expect(host.textContent).toContain('满级每日额度为 80 万');
    expect(host.textContent).not.toContain('[1]');
    expect(host.textContent).not.toContain('来源 1');
  });

  it('回答失败时保留原问题，方便修改或重试', async () => {
    executeAiSkill.mockRejectedValueOnce(Object.assign(new Error('暂时无法回答'), { code: 'HELP_FAILED' }));
    const host = mountPromptPanel({ clearPromptOnSuccess: true });
    const textarea = await enterPrompt(host, '怎么导出笔记？');

    const submit = Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('提问'));
    submit?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushExecution();

    expect(textarea.value).toBe('怎么导出笔记？');
    expect(host.textContent).toContain('暂时无法回答');
  });
});
