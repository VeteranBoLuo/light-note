import { AGENT_ACTION_CAPABILITIES, matchesAgentCapability } from './capabilityRegistry.js';

const COMMAND_MARKER =
  /(?:帮我|请|麻烦|把|将|给我|替我|为我|立即|直接|执行|去做|please|help\s+me|can\s+you|could\s+you|go\s+ahead)/i;
const ACTION_OPERATION =
  /(?:创建|新建|新增|添加|写入|收藏|保存|上传|修改|更新|编辑|重命名|改名|移动|归档|置顶|关联|解绑|替换|整理|设置|更改|删除|删掉|移除|清除|清空|销毁|注销|恢复|还原|完成|重新打开|标记|关闭|开启|启用|禁用|分享|发布|发送|同步|合并|领取|补发|重置|create|add|save|upload|update|edit|rename|move|archive|pin|link|replace|set|delete|remove|clear|erase|restore|recover|complete|reopen|mark|disable|enable|share|publish|send|sync|merge|grant|reset)/i;
const MANAGED_RESOURCE =
  /(?:笔记|文档|书签|收藏|网址|链接|附件|文件|文件夹|云空间|标签|回收站|待办|任务|提醒|通知|待整理|收集箱|知识库|帮助中心|账号|账户|密码|邮箱|登录设备|权限|角色|用户|管理员|积分|经验|等级|签到|抽奖|奖励|额度|note|document|bookmark|favorite|url|link|attachment|file|folder|cloud|tag|trash|todo|task|reminder|notification|inbox|knowledge\s+base|help\s+center|account|password|email|device|permission|role|user|admin|points|experience|level|check-in|lottery|reward|quota)/i;
const DEICTIC_TARGET = /(?:这个|那个|它|这些|那些|当前项|刚才的|选中的|this|that|it|these|those|selected)/i;
const CHINESE_READ_QUERY_VERB =
  /(?:查询|查找|查一下|查查|查看|看看|看一下|列出|列一下|罗列|展示|显示|统计|汇总|盘点|检索|搜索|找出|找一下|读取|浏览|告诉我|列给我)/i;
const ENGLISH_READ_QUERY_VERB =
  /\b(?:show(?:\s+me)?|list|find|search|view|display|read|browse|count|summari[sz]e|tell\s+me)\b/i;
const CHINESE_READ_RESULT_MARKER =
  /(?:有哪些|有什么|有多少|多少(?:个|条|项|篇|份)?|哪(?:些|个|条|项|篇|份)|分别是|是什么|列表|清单|记录|历史|详情|情况|进度)/i;
const ENGLISH_READ_RESULT_MARKER = /\b(?:which|what|how\s+many)\b/i;
const STATE_FILTER_RESOURCE =
  /(?:(?:已|未|尚未|已经|曾经).{0,6}(?:创建|新建|添加|收藏|保存|上传|修改|更新|删除|移除|恢复|完成|处理|归档|同步)(?:的)?|(?:创建|新建|添加|收藏|保存|上传|修改|更新|删除|移除|恢复|完成|处理|归档|同步)(?:过)?的).{0,12}(?:笔记|文档|书签|收藏|网址|链接|附件|文件|标签|回收站内容|待办|任务|提醒|通知|待整理内容|知识库|帮助中心)/i;
const ENGLISH_STATE_FILTER_RESOURCE =
  /\b(?:created|added|saved|uploaded|updated|deleted|removed|restored|completed|archived|synced|pending)\b.{0,30}\b(?:notes?|documents?|bookmarks?|links?|attachments?|files?|tags?|trash|todos?|tasks?|reminders?|notifications?|inbox\s+items?|knowledge\s+base)\b/i;
const QUERY_THEN_MUTATION =
  /(?:并且|然后|接着|随后|之后|后再|同时|再|并)\s*(?:请|帮我|替我|给我)?\s*(?:(?:把|将)[^，。！？,.!?]{0,24})?(?:创建|新建|新增|添加|写入|收藏|保存|上传|修改|更新|编辑|重命名|改名|移动|归档|置顶|关联|解绑|替换|设置|更改|删除|删掉|移除|清除|清空|销毁|恢复|还原|完成|重新打开|标记|关闭|开启|启用|禁用|分享|发布|发送|同步|合并|领取|补发|重置)|\b(?:and\s+then|then|and)\b.{0,30}\b(?:create|add|save|upload|update|edit|rename|move|archive|pin|link|replace|set|delete|remove|clear|erase|restore|recover|complete|reopen|mark|disable|enable|share|publish|send|sync|merge|grant|reset)\b/i;
