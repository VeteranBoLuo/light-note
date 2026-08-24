import { L, resultData } from '../util/common.js';
import { ensureNotVisitor } from '../util/auth.js';
import { resolveTagIcon, searchTagIcons } from '../util/tagIconService.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';
import crypto from 'node:crypto';
import { runAiExecution } from '../util/aiExecution/service.js';
import { resolvePublicAiExecutionError } from '../util/aiExecution/publicError.js';

function ensureIconAccess(req, res) {
  // 管理员上下文已由 adminRoutePolicy 的 AI_USE 策略校验；搜索与解析本身不写用户数据。
  if (req.adminContext) return true;
  return ensureNotVisitor(req, res);
}

function friendlyError(req, error) {
  const code = String(error?.message || '');
  if (code === 'ICON_QUERY_REQUIRED') return L(req, '请输入图标搜索内容', 'Please enter an icon search query');
  if (code === 'ICON_NAME_INVALID') return L(req, '图标名称无效', 'Invalid icon name');
  if (code === 'ICON_NOT_FOUND') return L(req, '没有找到该图标', 'Icon not found');
  if (code.startsWith('ICON_SVG_')) return L(req, '图标内容不安全或不可用', 'The icon is unsafe or unavailable');
  return L(req, '图标服务暂不可用，请稍后重试', 'The icon service is temporarily unavailable');
}

export async function search(req, res) {
  if (!ensureIconAccess(req, res)) return;
  try {
    const requestId = crypto.randomUUID();
    return res.send(
      resultData(
        await runAiExecution(
          {
            requestId,
            request: req,
            identity: req.billingUser || req.user,
            subjectIdentity: req.resourceUser || req.user,
            billingPolicy: 'user',
            taskType: 'tag_icon_search',
            skillId: 'tag.icon_keywords',
            skillVersion: 1,
            surface: 'tag_icon_picker',
          },
          () =>
            searchTagIcons({
              query: req.body?.query,
              page: req.body?.page,
              trace: { traceId: requestId, taskType: 'tag_icon_search', stage: 'tag_icon_keywords' },
            }),
        ),
      ),
    );
  } catch (error) {
    const failure = resolvePublicAiExecutionError(error, friendlyError(req, error));
    if (failure.status >= 500) console.error('[tag-icon] 搜索失败 code=%s', stableAgentErrorCode(error));
    return res
      .status(failure.status)
      .send(resultData({ code: failure.code }, failure.status, failure.message));
  }
}

export async function resolve(req, res) {
  if (!ensureIconAccess(req, res)) return;
  try {
    return res.send(resultData(await resolveTagIcon(req.body?.icon)));
  } catch (error) {
    console.error('[tag-icon] 获取图标失败 code=%s', stableAgentErrorCode(error));
    const status = ['ICON_NAME_INVALID', 'ICON_NOT_FOUND'].includes(error.message) ? 400 : 500;
    return res.status(status).send(resultData(null, status, friendlyError(req, error)));
  }
}
