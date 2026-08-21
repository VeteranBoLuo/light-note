import { stableAgentErrorCode } from '../logSafety.js';
import { normalizeAgentUuid } from '../identifiers.js';
import {
  AgentStateRepositoryError,
  loadAgentArtifactVersion,
  transitionAgentArtifactVersion,
} from './agentStateRepository.js';

const defaultRepository = Object.freeze({
  load: loadAgentArtifactVersion,
  transition: transitionAgentArtifactVersion,
});

function artifactBinding(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = normalizeAgentUuid(value.id);
  const contentHash = String(value.contentHash || '').toLowerCase();
  const conversationId = String(value.conversationId || '');
  if (!id || !/^[a-f0-9]{64}$/.test(contentHash) || !conversationId) return null;
  return Object.freeze({
    id,
    contentHash,
    conversationId,
    capabilityId: String(value.capabilityId || ''),
  });
}

function lifecycleContext(context, binding) {
  return { ...context, conversationId: binding.conversationId };
}

export async function verifyAgentArtifactConfirmation({
  mode,
  context,
  binding: rawBinding,
  database,
  repository = defaultRepository,
} = {}) {
  const binding = artifactBinding(rawBinding);
  if (mode !== 'enforce' || !binding) return Object.freeze({ state: 'skipped' });
  const artifact = await repository.load(lifecycleContext(context, binding), binding.id, database);
  if (
    !artifact ||
    artifact.state !== 'ready' ||
    artifact.contentHash !== binding.contentHash ||
    (binding.capabilityId && artifact.capabilityId !== binding.capabilityId)
  ) {
    throw new AgentStateRepositoryError(
      'AGENT_ARTIFACT_CONFIRMATION_CONFLICT',
      '草稿版本已经变化，请基于最新版本重新确认。',
      409,
    );
  }
  return Object.freeze({ state: 'ready', artifactId: artifact.id });
}

export async function settleAgentArtifactConfirmation({
  mode,
  context,
  binding: rawBinding,
  state,
  database,
  repository = defaultRepository,
  logger = console,
} = {}) {
  const binding = artifactBinding(rawBinding);
  if (!['shadow', 'enforce'].includes(mode) || !binding) return Object.freeze({ state: 'skipped' });
  const transition = async () => {
    const applied = await repository.transition(
      lifecycleContext(context, binding),
      binding.id,
      { state, expectedStates: ['ready'], contentHash: binding.contentHash },
      database,
    );
    return Object.freeze({ state: applied ? 'committed' : 'conflict' });
  };
  if (mode === 'enforce') return transition();
  try {
    return await transition();
  } catch (error) {
    logger.warn?.('[Agent] artifact lifecycle shadow write failed code=%s', stableAgentErrorCode(error));
    return Object.freeze({ state: 'skipped', errorCode: stableAgentErrorCode(error) });
  }
}

export const __testing = Object.freeze({ artifactBinding });
