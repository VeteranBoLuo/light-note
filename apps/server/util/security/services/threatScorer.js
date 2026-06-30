const severityWeight = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export const getSeverityByScore = (score) => {
  if (score >= 80) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 20) return 'medium';
  return 'low';
};

const aggregateEvidenceScore = (evidenceList = []) => {
  const grouped = new Map();
  for (const item of evidenceList) {
    const key = item.ruleCode || `${item.detector}:${item.attackType}:${item.ruleName}`;
    const score = Math.max(0, Number(item.scoreDelta || 0));
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(score);
  }

  return [...grouped.values()].reduce((sum, scores) => {
    const sorted = scores.sort((a, b) => b - a);
    const strongest = sorted[0] || 0;
    const extraScore = sorted.slice(1).reduce((total, score) => total + score, 0);
    return sum + strongest + Math.min(20, Math.ceil(extraScore * 0.25));
  }, 0);
};

export const calculateThreat = (evidenceList = [], ipReputation = {}) => {
  const evidenceScore = aggregateEvidenceScore(evidenceList);
  const confidenceWeight = evidenceList.reduce((sum, item) => sum + Math.max(1, Number(item.scoreDelta || 0)), 0);
  const confidence =
    evidenceList.length && confidenceWeight
      ? Math.round(
          evidenceList.reduce(
            (sum, item) => sum + Number(item.confidence || 0) * Math.max(1, Number(item.scoreDelta || 0)),
            0,
          ) / confidenceWeight,
        )
      : 0;
  const reputationScore = Math.min(25, Math.floor(Number(ipReputation.risk_score || 0) / 4));
  const score = Math.min(100, evidenceScore + reputationScore);
  const strongestEvidence = [...evidenceList].sort((a, b) => {
    const severityDiff = (severityWeight[b.severity] || 0) - (severityWeight[a.severity] || 0);
    if (severityDiff !== 0) return severityDiff;
    return Number(b.scoreDelta || 0) - Number(a.scoreDelta || 0);
  })[0];

  return {
    threatScore: score,
    severity: getSeverityByScore(score),
    confidence,
    attackType: strongestEvidence?.attackType || 'SUSPICIOUS_REQUEST',
    matchedRule: strongestEvidence?.ruleName || '',
    matchedPayload: strongestEvidence?.matchedValuePreview || '',
  };
};
