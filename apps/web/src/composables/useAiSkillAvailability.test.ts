import { createApp, h, type App } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAiSkillsConfig = vi.fn();
vi.mock('@/api/aiSkillApi', () => ({ getAiSkillsConfig }));
const { resetAiSkillAvailabilityCacheForTest, useAiSkillAvailability } = await import('./useAiSkillAvailability');

function mountAvailability(skillId: string) {
  let feature!: ReturnType<typeof useAiSkillAvailability>;
  const host = document.createElement('div');
  const app: App = createApp({
    setup() {
      feature = useAiSkillAvailability(() => skillId);
      return () => h('span');
    },
  });
  app.mount(host);
  return { feature, unmount: () => app.unmount() };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('useAiSkillAvailability', () => {
  beforeEach(() => {
    resetAiSkillAvailabilityCacheForTest();
    getAiSkillsConfig.mockReset();
  });

  it('按服务端唯一配置关闭域能力且复用同一配置请求', async () => {
    getAiSkillsConfig.mockResolvedValue({
      protocolVersion: 1,
      kernelEnabled: true,
      skills: { note: false, todo: true },
      archive: { readonly: true },
      availableSkills: [{ id: 'todo.breakdown', version: 1, domain: 'todo', effect: 'preview' }],
    });
    const note = mountAvailability('note.batch_summarize');
    const todo = mountAvailability('todo.breakdown');
    await settle();
    expect(note.feature.loading.value).toBe(false);
    expect(note.feature.available.value).toBe(false);
    expect(todo.feature.available.value).toBe(true);
    expect(getAiSkillsConfig).toHaveBeenCalledTimes(1);
    note.unmount();
    todo.unmount();
  });

  it('配置查询失败时前端失败开放，后端仍保留最终门禁', async () => {
    getAiSkillsConfig.mockRejectedValue(new Error('offline'));
    const wrapper = mountAvailability('note.batch_summarize');
    await settle();
    expect(wrapper.feature.loading.value).toBe(false);
    expect(wrapper.feature.available.value).toBe(true);
    wrapper.unmount();
  });

  it('旧缓存过期后配置查询失败，不会让已下线的旧开关继续阻断基础页面', async () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1_000);
    getAiSkillsConfig.mockResolvedValueOnce({
      protocolVersion: 1,
      kernelEnabled: true,
      skills: { note: false },
      archive: { readonly: true },
      availableSkills: [],
    });
    const first = mountAvailability('note.batch_summarize');
    await settle();
    expect(first.feature.available.value).toBe(false);
    first.unmount();

    now.mockReturnValue(61_001);
    getAiSkillsConfig.mockRejectedValueOnce(new Error('offline'));
    const second = mountAvailability('note.batch_summarize');
    await settle();
    expect(second.feature.loading.value).toBe(false);
    expect(second.feature.available.value).toBe(true);
    second.unmount();
    now.mockRestore();
  });
});