const DIRECT_MUTATION_PREFIX =
  /^(?:请|麻烦|帮我|替我|给我|为我|现在|立即|直接|执行|去)?\s*(?:把|将)?\s*(?:创建|新建|新增|添加|写入|收藏|保存|上传|修改|更新|编辑|重命名|改名|移动|归档|置顶|关联|解绑|替换|整理|设置|更改|删除(?!的)|删掉|移除(?!的)|清除|清空|销毁|注销|恢复|还原|完成(?!的)|重新打开|标记|关闭|开启|启用|禁用|分享|发布|发送|同步|合并|领取|补发|重置)/i;
const ENGLISH_DIRECT_MUTATION_PREFIX =
  /^(?:please\s+|now\s+|immediately\s+)?(?:create|add|save|upload|update|edit|rename|move|archive|pin|link|replace|set|delete|remove|clear|erase|restore|recover|complete|reopen|mark|disable|enable|share|publish|send|sync|merge|grant|reset)\b/i;

const ACTION_HOW_TO_QUESTION = [
  /^(?:怎么|如何|怎样|从哪里|在哪里|在哪|为什么|什么是|是否支持|支不支持|能否|能不能|可不可以|是否可以|可以在轻笺里).{0,80}(?:删除|修改|创建|恢复|移动|设置|完成|上传|保存)/i,
  /^(?:(?:请|麻烦)?(?:告诉|说明|解释|演示)(?:我)?|帮我(?:看看|了解|查一下)).{0,40}(?:怎么|如何|怎样|从哪里|在哪里|在哪).{0,80}(?:删除|修改|创建|恢复|移动|设置|完成|上传|保存)/i,
  /(?:删除的|已删除|删掉的).{0,40}(?:在哪|哪里|怎么找|如何找|能否找回|怎么恢复)/i,
  /(?:教程|步骤|方法|入口|功能).{0,20}[?？]?$/i,
  /^(?:how\s+(?:do|can)\s+i|where\s+(?:can|do)\s+i|does\s+.+\s+support|what\s+is).{0,120}(?:delete|update|create|restore|move|set|complete|upload|save)/i,
  /^(?:please\s+)?(?:tell|show|explain).{0,40}how\s+to.{0,80}(?:delete|update|create|restore|move|set|complete|upload|save)/i,
];
const STATUS_QUESTION =
  /(?:是否|是不是|有没有|完成了没|成功了吗|做了吗|删除了吗|修改了吗|创建了吗|保存了吗|状态(?:是|如何|怎样)?).*[?？]?$|(?:了吗|了么|没有|没成功|did\s+.+\?|was\s+.+\?|has\s+.+\?)[?？]?$/i;
const PAST_ACTION_STATEMENT =
  /^(?:我|我们|用户|i|we)\s*(?:刚刚?|已经|之前|刚才|just|already|previously).{0,80}(?:了|完成|删除|修改|创建|保存|deleted|updated|created|saved)/i;

