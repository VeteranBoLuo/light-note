import { beforeEach, describe, expect, it, vi } from 'vitest';

const redis = {
  setEx: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
  eval: vi.fn(),
};
vi.mock('../redisClient.js', () => ({ default: redis }));

const {
  claimAgentInteractionResponse,
  createAgentInteraction,
  inspectAgentInteractionResponse,
  settleAgentInteractionResponse,
  AgentInteractionError,
} = await import('./interactionStore.js');

function baseInput(overrides = {}) {
  return {
    ownerKey: 'user:user-1',
    sessionId: 'session-1',
    context: {
      resourceUserId: 'user-1',
      resourceUserRole: 'user',
      adminContextId: null,
      adminMode: null,
    },
    spec: {
      code: 'cloud_folder_missing',
      type: 'single_choice',
      purpose: 'choice_confirmation',
      title: '没有找到“项目资料”文件夹',
      options: [
        { id: 'create_and_save', label: '新建并保存' },
        { id: 'save_to_root', label: '保存到根目录' },
      ],
    },
    action: {
      resolver: 'save_attachment_folder_resolution',
      toolName: 'save_attachment_to_cloud',
      args: { attachmentId: 'attachment-1', folderName: '项目资料' },
    },
    ...overrides,
  };
}

async function issueAndStore(overrides = {}) {
  const issued = await createAgentInteraction(baseInput(overrides));
  const [key, ttl, raw] = redis.setEx.mock.calls.at(-1);
  return { issued, key, ttl, raw };
}

