import { apiBasePost } from '@/http/request.ts';

/**
 * AI 监控的结果轮廓与动作链路展示口径（桌面端与移动端共用）。
 *
 * 后端 status 有 20 多种内部取值（含动态的 semantic_*），outcomeKind 是收敛后的固定枚举，
 * 回答「这轮到底产出了什么」。tone 只用于选实色，状态标记不依赖混色——APK 的系统 WebView
 * 会把 color-mix 回退成实色，混色表达的差异会整体消失。
 */
export type AgentLogOutcomeTone = 'success' | 'warning' | 'danger' | 'neutral';

interface OutcomeMeta {
  label: string;
  tone: AgentLogOutcomeTone;
  hint: string;
}

const OUTCOME_META: Record<string, OutcomeMeta> = {
  answer: { label: '已回复', tone: 'success', hint: '产出了对话正文' },
  confirmation_card: { label: '已发确认卡', tone: 'warning', hint: '等待用户确认后才会执行写操作' },
  interaction_card: { label: '已发选择卡', tone: 'warning', hint: '等待用户做出选择' },
  rejected: { label: '用户驳回', tone: 'neutral', hint: '用户取消了这次操作' },
  action_only: { label: '仅动作', tone: 'success', hint: '完成了动作或后台任务，本轮没有对话正文' },
  error: { label: '出错', tone: 'danger', hint: '本轮以错误结束' },
  aborted: { label: '已中断', tone: 'danger', hint: '客户端断开或超时' },
  blocked: { label: '额度拦截', tone: 'warning', hint: '被 AI 额度门禁挡下，未调用模型' },
  empty: { label: '无产出', tone: 'danger', hint: '既没有正文也没有成功的动作' },
};

const UNKNOWN_OUTCOME: OutcomeMeta = { label: '未记录', tone: 'neutral', hint: '本条记录早于结果轮廓上线' };

export function outcomeMeta(kind: unknown): OutcomeMeta {
  const key = String(kind || '');
  return OUTCOME_META[key] || UNKNOWN_OUTCOME;
}

export function formatDeliveredLabel(delivered: unknown) {
  if (delivered == null) return '未记录';
  return Number(delivered) === 1 || delivered === true ? '已送达客户端' : '未送达（连接已断开）';
}

export function formatAnswerChars(record: any) {
  // null 是「这条记录早于字段上线」，0 是「本轮确实一个字都没产出」，两者不能混成同一个显示。
  if (record?.answerChars == null) return '未记录';
  const chars = Number(record.answerChars);
  if (!Number.isFinite(chars)) return '未记录';
  return `${chars.toLocaleString()} 字`;
}

/**
 * 摘要为空有两种含义，必须区分：本轮压根没有正文，还是摘要已过保留期被清空。
 * answerChars 是长期保留的轮廓字段，用它来判别。
 */
export function formatAnswerDigest(record: any) {
  const digest = String(record?.answerDigest || '').trim();
  if (digest) return digest;
  if (Number(record?.answerChars) > 0) return '摘要已过保留期，仅保留字数与结果类型';
  return '本轮没有对话正文';
}

export interface AgentLogChainStep {
  id: string;
  at: string;
  title: string;
  detail: string;
  tone: AgentLogOutcomeTone;
  isCurrent: boolean;
}

function toolNamesOf(toolsUsed: unknown) {
  try {
    const parsed = JSON.parse(String(toolsUsed || '[]'));
    if (!Array.isArray(parsed)) return '';
    return parsed.map((tool: any) => String(tool?.name || '')).filter(Boolean).join('、');
  } catch {
    return '';
  }
}

/**
 * 把链路上的一条记录翻译成人话。发卡与用户处置是两个独立请求，
 * 只有连起来读才能看出「卡发出去了 → 用户点了确认 → 执行成功」。
 */
function describeChainStep(row: any): { title: string; detail: string; tone: AgentLogOutcomeTone } {
  const taskType = String(row?.taskType || '');
  const status = String(row?.status || '');
  const kind = String(row?.outcomeKind || '');
  const tools = toolNamesOf(row?.toolsUsed);
  const withTool = (text: string) => (tools ? `${text}（${tools}）` : text);
  const settlement = taskType === 'agent_confirmation' || taskType === 'agent_interaction';

  if (kind === 'confirmation_card') {
    return {
      title: withTool('发出确认卡'),
      detail: Number(row?.delivered) === 0 ? '生成成功，但连接已断开，用户没有收到' : '已下发，等待用户处置',
      tone: Number(row?.delivered) === 0 ? 'danger' : 'warning',
    };
  }
  if (kind === 'interaction_card') {
    return { title: withTool('发出选择卡'), detail: '已下发，等待用户选择', tone: 'warning' };
  }
  if (settlement && status === 'confirmation_rejected') {
    return { title: withTool('用户驳回'), detail: '操作已取消，未执行写入', tone: 'neutral' };
  }
  if (settlement && status === 'interaction_cancelled') {
    return { title: '用户取消选择', detail: '未进入写操作', tone: 'neutral' };
  }
  if (settlement && status === 'success') {
    return { title: withTool('用户确认，执行成功'), detail: '写操作已落库', tone: 'success' };
  }
  if (settlement && status === 'error') {
    return {
      title: withTool('用户确认，执行失败'),
      detail: String(row?.errorMsg || '未记录错误码'),
      tone: 'danger',
    };
  }

  const meta = outcomeMeta(kind);
  return {
    title: status === 'success' ? '本轮问答' : `本轮问答 · ${status || '未知状态'}`,
    detail: row?.errorMsg ? String(row.errorMsg) : meta.hint,
    tone: meta.tone,
  };
}

export function buildChainSteps(rows: any[], currentId: unknown): AgentLogChainStep[] {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const described = describeChainStep(row);
    return {
      id: String(row?.id || ''),
      at: row?.createdAt ? new Date(row.createdAt).toLocaleString('zh-CN') : '',
      ...described,
      isCurrent: String(row?.id || '') === String(currentId || ''),
    };
  });
}

/**
 * 拉取同一条动作链路。链路只有 2~4 条记录，后端不分页；
 * 单条问答（correlationId 等于自身 requestId 且没有确认卡）没有链路可看，直接跳过请求。
 */
export async function fetchAgentLogChain(record: any): Promise<AgentLogChainStep[]> {
  const correlationId = String(record?.correlationId || '').trim();
  if (!correlationId) return [];
  const hasAction = Boolean(record?.confirmationId) || correlationId !== String(record?.requestId || '');
  if (!hasAction) return [];
  const res: any = await apiBasePost('/api/common/getAgentLogChain', { correlationId }, { silent: true });
  if (res?.status !== 200) return [];
  const items = Array.isArray(res.data?.items) ? res.data.items : [];
  // 只有一条时说明链路里只有它自己，没有可展示的「发卡 → 处置」关系。
  return items.length > 1 ? buildChainSteps(items, record?.id) : [];
}
