import { stableAgentErrorCode } from '../logSafety.js';
import {
  commitAgentConversationMutation,
  createAgentRun,
  createAgentPersistenceContext,
  loadAgentSourceSet,
  loadAgentConversationState,
  loadLatestEditableAgentArtifactVersion,
  settleAgentRun,
} from './agentStateRepository.js';
import { shouldRestoreAgentPersistentState, shouldWriteAgentPersistentState } from './agentPersistenceMode.js';

const SESSION_TTL_MS = 30 * 60 * 1000;

const defaultRepository = Object.freeze({
  commit: commitAgentConversationMutation,
  createRun: createAgentRun,
  load: loadAgentConversationState,
  loadEditableArtifact: loadLatestEditableAgentArtifactVersion,
  loadSourceSet: loadAgentSourceSet,
  settleRun: settleAgentRun,
});

function timestamp(value, fallback) {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function uniqueIds(values, limit = 12) {
  return [...new Set((Array.isArray(values) ? values : []).map(String).filter(Boolean))].slice(-limit);
}

function emptySnapshot() {
  return {
    discourseState: {
      schemaVersion: 3,
      revision: 0,
      topicEpoch: 0,
      activeDomain: '',
      lastCapabilityIds: [],
      lastResultSetId: '',
      activeSourceSetIds: [],
      activeResultSetIds: [],
      pendingFocus: null,
      activeReadRunId: '',
      lastRunState: 'idle',
      pendingArtifactId: '',
      unresolvedReference: false,
    },
    sourceSets: [],
    resultSets: [],
    artifactStates: [],
  };
}

function capabilityDomain(capabilityId, fallback = '') {
  return String(capabilityId || '').split('.')[0] || fallback;
}

export function mapAgentPersistentSnapshot(value) {
  if (!value) return emptySnapshot();
  const currentTime = Date.now();
  const sourceSets = (Array.isArray(value.sourceSets) ? value.sourceSets : []).map((sourceSet) => ({
    id: String(sourceSet.id),
    runId: String(sourceSet.runId || ''),
    kind: String(sourceSet.kind || 'explicit'),
    refs: Array.isArray(sourceSet.items?.refs) ? sourceSet.items.refs : [],
    scopeRefs: Array.isArray(sourceSet.items?.scopeRefs) ? sourceSet.items.scopeRefs : [],
    attachmentSourceIds: Array.isArray(sourceSet.items?.attachmentIds) ? sourceSet.items.attachmentIds : [],
    dialogueAnchor:
      sourceSet.items?.dialogueAnchor && typeof sourceSet.items.dialogueAnchor === 'object'
        ? sourceSet.items.dialogueAnchor
        : null,
    sourceVersionDigest: String(sourceSet.sourceDigest || ''),
    createdAt: timestamp(sourceSet.createdAt, currentTime),
    expiresAt: timestamp(sourceSet.expiresAt, currentTime + SESSION_TTL_MS),
  }));
  const resultSets = (Array.isArray(value.resultSets) ? value.resultSets : []).map((resultSet) => {
    const totalExact = resultSet.totalCount != null;
    const domain = capabilityDomain(resultSet.capabilityId, resultSet.entityType);
    return {
      id: String(resultSet.id),
      handleId: String(resultSet.handleId || ''),
      runId: String(resultSet.runId || ''),
      goalId: String(resultSet.goalId || ''),
      capabilityId: String(resultSet.capabilityId || ''),
      domains: domain ? [domain] : [],
      refs: Array.isArray(resultSet.refs) ? resultSet.refs : [],
      filters: resultSet.filters || {},
      ordering: Array.isArray(resultSet.ordering) ? resultSet.ordering : [],
      fieldMask: Array.isArray(resultSet.fieldMask) ? resultSet.fieldMask : [],
      metadata: {
        totalCount: totalExact ? Number(resultSet.totalCount) : null,
        total: totalExact ? Number(resultSet.totalCount) : null,
        returned: Number(resultSet.returnedCount) || 0,
        totalExact,
        completeness: String(resultSet.completeness || 'unknown'),
        complete: ['complete', 'empty'].includes(resultSet.completeness),
        partial: ['partial', 'unknown'].includes(resultSet.completeness),
        truncationReason: resultSet.partialReason || null,
        nextCursor: resultSet.nextCursor || null,
      },
      status: resultSet.completeness === 'empty' ? 'empty' : 'success',
      topicEpoch: Number(value.topicEpoch) || 0,
      createdAt: timestamp(resultSet.createdAt, currentTime),
      expiresAt: timestamp(resultSet.freshUntil, currentTime + SESSION_TTL_MS),
    };
  });
  const artifact = value.artifactVersion;
  const artifactStates = artifact
    ? [
        {
          id: String(artifact.id),
          artifactChainId: String(artifact.artifactChainId || ''),
          capabilityId: String(artifact.capabilityId || ''),
          domain: capabilityDomain(artifact.capabilityId),
          state: String(artifact.state || 'unknown'),
          contentHash: String(artifact.contentHash || ''),
          sourceSetId: String(artifact.sourceSetId || ''),
          updatedAt: timestamp(artifact.updatedAt || artifact.createdAt, currentTime),
          expiresAt: currentTime + SESSION_TTL_MS,
        },
      ]
    : [];
  const discourseState = {
    ...(value.discourseState || {}),
    revision: Math.max(0, Number(value.revision) || 0),
    topicEpoch: Math.max(0, Number(value.topicEpoch) || 0),
    activeSourceSetIds: uniqueIds(value.activeSourceSetIds),
    activeResultSetIds: uniqueIds(value.activeResultSetIds),
    lastResultSetId: uniqueIds(value.activeResultSetIds).at(-1) || '',
    pendingArtifactId: artifact && ['draft', 'ready'].includes(artifact.state) ? String(artifact.id) : '',
  };
  return { discourseState, sourceSets, resultSets, artifactStates };
}

function durableMutationInput(snapshot, durable, latestArtifactVersionId, commitMode) {
  const sourceSets = Array.isArray(durable?.sourceSets) ? durable.sourceSets : [];
  const resultSets = (Array.isArray(durable?.resultSets) ? durable.resultSets : []).map((resultSet) => ({
    ...resultSet,
    freshUntil: resultSet.freshUntil || resultSet.expiresAt || null,
  }));
  const artifactVersions = Array.isArray(durable?.artifactVersions) ? durable.artifactVersions : [];
  const artifactTransitions = Array.isArray(durable?.artifactTransitions) ? durable.artifactTransitions : [];
  const latestArtifact = artifactVersions.at(-1);
  return {
    commitMode,
    state: {
      discourseState: snapshot.discourseState,
      activeSourceSetIds: snapshot.discourseState.activeSourceSetIds,
      activeResultSetIds: snapshot.discourseState.activeResultSetIds,
      latestArtifactVersionId: latestArtifact?.id || latestArtifactVersionId || null,
      lastRunId: snapshot.discourseState.activeReadRunId || null,
    },
    sourceSets,
    resultSets,
    artifactVersions,
    artifactTransitions,
  };
}

/**
 * 将现有 Redis sessionStore 适配到 Phase 2 的 MySQL 权威状态。
 * disabled 不创建适配器；shadow 只做单调镜像且永不影响主链路；enforce 使用严格 revision CAS。
 */
export function createAgentSessionPersistence({ mode, context: contextInput, database, repository, logger } = {}) {
  if (!shouldWriteAgentPersistentState(mode)) return null;
  const context = createAgentPersistenceContext(contextInput);
  const storage = repository || defaultRepository;
  const output = logger || console;
  let latestArtifactVersionId = null;

  const restore = async () => {
    const value = await storage.load(context, database);
    latestArtifactVersionId = value?.latestArtifactVersionId || value?.artifactVersion?.id || null;
    return mapAgentPersistentSnapshot(value);
  };

  const commit = async ({ expectedRevision, snapshot, durable, commitMode }) => {
    const input = durableMutationInput(snapshot, durable, latestArtifactVersionId, commitMode);
    const result = await storage.commit(context, { expectedRevision, ...input }, database);
    if (result?.state === 'committed' && input.state.latestArtifactVersionId) {
      latestArtifactVersionId = input.state.latestArtifactVersionId;
    }
    return result;
  };

  const runMutation = async (operation, fallbackState) => {
    if (mode === 'enforce') return operation();
    try {
      return await operation();
    } catch (error) {
      output.warn?.('[Agent] persistent run shadow write failed code=%s', stableAgentErrorCode(error));
      return Object.freeze({ state: fallbackState, errorCode: stableAgentErrorCode(error) });
    }
  };

  return Object.freeze({
    authoritative: shouldRestoreAgentPersistentState(mode),
    restore,
    commitFocus: (input) => commit({ ...input, commitMode: 'cas' }),
    startRun: (input) => runMutation(() => storage.createRun(context, input, database), 'skipped'),
    settleRun: (runId, input) => runMutation(() => storage.settleRun(context, runId, input, database), 'skipped'),
    recoverEditableArtifact: async (artifactVersionId) => {
      if (mode !== 'enforce' || typeof storage.loadEditableArtifact !== 'function') return null;
      const artifact = await storage.loadEditableArtifact(context, artifactVersionId, database);
      if (!artifact) return null;
      const sourceSet =
        artifact.sourceSetId && typeof storage.loadSourceSet === 'function'
          ? await storage.loadSourceSet(context, artifact.sourceSetId, database)
          : null;
      if (artifact.sourceSetId && !sourceSet) return null;
      return Object.freeze({ artifact, sourceSet });
    },
    mirrorFocus: async (input) => {
      try {
        return await commit({ ...input, commitMode: 'monotonic_mirror' });
      } catch (error) {
        output.warn?.('[Agent] persistent state shadow write failed code=%s', stableAgentErrorCode(error));
        return Object.freeze({ state: 'skipped', errorCode: stableAgentErrorCode(error) });
      }
    },
  });
}

export const __testing = Object.freeze({ durableMutationInput, emptySnapshot });
