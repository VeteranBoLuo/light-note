import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, ref } from 'vue';
import type { CommunityChatPoll } from '@/api/communityChatApi';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    locale: ref('zh-CN'),
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${Object.values(params).join(':')}` : key),
  }),
}));
vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({
  default: {
    props: ['disabled', 'loading'],
    template: '<button type="button" :disabled="disabled"><slot /></button>',
  },
}));
vi.mock('@/components/base/BasicComponents/BTooltip.vue', () => ({
  default: { template: '<div><slot /></div>' },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { template: '<span class="svg-icon-stub" />' },
}));

const { default: ChatPollCard } = await import('./ChatPollCard.vue');

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function poll(overrides: Partial<CommunityChatPoll> = {}): CommunityChatPoll {
  return {
    endsAt: '2026-08-27T10:00:00.000Z',
    closedAt: null,
    closed: false,
    closeReason: null,
    resultsVisible: false,
    selectionMode: 'single',
    maxSelections: 1,
    selectedOptionPublicIds: [],
    selectedOptionPublicId: null,
    canVote: true,
    canClose: false,
    options: [
      { publicId: 'option-a', label: '体验' },
      { publicId: 'option-b', label: '性能' },
    ],
    ...overrides,
  };
}

function mountPoll(props: {
  question: string;
  poll: CommunityChatPoll;
  now: number;
  participationPaused?: boolean;
  canViewVoters?: boolean;
}) {
  const votes: string[][] = [];
  let closeCount = 0;
  let viewVotersCount = 0;
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(ChatPollCard, {
    ...props,
    onVote: (optionPublicIds: string[]) => votes.push(optionPublicIds),
    onClose: () => {
      closeCount += 1;
    },
    onViewVoters: () => {
      viewVotersCount += 1;
    },
  });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return {
    host,
    votes,
    get closeCount() {
      return closeCount;
    },
    get viewVotersCount() {
      return viewVotersCount;
    },
  };
}

describe('ChatPollCard', () => {
  beforeEach(() => vi.useRealTimers());

  it('进行中的未投票成员看不到聚合票数，并可提交首次选择', async () => {
    const mounted = mountPoll({
      question: '下一项优先做什么？',
      poll: poll(),
      now: Date.parse('2026-08-26T10:00:00.000Z'),
    });

    expect(mounted.host.textContent).toContain('下一项优先做什么？');
    expect(mounted.host.querySelectorAll('.chat-poll-card__count')).toHaveLength(0);
    const options = mounted.host.querySelectorAll<HTMLButtonElement>('.chat-poll-card__option');
    expect(options[0]?.classList.contains('is-selected')).toBe(false);
    expect(mounted.host.textContent).toContain('communityChat.poll.voteHint');
    options[1]?.click();
    await nextTick();
    expect(mounted.votes).toEqual([['option-b']]);
  });

  it('成员投票后展示各选项人数和比例，但不出现 Root 名单入口', () => {
    const mounted = mountPoll({
      question: '下一项优先做什么？',
      poll: poll({
        resultsVisible: true,
        selectedOptionPublicIds: ['option-a'],
        selectedOptionPublicId: 'option-a',
        totalVoterCount: 3,
        options: [
          { publicId: 'option-a', label: '体验', voteCount: 2 },
          { publicId: 'option-b', label: '性能', voteCount: 1 },
        ],
      }),
      now: Date.parse('2026-08-26T10:00:00.000Z'),
    });

    expect(mounted.host.textContent).toContain('communityChat.poll.optionResult:67:2');
    expect(mounted.host.textContent).toContain('communityChat.poll.optionResult:33:1');
    expect(mounted.host.textContent).not.toContain('communityChat.poll.voters.action');
  });

  it('多选先在本地勾选，到达发布上限后禁用未选项，并一次提交完整选择集', async () => {
    const mounted = mountPoll({
      question: '可同时推进哪些方向？',
      poll: poll({
        selectionMode: 'multiple',
        maxSelections: 2,
        options: [
          { publicId: 'option-a', label: '体验' },
          { publicId: 'option-b', label: '性能' },
          { publicId: 'option-c', label: '可靠性' },
        ],
      }),
      now: Date.parse('2026-08-26T10:00:00.000Z'),
    });

    const options = mounted.host.querySelectorAll<HTMLButtonElement>('.chat-poll-card__option');
    options[0]?.click();
    options[1]?.click();
    await nextTick();

    expect(mounted.votes).toHaveLength(0);
    expect(options[0]?.classList.contains('is-selected')).toBe(true);
    expect(options[1]?.classList.contains('is-selected')).toBe(true);
    expect(options[2]?.disabled).toBe(true);
    expect(mounted.host.textContent).toContain('communityChat.poll.multipleSelectionCount:2:2');

    const submitButton = Array.from(mounted.host.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      button.textContent?.includes('communityChat.poll.submitSelections'),
    );
    submitButton?.click();
    await nextTick();
    expect(mounted.votes).toEqual([['option-a', 'option-b']]);
  });

  it('多选结果以去重参与人数计算比例，选项比例允许合计超过 100%', () => {
    const mounted = mountPoll({
      question: '选择方向',
      poll: poll({
        selectionMode: 'multiple',
        maxSelections: 2,
        closed: true,
        closeReason: 'deadline',
        resultsVisible: true,
        totalVoterCount: 2,
        canVote: false,
        options: [
          { publicId: 'option-a', label: '甲', voteCount: 2 },
          { publicId: 'option-b', label: '乙', voteCount: 1 },
        ],
      }),
      now: Date.parse('2026-08-28T10:00:00.000Z'),
    });

    expect(mounted.host.textContent).toContain('communityChat.poll.optionResult:100:2');
    expect(mounted.host.textContent).toContain('communityChat.poll.optionResult:50:1');
    expect(mounted.host.textContent).toContain('communityChat.poll.multipleResultsHint');
  });

  it('结束后展示汇总、百分比和零票边界，并禁止继续选择', async () => {
    const mounted = mountPoll({
      question: '选择方向',
      poll: poll({
        closed: true,
        closeReason: 'deadline',
        resultsVisible: true,
        totalVoterCount: 4,
        canVote: false,
        options: [
          { publicId: 'option-a', label: '甲', voteCount: 3 },
          { publicId: 'option-b', label: '乙', voteCount: 1 },
          { publicId: 'option-c', label: '丙', voteCount: 0 },
        ],
      }),
      now: Date.parse('2026-08-28T10:00:00.000Z'),
    });

    expect(mounted.host.textContent).toContain('communityChat.poll.optionResult:75:3');
    expect(mounted.host.textContent).toContain('communityChat.poll.optionResult:0:0');
    mounted.host.querySelector<HTMLButtonElement>('.chat-poll-card__option')?.click();
    await nextTick();
    expect(mounted.votes).toHaveLength(0);
  });

  it('Root 在截止前获得明确的结束入口', async () => {
    const mounted = mountPoll({
      question: '是否发布？',
      poll: poll({ canClose: true, resultsVisible: true, totalVoterCount: 0 }),
      now: Date.parse('2026-08-26T10:00:00.000Z'),
      canViewVoters: true,
    });

    const closeButton = Array.from(mounted.host.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      button.textContent?.includes('communityChat.poll.closeAction'),
    );
    expect(closeButton).toBeTruthy();
    closeButton?.click();
    await nextTick();
    expect(mounted.closeCount).toBe(1);
    const votersButton = Array.from(mounted.host.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      button.textContent?.includes('communityChat.poll.voters.action'),
    );
    votersButton?.click();
    await nextTick();
    expect(mounted.viewVotersCount).toBe(1);
  });

  it('紧急只读时明确暂停参与，但 Root 的结束入口仍然可用', async () => {
    const mounted = mountPoll({
      question: '是否继续？',
      poll: poll({ canClose: true, resultsVisible: true, totalVoterCount: 2 }),
      now: Date.parse('2026-08-26T10:00:00.000Z'),
      participationPaused: true,
    });

    expect(mounted.host.textContent).toContain('communityChat.poll.paused');
    expect(mounted.host.textContent).toContain('communityChat.poll.participationPaused');
    expect(
      Array.from(mounted.host.querySelectorAll<HTMLButtonElement>('.chat-poll-card__option')).every(
        (button) => button.disabled,
      ),
    ).toBe(true);
    const closeButton = Array.from(mounted.host.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      button.textContent?.includes('communityChat.poll.closeAction'),
    );
    expect(closeButton?.disabled).toBe(false);
  });
});
