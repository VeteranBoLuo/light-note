import { executeAiSkill } from '../aiSkill/runtime.js';
import { toolboxError } from './errors.js';
export async function executeTranslationJob(job, identity, database, { requestId, beforeSegment, commit, onProgress, signal }) {
  const [rows] = await database.query('SELECT content,segments_json FROM toolbox_translation_inputs WHERE job_id=? AND user_id=? AND expires_at>NOW()', [job.id, job.user_id]);
  if (!rows[0]) throw toolboxError('TOOLBOX_TRANSLATION_INPUT_UNAVAILABLE', '翻译输入不可用', 409);
  const options = typeof job.options_json === 'string' ? JSON.parse(job.options_json) : job.options_json || {};
  let pairs;
  const languageNames = { 'zh-CN':'简体中文', 'zh-TW':'繁体中文', en:'英语', ja:'日语', ko:'韩语', fr:'法语', de:'德语', es:'西班牙语', pt:'葡萄牙语', ru:'俄语' };
  const suffix = `${languageNames[options.targetLanguage] || options.targetLanguage}译文`;
  const title = options.title ? `${options.title} · ${suffix}`.slice(0,255) : suffix;
  await executeAiSkill({ protocolVersion: 1, requestId, skillId: 'toolbox.translation', skillVersion: 1, threadId: null,
    input: { text: rows[0].content, sourceLanguage: options.sourceLanguage, targetLanguage: options.targetLanguage, instruction: options.question || '' },
    scope: { resourceRefs: [] }, client: { locale: 'zh-CN', timezone: 'Asia/Singapore', surface: 'toolbox' },
  }, { user: identity.user, billingUser: identity.user, resourceUser: identity.user, securityRestrictions: identity.restrictions,
    headers: {}, body: {}, path: '/toolbox/worker', method: 'POST', ip: 'toolbox-worker',
  }, { database, signal, internalCaller: 'toolbox_worker',
    skillDependencies: { beforeSegment, onProgress, onTranslated: result => { pairs = result; } },
    commitValidatedResult: async ({ response }) => {
      if (!pairs?.length || !response.result?.content) throw toolboxError('TOOLBOX_TRANSLATION_RESULT_INVALID', '译文未完成', 502);
      const delivered = await commit({ type: 'translation', title, content: response.result.content, contentType: 'markdown', sources: [], coverage: response.coverage,
        meta: { translation: { version: 1, sourceLanguage: options.sourceLanguage, targetLanguage: options.targetLanguage, segments: pairs } }, outcome: 'succeeded' });
      if (!delivered) throw toolboxError('TOOLBOX_LEASE_LOST', '任务状态已变化', 409);
    },
  });
  return { persisted: true };
}