describe('agent interactionStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redis.setEx.mockResolvedValue('OK');
    redis.del.mockResolvedValue(1);
    redis.eval.mockResolvedValue(1);
  });

  it('签发短时令牌，Redis 键不包含明文 token，并保留资源与代管绑定', async () => {
    const { issued, key, ttl, raw } = await issueAndStore({
      ownerKey: 'admin:root-1:visitor-1',
      context: {
        resourceUserId: 'visitor-1',
        resourceUserRole: 'visitor',
        adminContextId: 'admin-context-1',
        adminMode: 'maintain',
      },
    });

    expect(issued.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(key).toMatch(/^agent:interaction:[0-9a-f]{64}$/);
    expect(key).not.toContain(issued.token);
    expect(ttl).toBe(300);
    expect(JSON.parse(raw)).toMatchObject({
      sessionId: 'session-1',
      resourceUserId: 'visitor-1',
      resourceUserRole: 'visitor',
      adminContextId: 'admin-context-1',
      adminMode: 'maintain',
    });
    expect(issued.interaction).not.toHaveProperty('action');
  });

  it('读取时同时校验 owner 和 session，错误主体不能取得服务器动作', async () => {
    const { issued, raw } = await issueAndStore();
    redis.get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(raw)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(raw);

    await expect(
      inspectAgentInteractionResponse(issued.token, 'user:other', 'session-1', {
        selectedIds: ['save_to_root'],
      }),
    ).rejects.toMatchObject({ code: 'AGENT_INTERACTION_FORBIDDEN', status: 403 });
    await expect(
      inspectAgentInteractionResponse(issued.token, 'user:user-1', 'other-session', {
        selectedIds: ['save_to_root'],
      }),
    ).rejects.toMatchObject({ code: 'AGENT_INTERACTION_FORBIDDEN', status: 403 });
  });

  it('拒绝禁用、未知、超量选项以及 choice_confirmation 的自定义文本', async () => {
    const { issued, raw } = await issueAndStore();
    redis.get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(raw)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(raw)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(raw);

    await expect(
      inspectAgentInteractionResponse(issued.token, 'user:user-1', 'session-1', {
        selectedIds: ['unknown'],
      }),
    ).rejects.toMatchObject({ code: 'AGENT_INTERACTION_RESPONSE_INVALID' });
    await expect(
      inspectAgentInteractionResponse(issued.token, 'user:user-1', 'session-1', {
        selectedIds: ['save_to_root', 'create_and_save'],
      }),
    ).rejects.toMatchObject({ code: 'AGENT_INTERACTION_RESPONSE_INVALID' });
    await expect(
      inspectAgentInteractionResponse(issued.token, 'user:user-1', 'session-1', {
        selectedIds: [],
        customValue: '自行保存',
      }),
    ).rejects.toMatchObject({ code: 'AGENT_INTERACTION_RESPONSE_INVALID' });
  });

  it('原子认领后并发回答只回放第一份 running 响应，不会执行第二个选择', async () => {
    const { issued, raw } = await issueAndStore();
    redis.get.mockResolvedValueOnce(null).mockResolvedValueOnce(raw);
    const firstReady = await inspectAgentInteractionResponse(issued.token, 'user:user-1', 'session-1', {
      selectedIds: ['create_and_save'],
    });
    redis.get.mockResolvedValueOnce(null).mockResolvedValueOnce(raw);
    const secondReady = await inspectAgentInteractionResponse(issued.token, 'user:user-1', 'session-1', {
      selectedIds: ['save_to_root'],
    });

    redis.eval.mockResolvedValueOnce(1);
    const firstClaim = await claimAgentInteractionResponse(firstReady.interaction, firstReady.response);
    const runningRaw = redis.eval.mock.calls[0][1].arguments[1];
    redis.eval.mockResolvedValueOnce(2);
    redis.get.mockResolvedValueOnce(runningRaw);
    const secondClaim = await claimAgentInteractionResponse(secondReady.interaction, secondReady.response);

    expect(firstClaim).toMatchObject({
      state: 'claimed',
      response: { selectedIds: ['create_and_save'] },
    });
    expect(secondClaim).toMatchObject({
      state: 'running',
      response: { selectedIds: ['create_and_save'] },
    });
  });

  it('结算后同一 token 回放确定结果，不再需要原始 interaction 键', async () => {
    const { issued, raw } = await issueAndStore();
    redis.get.mockResolvedValueOnce(null).mockResolvedValueOnce(raw);
    const ready = await inspectAgentInteractionResponse(issued.token, 'user:user-1', 'session-1', {
      selectedIds: ['save_to_root'],
    });
    redis.eval.mockResolvedValueOnce(1);
    const claimed = await claimAgentInteractionResponse(ready.interaction, ready.response);
    redis.eval.mockResolvedValueOnce(1);
    const outcome = {
      state: 'confirmation_required',
      confirmation: { id: 'confirm-1', sessionId: 'session-1', toolName: 'save_attachment_to_cloud' },
    };
    await expect(settleAgentInteractionResponse(claimed.interaction, claimed.response, outcome)).resolves.toBe(
      outcome,
    );
    const settledRaw = redis.eval.mock.calls[1][1].arguments[1];
    redis.get.mockResolvedValueOnce(settledRaw);

    await expect(
      inspectAgentInteractionResponse(issued.token, 'user:user-1', 'session-1', {
        selectedIds: ['create_and_save'],
      }),
    ).resolves.toMatchObject({
      state: 'settled',
      response: { selectedIds: ['save_to_root'] },
      outcome,
    });
  });

  it('服务器保存的动作或交互规范被篡改时失败关闭', async () => {
    const { issued, raw } = await issueAndStore();
    const tampered = JSON.parse(raw);
    tampered.action.args.folderName = '其他文件夹';
    redis.get.mockResolvedValue(JSON.stringify(tampered));

    await expect(
      inspectAgentInteractionResponse(issued.token, 'user:user-1', 'session-1', {
        selectedIds: ['save_to_root'],
      }),
    ).rejects.toBeInstanceOf(AgentInteractionError);
    await expect(
      inspectAgentInteractionResponse(issued.token, 'user:user-1', 'session-1', {
        selectedIds: ['save_to_root'],
      }),
    ).rejects.toMatchObject({ code: 'AGENT_INTERACTION_INVALID' });
  });
});
