const CHINESE_ASSISTANT_SUCCESS_CLAIMS = [
  /(?:我|AI)(?:已经|已|刚刚|现已)?(?:成功)?(?:为你|帮你|替你)(?:把|将)?[^。！？\n]{0,80}(?:创建|新建|添加|保存|上传|修改|更新|重命名|删除|移除|恢复|还原|标记|完成|关闭|开启)(?:成功|完成|好了|为已完成)?/i,
  /(?:已经|已|现已)(?:成功)?(?:为你|帮你|替你)(?:把|将)?[^。！？\n]{0,80}(?:创建|新建|添加|保存|上传|修改|更新|重命名|删除|移除|恢复|还原|标记|完成)/i,
  /(?:操作|修改|创建|删除|保存|上传|恢复)(?:已经|已)?(?:成功|完成)(?:了|。|！|$)/i,
  /[✅☑️]\s*[^。！？\n]{0,100}(?:已(?:经)?(?:设为|标记为|改为|创建|删除|保存|恢复)|成功)/i,
  /(?:笔记|书签|文件|待办|任务|提醒|标签|资源|记录)[^。！？\n]{0,80}(?:已(?:经)?(?:被)?(?:设为|标记为|改为|创建|新建|添加|保存|上传|修改|更新|重命名|删除|移除|恢复|还原)|已经完成(?:了)?)(?!的)/i,
];

const ENGLISH_ASSISTANT_SUCCESS_CLAIMS = [
  /\bI(?:'ve| have)?\s+(?:successfully\s+)?(?:created|added|saved|uploaded|updated|renamed|deleted|removed|restored|marked|completed)\b/i,
  /\b(?:successfully|now)\s+(?:created|added|saved|uploaded|updated|renamed|deleted|removed|restored|marked|completed)\b/i,
  /\b(?:the\s+)?(?:operation|change|update|deletion|upload|restore)\s+(?:was|has been)\s+(?:successfully\s+)?completed\b/i,
  /\b(?:the\s+)?(?:note|bookmark|file|todo|task|item)\s+(?:was|has been)\s+(?:successfully\s+)?(?:created|saved|updated|renamed|deleted|removed|restored|completed)\b/i,
];

/**
 * 最终文本真实性传感器。
 *
 * 它不负责识别用户意图，也不决定调用什么工具，只在动作相关请求的最终文本中
 * 捕获“AI 自称已经替用户完成写入”的高置信表述。真正的成功只能来自确认接口回执。
 */
export function containsUnverifiedExecutionClaim(answer) {
  const text = String(answer || '').trim();
  if (!text) return false;
  return [...CHINESE_ASSISTANT_SUCCESS_CLAIMS, ...ENGLISH_ASSISTANT_SUCCESS_CLAIMS].some((pattern) =>
    pattern.test(text),
  );
}

export function guardUnverifiedExecutionClaim(answer, { actionRelated = false, locale = 'zh-CN' } = {}) {
  if (!actionRelated || !containsUnverifiedExecutionClaim(answer)) {
    return { guarded: false, answer: String(answer || '') };
  }
  const english = String(locale || '')
    .toLowerCase()
    .startsWith('en');
  return {
    guarded: true,
    answer: english
      ? 'This operation has not been executed because the server did not produce a verifiable confirmation or success receipt.'
      : '该操作尚未执行：服务端没有生成可核验的确认或成功回执。',
  };
}
