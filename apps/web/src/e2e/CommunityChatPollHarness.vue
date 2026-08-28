<template>
  <main class="community-chat-poll-harness">
    <header>
      <span>Community chat / visual QA</span>
      <h1>聊天室单选与多选投票状态矩阵</h1>
      <p>本地隔离视觉夹具，只挂载真实投票组件，不请求接口，也不会写入线上聊天室。</p>
    </header>

    <section v-if="view === 'cards'" class="community-chat-poll-harness__grid">
      <article>
        <div class="community-chat-poll-harness__label">
          <strong>成员 · 尚未投票</strong>
          <span>进行中只显示选项，不提前泄露票数和参与人数。</span>
        </div>
        <ChatPollCard question="下一阶段可以同时推进哪些方向？" :poll="memberMultiplePoll" :now="now" />
      </article>

      <article>
        <div class="community-chat-poll-harness__label">
          <strong>成员 · 投票后结果</strong>
          <span>只显示各选项人数与比例，不提供成员身份入口。</span>
        </div>
        <ChatPollCard question="下一阶段可以同时推进哪些方向？" :poll="memberVotedPoll" :now="now" />
      </article>

      <article>
        <div class="community-chat-poll-harness__label">
          <strong>Root · 多选实时结果</strong>
          <span>已保存选择、实时票数、投票明细与提前结束。</span>
        </div>
        <ChatPollCard question="下一阶段可以同时推进哪些方向？" :poll="rootMultiplePoll" :now="now" can-view-voters />
      </article>

      <article>
        <div class="community-chat-poll-harness__label">
          <strong>成员 · 已结束</strong>
          <span>按去重参与人数计算，多选比例合计可超过 100%。</span>
        </div>
        <ChatPollCard question="本周最有帮助的改进有哪些？" :poll="closedMultiplePoll" :now="now" />
      </article>

      <article>
        <div class="community-chat-poll-harness__label">
          <strong>暂停与加载</strong>
          <span>规则暂停和提交中都保留实色边框、图标与明确文案。</span>
        </div>
        <div class="community-chat-poll-harness__stack">
          <ChatPollCard question="暂停期间不可继续参与" :poll="pausedSinglePoll" :now="now" participation-paused />
          <ChatPollCard
            question="正在提交所选项目"
            :poll="loadingMultiplePoll"
            :now="now"
            :busy-option-public-ids="['option-a', 'option-b']"
          />
        </div>
      </article>
    </section>

    <section v-else-if="view === 'composer'" class="community-chat-poll-harness__composer-note">
      <strong>{{ submitting ? '发布提交中' : 'Root 发布弹窗' }}</strong>
      <span>切换单选/多选、设置上限、增删选项并检查校验错误。</span>
    </section>

    <section v-else-if="view === 'badge'" class="community-chat-poll-harness__badge">
      <strong>Root · 已读人数入口</strong>
      <span>徽标直接表达数量和点击能力，不再重复显示 Tooltip。</span>
      <ChatReadReceiptBadge :enabled="readerState !== 'paused'" :read-count="3" @open="badgeOpenCount += 1" />
      <small>打开次数：{{ badgeOpenCount }}</small>
    </section>

    <section v-else-if="view === 'recall'" class="community-chat-poll-harness__recall">
      <div class="community-chat-poll-harness__label">
        <strong>撤回消息 · 紧凑系统行</strong>
        <span>本人、他人和管理员代撤回不再占用头像与空白气泡空间。</span>
      </div>
      <article><ChatRecalledMessageLine label="你撤回了一条消息" :action-items="recallActions" /></article>
      <article><ChatRecalledMessageLine label="“薄荷”撤回了一条消息" /></article>
      <article>
        <ChatRecalledMessageLine label="管理员撤回了“薄荷”的一条消息" can-view-original />
      </article>
    </section>

    <ChatPollComposerModal
      v-if="view === 'composer'"
      v-model:visible="composerVisible"
      :submitting="submitting"
      @submit="submittedPayload = $event"
    />
    <ChatReadReceiptReadersModal
      v-if="view === 'readers'"
      v-model:visible="readersVisible"
      :items="visibleReaders"
      :total="readerTotal"
      :enabled="readerState !== 'paused'"
      :loading="readerState === 'loading'"
      :error="readerState === 'error'"
      :has-more="readerState === 'many'"
    />
    <ChatPollVotersModal
      v-if="view === 'voters'"
      v-model:visible="votersVisible"
      v-model:selected-option-public-id="selectedVoterOptionPublicId"
      :poll="rootMultiplePoll"
      :items="visibleVoters"
      :total="voterTotal"
      :loading="readerState === 'loading'"
      :error="readerState === 'error'"
      :has-more="readerState === 'many'"
    />
    <pre v-if="submittedPayload" aria-label="最近一次投票提交参数">{{ submittedPayload }}</pre>
  </main>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import type {
    CommunityChatPoll,
    CommunityChatPollVoter,
    CommunityChatReadReceiptReader,
  } from '@/api/communityChatApi';
  import type { BActionMenuItem } from '@/components/base/BasicComponents/actionMenu';
  import ChatPollCard from '@/components/communityChat/ChatPollCard.vue';
  import ChatPollComposerModal from '@/components/communityChat/ChatPollComposerModal.vue';
  import ChatPollVotersModal from '@/components/communityChat/ChatPollVotersModal.vue';
  import ChatReadReceiptBadge from '@/components/communityChat/ChatReadReceiptBadge.vue';
  import ChatReadReceiptReadersModal from '@/components/communityChat/ChatReadReceiptReadersModal.vue';
  import ChatRecalledMessageLine from '@/components/communityChat/ChatRecalledMessageLine.vue';
  import icon from '@/config/icon';

  const props = withDefaults(
    defineProps<{
      view?: 'cards' | 'composer' | 'readers' | 'voters' | 'badge' | 'recall';
      submitting?: boolean;
      readerState?: 'populated' | 'loading' | 'error' | 'empty' | 'paused' | 'many';
    }>(),
    {
      view: 'cards',
      submitting: false,
      readerState: 'populated',
    },
  );

  const now = Date.parse('2026-08-27T10:00:00.000Z');
  const composerVisible = ref(true);
  const readersVisible = ref(true);
  const votersVisible = ref(true);
  const selectedVoterOptionPublicId = ref('option-a');
  const submittedPayload = ref<unknown>(null);
  const badgeOpenCount = ref(0);

  const readers: CommunityChatReadReceiptReader[] = Array.from({ length: 28 }, (_, index) => ({
    userPublicId: `11111111-1111-4111-8111-${String(index + 1).padStart(12, '0')}`,
    communityId: `ln_${['8K2M7A', '7J4N9P', '6Q3W8R', '5T2Y7U'][index % 4]}${index > 3 ? index : ''}`,
    displayName: ['薄荷', 'AI 指挥官', '山风', '纸飞机', '一段很长但需要稳定省略的成员昵称'][index % 5],
    avatar: '',
    frameId: index % 3 === 0 ? 'frame_mint' : null,
    firstSeenAt: new Date(Date.parse('2026-08-27T10:01:02.000Z') + index * 61_000).toISOString(),
  }));
  const visibleReaders = computed(() => {
    if (['loading', 'error', 'empty'].includes(props.readerState)) return [];
    return props.readerState === 'many' ? readers : readers.slice(0, 5);
  });
  const readerTotal = computed(() => {
    if (props.readerState === 'empty' || props.readerState === 'loading') return 0;
    if (props.readerState === 'error') return 6;
    return props.readerState === 'many' ? 46 : visibleReaders.value.length;
  });

  const voters: CommunityChatPollVoter[] = readers.map(({ firstSeenAt: _firstSeenAt, ...reader }) => reader);
  const visibleVoters = computed(() => {
    if (['loading', 'error', 'empty'].includes(props.readerState)) return [];
    return props.readerState === 'many' ? voters : voters.slice(0, 5);
  });
  const voterTotal = computed(() => {
    if (props.readerState === 'empty' || props.readerState === 'loading') return 0;
    if (props.readerState === 'error') return 6;
    return props.readerState === 'many' ? 46 : visibleVoters.value.length;
  });
  const recallActions: BActionMenuItem[] = [
    { key: 'delete', label: '从我的会话删除', icon: icon.noteDetail.deleteLine, danger: true },
  ];

  const options = [
    {
      publicId: 'option-a',
      label: '标签：让每个标签直接聚合相关内容，更方便查看同一标签下的书签、笔记、文件和待办',
      voteCount: 8,
    },
    { publicId: 'option-b', label: '同步性能', voteCount: 6 },
    { publicId: 'option-c', label: '数据可靠性', voteCount: 3 },
  ];

  const memberMultiplePoll: CommunityChatPoll = {
    endsAt: '2026-08-29T12:00:00.000Z',
    closedAt: null,
    closed: false,
    closeReason: null,
    resultsVisible: false,
    selectionMode: 'multiple',
    maxSelections: 2,
    selectedOptionPublicIds: [],
    selectedOptionPublicId: null,
    canVote: true,
    canClose: false,
    options: options.map(({ publicId, label }) => ({ publicId, label })),
  };

  const rootMultiplePoll: CommunityChatPoll = {
    ...memberMultiplePoll,
    resultsVisible: true,
    selectedOptionPublicIds: ['option-a', 'option-b'],
    selectedOptionPublicId: 'option-a',
    totalVoterCount: 10,
    canClose: true,
    options,
  };

  const memberVotedPoll: CommunityChatPoll = {
    ...rootMultiplePoll,
    canClose: false,
  };

  const closedMultiplePoll: CommunityChatPoll = {
    ...rootMultiplePoll,
    endsAt: '2026-08-26T12:00:00.000Z',
    closed: true,
    closeReason: 'deadline',
    canVote: false,
    canClose: false,
    selectedOptionPublicIds: ['option-a'],
    selectedOptionPublicId: 'option-a',
  };

  const pausedSinglePoll: CommunityChatPoll = {
    ...memberMultiplePoll,
    selectionMode: 'single',
    maxSelections: 1,
    selectedOptionPublicIds: ['option-a'],
    selectedOptionPublicId: 'option-a',
  };

  const loadingMultiplePoll: CommunityChatPoll = {
    ...memberMultiplePoll,
    selectedOptionPublicIds: ['option-a', 'option-b'],
    selectedOptionPublicId: 'option-a',
  };
