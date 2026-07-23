const RESOURCE_OR_ACTION_PATTERN =
  /(?:我的|我有|轻笺|笔记|书签|收藏夹|文件|云空间|文件夹|标签|回收站|待办|任务|提醒|AI\s*额度|等级|经验|积分|通知|设备|反馈|用户|日志|安全|后台|管理员|数据库|今日|今天|最近|本周|上周|本月|上月|多少(?:条|个|篇|次)?|统计|查询|搜索|查找|列出|读取|打开|收藏|保存|创建|新建|恢复|删除|上传|归档|整理到|https?:\/\/|www\.)/i;

const HIGH_CONFIDENCE_DIRECT_PATTERNS = [
  /^(?:你好|您好|嗨|哈喽|hello|hi|hey)(?:[!！,.，。\s].*)?$/i,
  /^(?:谢谢|感谢|辛苦了|再见|拜拜)(?:[!！,.，。\s].*)?$/i,
  /^(?:你是谁|你能做什么|怎么称呼你|介绍一下你自己)[?？!！。\s]*$/i,
  /^(?:请)?(?:解释|介绍|说明|比较|分析)(?:一下)?\s*.+/i,
  /^(?:什么是|为什么|如何理解|怎么理解|给我讲讲)\s*.+/i,
  /^(?:(?:请|帮我|能否|可以)?\s*)?(?:写|改写|润色|翻译|总结|起草|拟定)\s*.+/i,
];

/**
 * 只对高置信、且不涉及用户私有资源或业务动作的问题跳过 Planner。
 * 误判成本高，因此任何资源词、时间统计词、URL 或显式上下文都会回到完整工具路由。
 */
export function decideDirectAgentRoute({ message, contextCount = 0, attachmentCount = 0, translation = false } = {}) {
  const text = String(message || '').trim();
  if (!text) return { direct: false, reason: 'empty' };
  if (translation) return { direct: true, reason: 'translation' };
  if (Number(contextCount) > 0 || Number(attachmentCount) > 0) {
    return { direct: false, reason: 'explicit_context' };
  }
  if (RESOURCE_OR_ACTION_PATTERN.test(text)) return { direct: false, reason: 'resource_or_action_intent' };
  if (HIGH_CONFIDENCE_DIRECT_PATTERNS.some((pattern) => pattern.test(text))) {
    return { direct: true, reason: 'high_confidence_general' };
  }
  if (text.length <= 500 && /[?？]$/.test(text)) return { direct: true, reason: 'short_general_question' };
  return { direct: false, reason: 'uncertain' };
}
