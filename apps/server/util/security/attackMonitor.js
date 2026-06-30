import { resultData } from '../common.js';
import { buildRequestContext, shouldSkipSecurity } from './requestContext.js';
import { detectSignatures } from './detectors/signatureDetector.js';
import { detectRequestBehavior, detectResponseBehavior } from './detectors/behaviorDetector.js';
import { calculateThreat } from './services/threatScorer.js';
import { decideSecurityAction } from './services/decisionEngine.js';
import { getIpReputation, recordIpRequest } from './services/ipReputation.js';
import { writeSecurityEvent } from './services/securityLogService.js';

const loggedRequests = new WeakSet();
const debugSecurity = (...args) => {
  if (process.env.SECURITY_DEBUG === 'true') {
    console.log('[security]', ...args);
  }
};

const IP_BAN_RECOVERY_PATHS = ['/user/login', '/user/logout'];

const isIpBanRecoveryRequest = (path = '') => IP_BAN_RECOVERY_PATHS.some((item) => path.startsWith(item));

const writeEventSafely = async ({ context, evidenceList, threat, decision, statusCode, responseTimeMs }) => {
  try {
    await writeSecurityEvent({ context, evidenceList, threat, decision, statusCode, responseTimeMs });
  } catch (e) {
    console.error('安全事件写入失败:', e.message);
  }
};

export const attackMonitor = async (req, res, next) => {
  if (shouldSkipSecurity(req)) {
    return next();
  }

  const context = buildRequestContext(req);
  recordIpRequest(context.sourceIp);

  const ipReputation = await getIpReputation(context.sourceIp);
  const effectiveIpReputation =
    req.user?.role === 'root' ? { ...ipReputation, is_banned: 0, banned_until: null } : ipReputation;
  const signatureEvidence = detectSignatures(context);
  const behaviorResult = detectRequestBehavior(context);
  const evidenceList = [...signatureEvidence, ...behaviorResult.evidence];
  const threat = calculateThreat(evidenceList, effectiveIpReputation);
  const decision = decideSecurityAction({ threatScore: threat.threatScore, ipReputation: effectiveIpReputation });
  debugSecurity(context.method, context.originalUrl, evidenceList.length, threat.threatScore, decision.actionTaken);

  let responsePayload = '';
  const originalSend = res.send;
  res.send = function (body) {
    responsePayload = body;
    return originalSend.call(this, body);
  };

  const finalize = async () => {
    if (loggedRequests.has(req)) {
      return;
    }
    const responseEvidence = detectResponseBehavior(context, res.statusCode, responsePayload);
    const allEvidence = [...evidenceList, ...responseEvidence];
    if (allEvidence.length === 0) {
      return;
    }
    const finalThreat = calculateThreat(allEvidence, effectiveIpReputation);
    const finalDecision = decision.blocked
      ? decision
      : decideSecurityAction({ threatScore: finalThreat.threatScore, ipReputation: effectiveIpReputation });
    const observedDecision =
      !decision.blocked && finalDecision.blocked
        ? {
            ...finalDecision,
            actionTaken: 'log',
            blocked: false,
            reason: '响应完成后识别风险，已记录并更新画像',
          }
        : {
            ...finalDecision,
            blocked: decision.blocked ? finalDecision.blocked : false,
            reason: finalDecision.reason,
          };
    loggedRequests.add(req);
    await writeEventSafely({
      context,
      evidenceList: allEvidence,
      threat: finalThreat,
      decision: observedDecision,
      statusCode: res.statusCode,
      responseTimeMs: Date.now() - context.startedAt,
    });
  };

  res.on('finish', finalize);

  if (decision.blocked) {
    if (decision.reputationBlocked && evidenceList.length === 0) {
      if (isIpBanRecoveryRequest(context.path)) {
        return next();
      }
      return res.status(403).json(resultData(null, 403, decision.reason || 'IP 已处于封禁期'));
    }
    const blockedEvidenceList =
      evidenceList.length > 0
        ? evidenceList
        : [
            {
              ruleCode: 'IP_REPUTATION_BLOCK',
              ruleName: 'IP 信誉封禁',
              detector: 'reputation',
              attackType: 'IP_REPUTATION',
              severity: 'high',
              matchedField: 'sourceIp',
              matchedValuePreview: context.sourceIp,
              evidenceMessage: decision.reason || 'IP 已处于封禁期',
              scoreDelta: 80,
              confidence: 90,
            },
          ];
    const blockedThreat =
      evidenceList.length > 0
        ? threat
        : {
            threatScore: 80,
            severity: 'high',
            confidence: 90,
            attackType: 'IP_REPUTATION',
            matchedRule: 'IP 信誉封禁',
            matchedPayload: context.sourceIp,
          };
    loggedRequests.add(req);
    await writeEventSafely({
      context,
      evidenceList: blockedEvidenceList,
      threat: blockedThreat,
      decision,
      statusCode: 403,
      responseTimeMs: Date.now() - context.startedAt,
    });
    return res.status(403).json(resultData(null, 403, decision.reason || '系统检测到高风险请求，已拦截'));
  }

  return next();
};
