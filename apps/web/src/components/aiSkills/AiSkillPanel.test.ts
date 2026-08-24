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
});