</script>

<style scoped lang="less">
  :global(body) {
    display: block;
    overflow: auto;
  }

  :global(#app) {
    width: 100%;
    min-height: 100%;
  }

  .community-chat-poll-harness {
    min-height: 100vh;
    box-sizing: border-box;
    padding: 28px;
    color: var(--text-color);
    background: var(--surface-page-bg);
  }

  .community-chat-poll-harness > header,
  .community-chat-poll-harness__composer-note {
    max-width: 940px;
    margin: 0 auto 22px;
  }

  .community-chat-poll-harness > header span,
  .community-chat-poll-harness > header p,
  .community-chat-poll-harness__label span,
  .community-chat-poll-harness__composer-note span {
    color: var(--desc-color);
  }

  .community-chat-poll-harness > header h1 {
    margin: 6px 0;
    font-size: 24px;
  }

  .community-chat-poll-harness > header p {
    margin: 0;
    font-size: 13px;
  }

  .community-chat-poll-harness__grid {
    max-width: 940px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px;
  }

  .community-chat-poll-harness__badge {
    max-width: 940px;
    margin: 0 auto;
    padding: 20px;
    display: grid;
    justify-items: start;
    gap: 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 16px;
    background: var(--surface-card-bg);
  }

  .community-chat-poll-harness__recall {
    max-width: 940px;
    margin: 0 auto;
    padding: 20px;
    display: grid;
    gap: 16px;
    border: 1px solid var(--surface-border-color);
    border-radius: 16px;
    background: var(--surface-card-bg);
  }

  .community-chat-poll-harness__recall > article {
    min-height: 42px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-block-end: 1px solid var(--surface-border-color);
  }

  .community-chat-poll-harness__recall > article:last-child {
    border-block-end: 0;
  }

  .community-chat-poll-harness__badge > span,
  .community-chat-poll-harness__badge > small {
    color: var(--desc-color);
  }

  .community-chat-poll-harness__grid > article {
    min-width: 0;
    padding: 16px;
    display: grid;
    align-content: start;
    gap: 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 16px;
    background: var(--surface-card-bg);
  }

  .community-chat-poll-harness__label,
  .community-chat-poll-harness__composer-note {
    display: grid;
    gap: 4px;
    font-size: 12px;
  }

  .community-chat-poll-harness__stack {
    display: grid;
    gap: 14px;
  }

  .community-chat-poll-harness pre {
    position: fixed;
    right: 12px;
    bottom: 12px;
    max-width: min(520px, calc(100vw - 24px));
    margin: 0;
    padding: 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 8px;
    color: var(--text-color);
    background: var(--surface-card-bg);
    font-size: 11px;
  }

  @media (max-width: 767px) {
    .community-chat-poll-harness {
      padding: 16px 12px;
    }

    .community-chat-poll-harness > header h1 {
      font-size: 20px;
    }

    .community-chat-poll-harness__grid {
      grid-template-columns: 1fr;
    }

    .community-chat-poll-harness__grid > article {
      padding: 12px;
    }
  }
</style>
