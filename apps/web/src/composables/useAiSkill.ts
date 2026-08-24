import { computed, ref } from 'vue';
import { createAiSkillRequest, executeAiSkill } from '@/api/aiSkillApi';
import type { AiSkillRequest, AiSkillResourceRef, AiSkillResponse } from '@lightnote/shared/ai-skill-protocol';

export function useAiSkill({
  skillId,
  skillVersion = 1,
  surface,
}: {
  skillId: string;
  skillVersion?: number;
  surface: string;
}) {
  const loading = ref(false);
  const response = ref<AiSkillResponse | null>(null);
  const error = ref<{ code: string; message: string } | null>(null);
  const threadId = ref<string | null>(null);
  const threads = new Map<string, string>();
  let activeScopeKey = '';
  let activeRequest = 0;
  let activeController: AbortController | null = null;

  async function execute(input: Record<string, unknown>, resourceRefs: readonly AiSkillResourceRef[] = []) {
    const sequence = ++activeRequest;
    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;
    loading.value = true;
    error.value = null;
    const scopeKey = resourceRefs.map((item) => `${item.type}:${item.id}:${item.version || ''}`).join('|');
    if (scopeKey !== activeScopeKey) {
      activeScopeKey = scopeKey;
      response.value = null;
    }
    threadId.value = threads.get(scopeKey) || null;
    const payload: AiSkillRequest = createAiSkillRequest({
      skillId,
      skillVersion,
      threadId: threadId.value,
      input,
      resourceRefs,
      surface,
    });
    try {
      const result = await executeAiSkill(payload, { signal: controller.signal });
      if (sequence !== activeRequest || controller.signal.aborted) return null;
      response.value = result;
      threadId.value = result.threadId || null;
      if (result.threadId) threads.set(scopeKey, result.threadId);
      else threads.delete(scopeKey);
      return result;
    } catch (cause) {
      if (sequence !== activeRequest) return null;
      const value = cause as { code?: string; message?: string };
      error.value = {
        code: String(value?.code || 'AI_SKILL_FAILED'),
        message: String(value?.message || 'AI 能力暂时不可用'),
      };
      throw cause;
    } finally {
      if (sequence === activeRequest) loading.value = false;
      if (activeController === controller) activeController = null;
    }
  }

  function cancel() {
    activeRequest += 1;
    activeController?.abort();
    activeController = null;
    loading.value = false;
  }

  function reset({ keepThread = false } = {}) {
    cancel();
    response.value = null;
    error.value = null;
    if (!keepThread) {
      threads.clear();
      threadId.value = null;
      activeScopeKey = '';
    }
  }

  return {
    loading: computed(() => loading.value),
    response,
    result: computed(() => response.value?.result || null),
    sources: computed(() => response.value?.sources || []),
    coverage: computed(() => response.value?.coverage || null),
    error,
    threadId,
    execute,
    cancel,
    reset,
  };
}
