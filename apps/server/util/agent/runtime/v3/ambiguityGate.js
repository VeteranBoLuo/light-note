const BLOCKING_IMPACTS = new Set(['fatal', 'blocks_write', 'blocks_goal']);

function uniqueStrings(values) {
  return [...new Set(values.map(String).filter(Boolean))];
}

/**
 * 把 goal 级歧义收敛成可执行子集。
 *
 * fatal 阻断整轮；blocks_goal 阻断所属目标；blocks_write 只阻断写/转换目标。
 * 依赖被阻断目标的后继也必须阻断，避免跳过必要读取后直接执行写入。
 */
export function evaluateTurnSpecAmbiguities(turnSpec) {
  const goals = Array.isArray(turnSpec?.goals) ? turnSpec.goals : [];
  const blocked = new Set();
  const questions = [];
  let fatal = false;

  for (const goal of goals) {
    for (const ambiguity of goal.ambiguities || []) {
      if (!BLOCKING_IMPACTS.has(ambiguity.impact)) continue;
      if (ambiguity.impact === 'fatal') fatal = true;
      if (
        ambiguity.impact === 'fatal' ||
        ambiguity.impact === 'blocks_goal' ||
        (ambiguity.impact === 'blocks_write' && ['write', 'transform'].includes(goal.kind))
      ) {
        blocked.add(goal.id);
        questions.push(ambiguity.question);
      }
    }
  }
  if (fatal) for (const goal of goals) blocked.add(goal.id);

  let changed = true;
  while (changed) {
    changed = false;
    for (const goal of goals) {
      if (!blocked.has(goal.id) && goal.dependsOn?.some((dependencyId) => blocked.has(dependencyId))) {
        blocked.add(goal.id);
        changed = true;
      }
    }
  }

  const blockedGoalIds = uniqueStrings([...blocked]);
  const executableGoalIds = goals.map((goal) => goal.id).filter((goalId) => !blocked.has(goalId));
  return Object.freeze({
    state:
      blockedGoalIds.length === goals.length && goals.length
        ? 'clarification'
        : blockedGoalIds.length
          ? 'partial'
          : 'ready',
    fatal,
    blockedGoalIds: Object.freeze(blockedGoalIds),
    executableGoalIds: Object.freeze(executableGoalIds),
    questions: Object.freeze(uniqueStrings(questions)),
    question: uniqueStrings(questions)[0] || '',
  });
}

export const __testing = Object.freeze({ BLOCKING_IMPACTS, uniqueStrings });
