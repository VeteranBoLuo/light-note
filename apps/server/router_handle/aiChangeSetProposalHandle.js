import { resultData } from '../util/common.js';
import { resolveAiConversationIdentity } from '../util/aiConversationService.js';
import { proposeAiChangeSet } from '../util/aiChangeSetProposalService.js';

export async function proposeChangeSet(req, res) {
  try {
    const identity = resolveAiConversationIdentity(req);
    const billingIdentity = req.billingUser || req.adminActor || req.user || {};
    const changeSet = await proposeAiChangeSet(identity, req.body || {}, {
      governance: {
        quotaPolicy: 'user',
        request: req,
        identity: billingIdentity,
        requestId: req.body?.requestId,
        taskType: 'change_set_proposal',
      },
    });
    return res.send(resultData(changeSet));
  } catch (error) {
    const code = String(error?.code || 'CHANGE_PROPOSAL_FAILED');
    const status = Number(error?.status || 500);
    const raw = String(error?.message || 'AI 整理建议生成失败');
    const message = raw.startsWith(`${code}:`) ? raw.slice(code.length + 1).trim() : raw;
    if (status >= 500) console.error('[ai-change-proposal] 请求失败:', code);
    return res
      .status(status)
      .send(resultData({ code }, status, status >= 500 ? 'AI 整理建议生成失败，请稍后重试' : message));
  }
}
