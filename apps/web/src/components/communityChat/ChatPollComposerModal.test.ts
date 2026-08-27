import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${Object.values(params).join(':')}` : key),
  }),
}));
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: {
    props: ['visible'],
    emits: ['update:visible'],
    template: '<div v-if="visible" class="modal-stub"><slot /></div>',
  },
}));
vi.mock('@/components/base/BasicComponents/BDateTimePicker.vue', () => ({
  default: {
    props: ['value'],
    emits: ['update:value'],
    template: '<div class="date-picker-stub">{{ value }}</div>',
  },
}));
vi.mock('@/components/base/BasicComponents/BInput.vue', () => ({
  default: {
    props: ['value', 'type', 'disabled'],
    emits: ['update:value'],
    template:
      '<textarea v-if="type === \'textarea\'" :value="value" :disabled="disabled" @input="$emit(\'update:value\', $event.target.value)" />' +
      '<input v-else :value="value" :disabled="disabled" @input="$emit(\'update:value\', $event.target.value)" />',
  },
}));
vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({
  default: {
    props: ['disabled', 'loading'],
    template: '<button type="button" :disabled="disabled"><slot /></button>',
  },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { template: '<span class="svg-icon-stub" />' },
}));

const { default: ChatPollComposerModal } = await import('./ChatPollComposerModal.vue');

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.useRealTimers();
});

function setInput(input: HTMLInputElement | HTMLTextAreaElement | null, value: string) {
  if (!input) throw new Error('测试输入框不存在');
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function mountComposer() {
  const visible = ref(false);
  const payloads: Array<{ question: string; options: string[]; endsAt: string }> = [];
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup() {
      return () =>
        h(ChatPollComposerModal, {
          visible: visible.value,
          'onUpdate:visible': (nextVisible: boolean) => {
            visible.value = nextVisible;
          },
          onSubmit: (payload: { question: string; options: string[]; endsAt: string }) => payloads.push(payload),
        });
    },
  });
  app.mount(host);
  visible.value = true;
  await nextTick();
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, payloads };
}

describe('ChatPollComposerModal', () => {
  it('每次打开重置为两个选项和合法默认截止时间，并提交带时区的 ISO 时间', async () => {
    const { host, payloads } = await mountComposer();
    const options = host.querySelectorAll<HTMLInputElement>('.chat-poll-composer__options input');
    expect(options).toHaveLength(2);
    expect(host.querySelector('.date-picker-stub')?.textContent).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);

    setInput(host.querySelector('textarea'), '下一项优先做什么？');
    setInput(options[0] || null, '体验');
    setInput(options[1] || null, '性能');
    await nextTick();
    host.querySelectorAll<HTMLButtonElement>('footer button')[1]?.click();
    await nextTick();

    expect(payloads[0]).toMatchObject({ question: '下一项优先做什么？', options: ['体验', '性能'] });
    expect(payloads[0]?.endsAt).toMatch(/Z$/);
  });

  it('Unicode 等价重复选项会显示错误，不会发出提交', async () => {
    const { host, payloads } = await mountComposer();
    setInput(host.querySelector('textarea'), '选择一个');
    const options = host.querySelectorAll<HTMLInputElement>('.chat-poll-composer__options input');
    setInput(options[0] || null, 'A');
    setInput(options[1] || null, 'ａ');
    await nextTick();
    host.querySelectorAll<HTMLButtonElement>('footer button')[1]?.click();
    await nextTick();

    expect(host.querySelector('.chat-poll-composer__error')?.textContent).toContain(
      'communityChat.poll.validation.optionDuplicate',
    );
    expect(payloads).toHaveLength(0);
  });

  it('支持添加到第三个选项，且至少保留两个选项', async () => {
    const { host } = await mountComposer();
    host.querySelector<HTMLButtonElement>('.chat-poll-composer__add')?.click();
    await nextTick();
    expect(host.querySelectorAll('.chat-poll-composer__options input')).toHaveLength(3);
    host.querySelectorAll<HTMLButtonElement>('.chat-poll-composer__remove')[2]?.click();
    await nextTick();
    expect(host.querySelectorAll('.chat-poll-composer__options input')).toHaveLength(2);
    expect(
      Array.from(host.querySelectorAll<HTMLButtonElement>('.chat-poll-composer__remove')).every(
        (button) => button.disabled,
      ),
    ).toBe(true);
  });

  it('弹窗长时间停留后提交会按最新时刻重新校验截止时间', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-26T10:00:00.000Z'));
    const { host, payloads } = await mountComposer();
    setInput(host.querySelector('textarea'), '仍然有效吗？');
    const options = host.querySelectorAll<HTMLInputElement>('.chat-poll-composer__options input');
    setInput(options[0] || null, '甲');
    setInput(options[1] || null, '乙');
    await nextTick();

    vi.setSystemTime(new Date('2026-08-27T11:00:00.000Z'));
    host.querySelectorAll<HTMLButtonElement>('footer button')[1]?.click();
    await nextTick();

    expect(host.querySelector('.chat-poll-composer__error')?.textContent).toContain(
      'communityChat.poll.validation.deadlineTooSoon',
    );
    expect(payloads).toHaveLength(0);
  });
});
