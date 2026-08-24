import { resultData } from '../util/common.js';
import { getAiProductFeatureState } from '../util/aiProductFeature.js';
import { executeAiSkill } from '../util/aiSkill/runtime.js';
import { callGroundedSkillModelStream } from '../util/aiSkill/model.js';
import { listAiSkills } from '../util/aiSkill/registry.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';
import { resolvePublicAiExecutionError } from '../util/aiExecution/publicError.js';
import { recordAiProductEvent } from '../util/aiProductTelemetry.js';

export function getAiSkillsConfig(_req, res) {
  const state = getAiProductFeatureState();
  return res.send(
    resultData({
      ...state,
      availableSkills: listAiSkills().filter((skill) => state.skills[skill.domain] === true),
    }),
  );
}

export async function executeAiSkillRequest(req, res) {
  try {
    return res.send(resultData(await executeAiSkill(req.body || {}, req, { recordTelemetry: recordAiProductEvent })));
  } catch (error) {
    const failure = resolvePublicAiExecutionError(error);
    if (failure.status >= 500) console.error('[ai-skill] execute failed code=%s', stableAgentErrorCode(error));
    return res.status(failure.status).send(resultData({ code: failure.code }, failure.status, failure.message));
  }
}

function writeSse(res, event, data) {
  if (res.writableEnded || res.destroyed) return;
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/**
 * 首期只开放纯文本变换 Skill。结构化草稿与需要来源修复的能力仍走普通 JSON，
 * 防止一个“通用流式接口”绕开各 Skill 的最终结果契约。
 */
export async function executeAiSkillStreamRequest(req, res) {
  if (String(req.body?.skillId || '') !== 'note.transform_text') {
    return res.status(400).send(resultData({ code: 'AI_SKILL_STREAM_UNSUPPORTED' }, 400, '该 AI 能力暂不支持流式输出'));
  }
  const controller = new AbortController();
  let completed = false;
  const abortOnClose = () => {
    if (!completed) controller.abort(new Error('AI_STREAM_CLIENT_DISCONNECTED'));
  };
  req.once('aborted', abortOnClose);
  res.once('close', abortOnClose);
  res.status(200);
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  writeSse(res, 'start', { requestId: String(req.body?.requestId || '') });
  try {
    const response = await executeAiSkill(req.body || {}, req, {
      recordTelemetry: recordAiProductEvent,
      callModel: (options) =>
        callGroundedSkillModelStream({
          ...options,
          signal: controller.signal,
          onDelta: (content) => writeSse(res, 'delta', { content }),
          onReset: () => writeSse(res, 'reset', {}),
        }),
    });
    completed = true;
    writeSse(res, 'complete', response);
  } catch (error) {
    const disconnected = controller.signal.aborted || req.aborted || res.destroyed;
    if (!disconnected) {
      const failure = resolvePublicAiExecutionError(error);
      if (failure.status >= 500) console.error('[ai-skill] stream failed code=%s', stableAgentErrorCode(error));
      writeSse(res, 'error', failure);
    }
  } finally {
    completed = true;
    req.removeListener('aborted', abortOnClose);
    res.removeListener('close', abortOnClose);
    if (!res.writableEnded && !res.destroyed) res.end();
  }
}

export const aiSkillHandleInternals = Object.freeze({ writeSse });