function normalizeContextTypes(contextTypes) {
  return [
    ...new Set(
      (Array.isArray(contextTypes) ? contextTypes : [])
        .map((item) =>
          String(item || '')
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    ),
  ];
}

function isReadOnlyActionSpeechAct(text) {
  if (!text) return false;
  if (ACTION_HOW_TO_QUESTION.some((pattern) => pattern.test(text))) return true;
  if (STATUS_QUESTION.test(text)) return true;
  if (QUERY_THEN_MUTATION.test(text)) return false;
  const hasManagedResource = MANAGED_RESOURCE.test(text);
  const hasReadQuerySignal =
    CHINESE_READ_QUERY_VERB.test(text) ||
    ENGLISH_READ_QUERY_VERB.test(text) ||
    CHINESE_READ_RESULT_MARKER.test(text) ||
    ENGLISH_READ_RESULT_MARKER.test(text);
  if (hasManagedResource && hasReadQuerySignal) return true;
  if (
    hasManagedResource &&
    (STATE_FILTER_RESOURCE.test(text) || ENGLISH_STATE_FILTER_RESOURCE.test(text)) &&
    !COMMAND_MARKER.test(text) &&
    !DIRECT_MUTATION_PREFIX.test(text) &&
    !ENGLISH_DIRECT_MUTATION_PREFIX.test(text)
  ) {
    return true;
  }
  if (COMMAND_MARKER.test(text)) return false;
  return PAST_ACTION_STATEMENT.test(text);
}

function capabilityPriority(status) {
  if (status === 'forbidden') return 3;
  if (status === 'enabled') return 2;
  if (status === 'planned') return 1;
  return 0;
}

/**
 * 在 Planner 之前把自然语言划分为普通查询或数据动作。
 * 任意已知能力、通用“动作 + 资源”组合，或“命令标记 + 动作 + 指代目标”都会进入动作通道；
 * 未注册的动作失败关闭，绝不落入自由 Final Reply。
 */
export function resolveAgentActionIntent({ message, contextTypes = [] } = {}) {
  const text = String(message || '').trim();
  const normalizedContextTypes = normalizeContextTypes(contextTypes);
  if (!text) {
    return { kind: 'none', resolution: 'none', capabilities: [], toolNames: [], reason: 'empty' };
  }
  if (isReadOnlyActionSpeechAct(text)) {
    return { kind: 'query', resolution: 'none', capabilities: [], toolNames: [], reason: 'read_only_speech_act' };
  }

  const matches = AGENT_ACTION_CAPABILITIES.filter((capability) =>
    matchesAgentCapability(capability, text, normalizedContextTypes),
  );
  if (matches.length) {
    const highestPriority = Math.max(...matches.map((item) => capabilityPriority(item.status)));
    const selected = matches.filter((item) => capabilityPriority(item.status) === highestPriority);
    const resolution = selected[0].status;
    return {
      kind: 'action',
      resolution,
      capabilities: selected,
      toolNames: [
        ...new Set(
          selected
            .filter((item) => item.status === 'enabled')
            .map((item) => item.toolName)
            .filter(Boolean),
        ),
      ],
      reason: `capability_${resolution}`,
    };
  }

  const hasOperation = ACTION_OPERATION.test(text);
  const hasResource = MANAGED_RESOURCE.test(text) || normalizedContextTypes.length > 0;
  const hasPointingCommand = COMMAND_MARKER.test(text) && DEICTIC_TARGET.test(text);
  if (hasOperation && (hasResource || hasPointingCommand)) {
    return {
      kind: 'action',
      resolution: 'unknown_mutation',
      capabilities: [],
      toolNames: [],
      reason: hasResource ? 'generic_operation_resource' : 'generic_operation_reference',
    };
  }

  return { kind: 'none', resolution: 'none', capabilities: [], toolNames: [], reason: 'no_action_signal' };
}

function localizedCapabilityText(capability, locale, field) {
  const english = String(locale || '')
    .toLowerCase()
    .startsWith('en');
  const value = capability?.[field] || {};
  return String(value[english ? 'en' : 'zh'] || value.zh || value.en || '').trim();
}

export function buildAgentActionPolicyMessage(intent, locale = 'zh-CN') {
  const english = String(locale || '')
    .toLowerCase()
    .startsWith('en');
  const capability = intent?.capabilities?.[0] || null;
  const label = localizedCapabilityText(capability, locale, 'labels');
  const guidance = localizedCapabilityText(capability, locale, 'guidance');

  if (intent?.resolution === 'forbidden') {
    return english
      ? `AI is not allowed to ${label || 'perform this operation'} for safety reasons. No data was changed.${
          guidance ? ` ${guidance}` : ''
        }`
      : `出于安全原因，AI 不允许执行“${label || '这项操作'}”。本次没有修改任何数据。${guidance ? ` ${guidance}` : ''}`;
  }
  if (intent?.resolution === 'planned') {
    return english
      ? `AI does not currently support ${label || 'this operation'}, so nothing was executed.${
          guidance ? ` ${guidance}` : ''
        }`
      : `当前 AI 暂不支持“${label || '这项操作'}”，因此没有执行任何操作。${guidance ? ` ${guidance}` : ''}`;
  }
  if (intent?.resolution === 'unknown_mutation') {
    return english
      ? 'This appears to be a request to change data, but AI has no registered safe capability for it. Nothing was executed. Please use the relevant product page or describe the target more precisely.'
      : '这看起来是一项数据修改请求，但 AI 没有找到已注册且可安全执行的对应能力，因此没有执行任何操作。请前往对应功能页面处理，或更明确地说明操作目标。';
  }
  if (intent?.resolution === 'unverified') {
    return english
      ? 'The action was not executed because the server did not produce a verifiable confirmation. Please restate the target and try again.'
      : '该操作尚未执行：服务端没有生成可核验的确认，请明确目标后重试。';
  }
  return english
    ? 'No operation was executed because its state could not be verified.'
    : '由于无法核验操作状态，本次没有执行任何操作。';
}
