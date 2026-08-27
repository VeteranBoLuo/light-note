import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from 'vue';
import type { CommunityChatPoll } from '@/api/communityChatApi';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${Object.values(params).join(':')}` : key),
  }),
}));
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: {
    props: ['visible', 'title'],
    template: '<section v-if="visible" class="modal-stub"><h2>{{ title }}</h2><slot /></section>',
  },
}));
vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({
  default: { props: ['disabled', 'loading'], template: '<button type="button" :disabled="disabled"><slot /></button>' },
}));
vi.mock('@/components/base/BasicComponents/BLoading.vue', () => ({
  default: { props: ['title'], template: '<span class="loading-stub">{{ title }}</span>' },
}));
vi.mock('@/components/base/BasicComponents/BSelect.vue', () => ({
  default: {
    props: ['value', 'options'],
    template: '<div class="select-stub">{{ options.map((item) => item.label).join("|") }}</div>',
  },
}));
vi.mock('@/components/growth/AvatarFramePreview.vue', () => ({
  default: {
    props: ['src', 'frameId'],
    template: '<span class="avatar-stub" :data-src="src" :data-frame="frameId" />',
  },
}));

const { default: ChatPollVotersModal } = await import('./ChatPollVotersModal.vue');

const poll: CommunityChatPoll = {
  endsAt: '2026-08-28T10:00:00.000Z',
  closedAt: null,
  closed: false,
  closeReason: null,
  resultsVisible: true,
  selectionMode: 'multiple',
  maxSelections: 2,
  selectedOptionPublicIds: [],
  selectedOptionPublicId: null,
  totalVoterCount: 3,
  canVote: true,
  canClose: true,
  options: [
    { publicId: 'option-a', label: '体验', voteCount: 2 },
    { publicId: 'option-b', label: '性能', voteCount: 1 },
  ],
};

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function mountModal(props: Record<string, unknown>) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(ChatPollVotersModal, {
    visible: true,
    selectedOptionPublicId: 'option-a',
    poll,
    ...props,
  });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

describe('ChatPollVotersModal', () => {
  it('按选项展示 Root 可见的公开成员身份，不渲染在线绿点或内部账号字段', () => {
    const host = mountModal({
      total: 2,
      items: [
        {
          userPublicId: '11111111-1111-4111-8111-111111111111',
          communityId: 'ln_8K2M7A',
          displayName: '薄荷',
          avatar: '',
          frameId: 'frame-mint',
        },
      ],
    });

    expect(host.textContent).toContain('communityChat.poll.voters.optionChoice:体验:2');
    expect(host.textContent).toContain('communityChat.poll.voters.optionChoice:性能:1');
    expect(host.textContent).toContain('薄荷');
    expect(host.textContent).toContain('@ln_8K2M7A');
    expect(host.textContent).not.toContain('11111111-1111-4111-8111-111111111111');
    expect(host.querySelector('.is-online, .online-dot, [data-online]')).toBeNull();
  });

  it('覆盖加载、错误和空名单状态', () => {
    let host = mountModal({ loading: true });
    expect(host.textContent).toContain('communityChat.poll.voters.loading');
    cleanup?.();
    cleanup = undefined;

    host = mountModal({ error: true });
    expect(host.textContent).toContain('communityChat.poll.voters.loadFailed');
    cleanup?.();
    cleanup = undefined;

    host = mountModal({ items: [], total: 0 });
    expect(host.textContent).toContain('communityChat.poll.voters.empty');
  });
});
