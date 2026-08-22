import { describe, expect, it, vi } from 'vitest';
import { settleAgentArtifactConfirmation, verifyAgentArtifactConfirmation } from './agentArtifactLifecycle.js';

const context = { actorId: 'actor-1', subjectId: 'subject-1', ownerKey: 'user:actor-1' };
const binding = {
  id: '10000000-0000-4000-8000-000000000001',
  conversationId: 'conversation-1',
  capabilityId: 'note.create',
  contentHash: 'a'.repeat(64),
};

describe('ArtifactVersion 与确认生命周期', () => {
  it('enforce 执行前要求版本仍为 ready 且 hash、能力一致', async () => {
    const repository = {
      load: vi.fn().mockResolvedValue({
        id: binding.id,
        state: 'ready',
        capabilityId: 'note.create',
        contentHash: binding.contentHash,
      }),
    };
    await expect(verifyAgentArtifactConfirmation({ mode: 'enforce', context, binding, repository })).resolves.toEqual({
      state: 'ready',
      artifactId: binding.id,
    });
    expect(repository.load.mock.calls[0][0]).toMatchObject({ conversationId: 'conversation-1' });

    repository.load.mockResolvedValueOnce({
      id: binding.id,
      state: 'superseded',
      capabilityId: 'note.create',
      contentHash: binding.contentHash,
    });
    await expect(
      verifyAgentArtifactConfirmation({ mode: 'enforce', context, binding, repository }),
    ).rejects.toMatchObject({ code: 'AGENT_ARTIFACT_CONFIRMATION_CONFLICT', status: 409 });
  });

  it('disabled 与旧确认卡保持兼容，shadow 状态写失败不影响确认结果', async () => {
    const repository = { load: vi.fn(), transition: vi.fn().mockRejectedValue(new Error('offline')) };
    await expect(
      verifyAgentArtifactConfirmation({ mode: 'disabled', context, binding: null, repository }),
    ).resolves.toEqual({ state: 'skipped' });

    const logger = { warn: vi.fn() };
    await expect(
      settleAgentArtifactConfirmation({ mode: 'shadow', context, binding, state: 'committed', repository, logger }),
    ).resolves.toMatchObject({ state: 'skipped' });
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it('成功确认只能把相同 content hash 的 ready 版本推进为 committed', async () => {
    const repository = { transition: vi.fn().mockResolvedValue(true) };
    await expect(
      settleAgentArtifactConfirmation({ mode: 'enforce', context, binding, state: 'committed', repository }),
    ).resolves.toEqual({ state: 'committed' });
    expect(repository.transition).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conversation-1' }),
      binding.id,
      { state: 'committed', expectedStates: ['ready'], contentHash: binding.contentHash },
      undefined,
    );
  });
});
