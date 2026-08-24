import { resultData } from '../util/common.js';
import { getAiProductFeatureState } from '../util/aiProductFeature.js';
import { executeAiSkill } from '../util/aiSkill/runtime.js';
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
