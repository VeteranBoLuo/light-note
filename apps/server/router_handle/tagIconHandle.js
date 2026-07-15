import { L, resultData } from '../util/common.js';
import { ensureNotVisitor } from '../util/auth.js';
import { resolveTagIcon, searchTagIcons } from '../util/tagIconService.js';

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
    return res.send(resultData(await searchTagIcons({ query: req.body?.query, page: req.body?.page })));
  } catch (error) {
    console.error('[tag-icon] 搜索失败:', error.message);
    return res.status(500).send(resultData(null, 500, friendlyError(req, error)));
  }
}

export async function resolve(req, res) {
  if (!ensureIconAccess(req, res)) return;
  try {
    return res.send(resultData(await resolveTagIcon(req.body?.icon)));
  } catch (error) {
    console.error('[tag-icon] 获取图标失败:', error.message);
    const status = ['ICON_NAME_INVALID', 'ICON_NOT_FOUND'].includes(error.message) ? 400 : 500;
    return res.status(status).send(resultData(null, status, friendlyError(req, error)));
  }
}
