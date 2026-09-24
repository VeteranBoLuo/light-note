import { onScopeDispose, reactive } from 'vue';
import { createAiSkillRequest, executeAiSkill, getAiSkillPublicErrorMessage } from '@/api/aiSkillApi';
import { AI_DOCUMENT_SUMMARY_MAX_CHARS } from '@lightnote/shared/ai-skill-protocol';
import { getAiQuotaErrorPresentation } from '@/utils/aiQuotaErrorPresentation';

export function useDocumentSummary(t: (key: string, params?: any) => string) {
  const states = reactive(
    new Map<File, { content: string; jobId: string; artifactId: string; loading: boolean; error: string }>(),
  );
  const controllers = new Map<File, AbortController>();
  let generation = 0;
  function state(file: File) {
    if (!states.has(file)) states.set(file, { content: '', jobId: '', artifactId: '', loading: false, error: '' });
    return states.get(file)!;
  }
  async function generate(file: File, text: string) {
    const current = state(file);
    if (current.loading) return;
    current.error = '';
    if (!text.trim() || text.length > AI_DOCUMENT_SUMMARY_MAX_CHARS) {
      current.error = t(text.trim() ? 'toolbox.documentSummary.tooLong' : 'toolbox.documentSummary.empty', {
        count: AI_DOCUMENT_SUMMARY_MAX_CHARS,
      });
      return;
    }
    const version = generation;
    const controller = new AbortController();
    controllers.set(file, controller);
    current.loading = true;
    try {
      const response = await executeAiSkill(
        createAiSkillRequest({
          skillId: 'toolbox.summarize_text',
          surface: 'pdf_text_summary',
          input: { title: file.name, text },
        }),
        { signal: controller.signal, timeout: 600_000 },
      );
      if (version !== generation || controller.signal.aborted) return;
      const result = response.result;
      if (
        response.status !== 'completed' ||
        result?.kind !== 'grounded_markdown' ||
        !String(result.content || '').trim()
      ) {
        throw new Error('Invalid summary result');
      }
      current.content = String(result.content);
      current.jobId = String(response.receipt?.toolboxJobId || '');
      current.artifactId = String(response.receipt?.toolboxArtifactId || '');
    } catch (cause) {
      if (version !== generation || controller.signal.aborted) return;
      current.error =
        getAiQuotaErrorPresentation(cause, t)?.message ||
        getAiSkillPublicErrorMessage(cause) ||
        t('toolbox.documentSummary.failed');
    } finally {
      if (version === generation) {
        current.loading = false;
        controllers.delete(file);
      }
    }
  }
  function reset() {
    generation++;
    controllers.forEach((controller) => controller.abort());
    controllers.clear();
    states.clear();
  }
  onScopeDispose(reset);
  return { state, generate, reset };
}
