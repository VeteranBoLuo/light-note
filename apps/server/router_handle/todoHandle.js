import pool from '../db/index.js';
import { resultData, L } from '../util/common.js';
import { ensureNotVisitor } from '../util/auth.js';
import { createExportTicket, consumeExportTicket } from '../util/noteExportTickets.js';
import {
  createTodo as createTodoItem,
  batchDeleteTodos,
  batchRestoreTodos,
  batchSetTodoStatus,
  deleteTodo as deleteTodoItem,
  listTodos,
  queryTodoPendingCount,
  reorderTodos,
  restoreTodo as restoreTodoItem,
  setTodoStatus,
  snoozeTodo as snoozeTodoItem,
  updateTodo as updateTodoItem,
} from '../util/services/todoService.js';
import { completeGrowthTask } from '../util/growthTaskCompletion.js';
import {
  createTodoPlan,
  convertLegacyTodoPlan,
  deleteTodoPlan,
  previewTodoPlan,
  runIdempotentTodoMutation,
  runSeriesAction,
  skipTodoInstance,
  updateTodoPlan,
} from '../util/services/todoSeriesService.js';
import { getTodoPlanDiagnostics } from '../util/services/todoPlanDiagnosticsService.js';
import { assertTodoPlanFeatureEnabled, getTodoPlanFeatureState } from '../util/todoPlanFeature.js';

function sendTodoError(res, error) {
  const message = String(error?.message || '待办服务暂时不可用');
  const explicitStatus = Number(error?.status || 0);
  const domainError = /^TODO_[A-Z0-9_]+$/u.test(String(error?.code || ''));
  const clientError =
    /不能为空|不能超过|无效|不存在|无权操作|提醒|截止时间|清单|邮箱|渠道|周期|间隔|游标|重复任务|请选择|顺序|发生变化/.test(
      message,
    );
  const status = explicitStatus >= 400 && explicitStatus < 600 ? explicitStatus : clientError ? 400 : 500;
  const publicError = status < 500 || domainError;
  if (!publicError) console.error('[todo] 请求失败:', message);
  const responseData = publicError
    ? error?.data
      ? { ...error.data, errorCode: error?.code || null }
      : error?.code
        ? { errorCode: error.code }
        : null
    : null;
  return res.send(resultData(responseData, status, publicError ? message : '待办服务暂时不可用，请稍后重试'));
}

async function withTransaction(res, callback, { afterCommit } = {}) {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const data = await callback(connection);
    await connection.commit();
    if (afterCommit) {
      Promise.resolve()
        .then(() => afterCommit(data))
        .catch((error) => console.warn('[todo] 成长任务状态同步失败 code=%s', error?.code || 'UNKNOWN'));
    }
    return res.send(resultData(data));
  } catch (error) {
    if (connection) await connection.rollback();
    return sendTodoError(res, error);
  } finally {
    connection?.release();
  }
}

export async function listTodo(req, res) {
  // 游客只读共享示例待办；写入接口仍统一由 ensureNotVisitor 拦截。
  if (!req.user?.id) {
    return res.send(resultData({ items: [], total: 0, pendingTotal: 0 }));
  }
  try {
    const status = String(req.body?.status || 'all');
    const sort = String(req.body?.sort || 'smart');
    const keyword = String(req.body?.keyword || '')
      .trim()
      .slice(0, 100);
    const [items, pendingTotal] = await Promise.all([
      listTodos(pool, req.user.id, { status, sort, keyword }),
      queryTodoPendingCount(pool, req.user.id),
    ]);
    return res.send(resultData({ items, total: items.length, pendingTotal }));
  } catch (error) {
    return sendTodoError(res, error);
  }
}

export async function countTodo(req, res) {
  try {
    const pendingTotal = !req.user?.id ? 0 : await queryTodoPendingCount(pool, req.user.id);
    return res.send(resultData({ pendingTotal }));
  } catch (error) {
    return sendTodoError(res, error);
  }
}

export async function createTodo(req, res) {
  if (!ensureNotVisitor(req, res)) return;
  return withTransaction(res, (connection) => createTodoItem(connection, req.user.id, req.body || {}), {
    afterCommit: () => completeGrowthTask(req.user.id, 'first_todo', { userRole: req.user.role }),
  });
}

export function todoPlanConfigV2(_req, res) {
  return res.send(resultData(getTodoPlanFeatureState()));
}

/** v2 预览是唯一权威计划计算入口；不写库，可在用户确认过去日期策略前反复调用。 */
export async function previewTodoV2(req, res) {
  if (!ensureNotVisitor(req, res)) return;
  try {
    assertTodoPlanFeatureEnabled('base');
    return res.send(resultData(previewTodoPlan(req.body || {})));
  } catch (error) {
    return sendTodoError(res, error);
  }
}

export async function createTodoV2(req, res) {
  if (!ensureNotVisitor(req, res)) return;
  try {
    assertTodoPlanFeatureEnabled('base');
  } catch (error) {
    return sendTodoError(res, error);
  }
  return withTransaction(res, (connection) => createTodoPlan(connection, req.user.id, req.body || {}), {
    afterCommit: () => completeGrowthTask(req.user.id, 'first_todo', { userRole: req.user.role }),
  });
}

export async function previewLegacyConversionV2(req, res) {
  if (!ensureNotVisitor(req, res)) return;
  const legacyTodoId = String(req.body?.legacyTodoId || '').trim();
  if (!legacyTodoId) return res.send(resultData(null, 400, '缺少要转换的旧版待办 ID'));
  try {
    assertTodoPlanFeatureEnabled('conversion');
    const [rows] = await pool.query(
      `SELECT id, recurrence_rule AS recurrenceRule
         FROM todo_items
        WHERE id = ? AND user_id = ? AND COALESCE(plan_version, 1) = 1 AND del_flag = 0 LIMIT 1`,
      [legacyTodoId, req.user.id],
    );
    if (!rows[0]) return res.send(resultData(null, 404, '旧版待办不存在、已转换或无权操作'));
    const [reminderRows] = await pool.query(
      `SELECT COUNT(*) AS reminderCount FROM todo_reminders
        WHERE todo_id = ? AND user_id = ?`,
      [legacyTodoId, req.user.id],
    );
    return res.send(
      resultData({
        ...previewTodoPlan(req.body || {}),
        legacyTodoId,
        legacyHadRecurrence: Boolean(rows[0].recurrenceRule),
        legacyReminderCount: Number(reminderRows[0]?.reminderCount || 0),
      }),
    );
  } catch (error) {
    return sendTodoError(res, error);
  }
}

export async function convertLegacyTodoV2(req, res) {
  if (!ensureNotVisitor(req, res)) return;
  try {
    assertTodoPlanFeatureEnabled('conversion');
  } catch (error) {
    return sendTodoError(res, error);
  }
  return withTransaction(
    res,
    (connection) =>
      runIdempotentTodoMutation(connection, req.user.id, req.body || {}, 'convert_legacy', () =>
        convertLegacyTodoPlan(connection, req.user.id, req.body || {}),
      ),
    {
      afterCommit: () => completeGrowthTask(req.user.id, 'first_todo', { userRole: req.user.role }),
    },
  );
}

export async function updatePreviewTodoV2(req, res) {
  if (!ensureNotVisitor(req, res)) return;
  const todoId = String(req.body?.todoId || '').trim();
  if (!todoId) return res.send(resultData(null, 400, '缺少待办 ID'));
  try {
    const [rows] = await pool.query(
      `SELECT id, series_id AS seriesId FROM todo_items
        WHERE id = ? AND user_id = ? AND plan_version = 2 AND del_flag = 0 LIMIT 1`,
      [todoId, req.user.id],
    );
    if (!rows[0]) return res.send(resultData(null, 404, '待办不存在或无权操作'));
    const scope = String(req.body?.scope || 'current');
    if (!['current', 'future', 'series'].includes(scope)) return res.send(resultData(null, 400, '修改范围无效'));
    if (scope !== 'current' && !rows[0].seriesId) return res.send(resultData(null, 400, '该待办不属于任务系列'));
    return res.send(resultData({ ...previewTodoPlan(req.body || {}), todoId, scope }));
  } catch (error) {
    return sendTodoError(res, error);
  }
}

export async function updateTodoV2(req, res) {
  if (!ensureNotVisitor(req, res)) return;
  return withTransaction(res, (connection) =>
    runIdempotentTodoMutation(connection, req.user.id, req.body || {}, 'update', () =>
      updateTodoPlan(connection, req.user.id, req.body || {}),
    ),
  );
}

async function seriesActionTodoV2(req, res, action) {
  if (!ensureNotVisitor(req, res)) return;
  const input = { ...(req.body || {}), action };
  return withTransaction(res, (connection) =>
    runIdempotentTodoMutation(connection, req.user.id, input, `series_${action}`, () =>
      runSeriesAction(connection, req.user.id, input),
    ),
  );
}

export async function pauseTodoSeriesV2(req, res) {
  return seriesActionTodoV2(req, res, 'pause');
}

export async function resumeTodoSeriesV2(req, res) {
  return seriesActionTodoV2(req, res, 'resume');
}

export async function stopTodoSeriesV2(req, res) {
  return seriesActionTodoV2(req, res, 'stop');
}

export async function skipTodoInstanceV2(req, res) {
  if (!ensureNotVisitor(req, res)) return;
  const todoId = String(req.body?.todoId || '').trim();
  if (!todoId) return res.send(resultData(null, 400, '缺少待办 ID'));
  return withTransaction(res, (connection) =>
    runIdempotentTodoMutation(connection, req.user.id, req.body || {}, 'instance_skip', () =>
      skipTodoInstance(connection, req.user.id, todoId),
    ),
  );
}

export async function deleteTodoV2(req, res) {
  if (!ensureNotVisitor(req, res)) return;
  return withTransaction(res, (connection) =>
    runIdempotentTodoMutation(connection, req.user.id, req.body || {}, 'delete', () =>
      deleteTodoPlan(connection, req.user.id, req.body || {}),
    ),
  );
}

export async function todoPlanDiagnosticsV2(req, res) {
  try {
    if (!req.user?.id || req.user?.role !== 'root' || req.adminContext) {
      return res.send(resultData(null, 403, '仅 root 普通上下文可查看待办计划诊断'));
    }
    const [rows] = await pool.query('SELECT role, del_flag FROM user WHERE id = ? LIMIT 1', [req.user.id]);
    if (!rows[0] || rows[0].role !== 'root' || Number(rows[0].del_flag || 0) !== 0) {
      return res.send(resultData(null, 403, '仅 root 用户可查看'));
    }
    return res.send(resultData(await getTodoPlanDiagnostics(pool, req.body || {})));
  } catch (error) {
    console.error('[todo-plan-diagnostics] 查询失败 code=%s', error?.code || 'UNKNOWN');
    return res.send(resultData(null, 500, '待办计划诊断暂时不可用'));
  }
}

export async function updateTodo(req, res) {
  if (!ensureNotVisitor(req, res)) return;
  const id = String(req.body?.id || '').trim();
  if (!id) return res.send(resultData(null, 400, '缺少待办 ID'));
  return withTransaction(res, async (connection) => {
    const result = await updateTodoItem(connection, req.user.id, id, req.body || {});
    if (!result) throw new Error('待办不存在或无权操作');
    return result;
  });
}

export async function completeTodo(req, res) {
  if (!ensureNotVisitor(req, res)) return;
  const id = String(req.body?.id || '').trim();
  if (!id) return res.send(resultData(null, 400, '缺少待办 ID'));
  return withTransaction(res, async (connection) => ({
    affected: await setTodoStatus(connection, req.user.id, id, 'completed'),
  }));
}

export async function reopenTodo(req, res) {
  if (!ensureNotVisitor(req, res)) return;
  const id = String(req.body?.id || '').trim();
  if (!id) return res.send(resultData(null, 400, '缺少待办 ID'));
  return withTransaction(res, async (connection) => ({
    affected: await setTodoStatus(connection, req.user.id, id, 'pending'),
  }));
}

export async function deleteTodo(req, res) {
  if (!ensureNotVisitor(req, res)) return;
  const id = String(req.body?.id || '').trim();
  if (!id) return res.send(resultData(null, 400, '缺少待办 ID'));
  return withTransaction(res, async (connection) => ({
    affected: await deleteTodoItem(connection, req.user.id, id),
  }));
}

export async function restoreTodo(req, res) {
  if (!ensureNotVisitor(req, res)) return;
  const id = String(req.body?.id || '').trim();
  if (!id) return res.send(resultData(null, 400, '缺少待办 ID'));
  return withTransaction(res, async (connection) => ({
    affected: await restoreTodoItem(connection, req.user.id, id),
  }));
}

export async function batchStatusTodo(req, res) {
  if (!ensureNotVisitor(req, res)) return;
  const status = String(req.body?.status || '');
  return withTransaction(res, (connection) =>
    batchSetTodoStatus(connection, req.user.id, req.body?.ids, status, {
      undoCompletion: req.body?.undoCompletion === true,
    }),
  );
}

export async function batchDeleteTodo(req, res) {
  if (!ensureNotVisitor(req, res)) return;
  return withTransaction(res, (connection) => batchDeleteTodos(connection, req.user.id, req.body?.ids));
}

export async function batchRestoreTodo(req, res) {
  if (!ensureNotVisitor(req, res)) return;
  return withTransaction(res, (connection) => batchRestoreTodos(connection, req.user.id, req.body?.ids));
}

export async function reorderTodo(req, res) {
  if (!ensureNotVisitor(req, res)) return;
  return withTransaction(res, (connection) => reorderTodos(connection, req.user.id, req.body?.items));
}

export async function snoozeTodo(req, res) {
  if (!ensureNotVisitor(req, res)) return;
  const id = String(req.body?.id || '').trim();
  if (!id) return res.send(resultData(null, 400, '缺少待办 ID'));
  return withTransaction(res, (connection) => snoozeTodoItem(connection, req.user.id, id, req.body?.targetAt));
}

/*
 * 待办日历文件的一次性下载中转（POST 换票据 / GET 取文件）。
 *
 * 只为 Android App 而存在：App 的 WebView 落不了 blob —— `a[download]` 的 blob 地址确实会进
 * 原生 DownloadListener，但 `WebViewSupport.download` 第一行的 isHttpUrl 只认 http(s)，
 * 被挡掉后只弹一句「无法开始下载」，一个字节也不落盘（真机实测）。换成 http 地址后由系统
 * DownloadManager 存进「下载」目录，用户点开即可导入日历。
 *
 * 为什么不干脆用一键「加入日历」替掉这条：那条走原生 ACTION_INSERT，intent 没有「提前多少
 * 分钟提醒」的标准 extra，提醒会丢。.ics 里的 VALARM 能带上提醒，所以两条路并存。
 * 也覆盖了还没升级到带 ACTION_INSERT 版本的存量装机。
 *
 * .ics 内容由前端生成：那份 RFC 5545 生成器（web/utils/ics.ts）带着浮动时间语义和整套单测，
 * 在服务端再实现一遍只会让两处慢慢漂移。
 */

/** .ics 是纯文本日程，正常几百字节；给到 64KB 已经很宽，超了必然是异常输入。 */
const MAX_CALENDAR_BYTES = 64 * 1024;

/**
 * 落盘文件名清洗：去掉控制字符与文件系统非法字符，折叠空白并限长，统一补 .ics。
 * 不信前端传来的名字 —— 它会被交给 DownloadManager 直接当落盘路径用。
 */
function sanitizeCalendarFileName(value) {
  const base = Array.from(String(value ?? ''))
    .filter((char) => char.charCodeAt(0) >= 32)
    .join('')
    .replace(/\.ics$/i, '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const limited = Array.from(base).slice(0, 60).join('').trim();
  return `${limited || '待办'}.ics`;
}

export async function createTodoCalendarTicket(req, res) {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const userId = req.user.id;
    const todoId = String(req.body?.id || '').trim();
    const contentBase64 = req.body?.contentBase64;
    if (!todoId || typeof contentBase64 !== 'string' || !contentBase64) {
      return res.send(resultData(null, 400, L(req, '参数错误', 'Invalid parameters')));
    }
    // 先按 base64 长度估算再解码：超限内容不该先被解成大 Buffer 才拒绝
    if (Math.floor((contentBase64.length * 3) / 4) > MAX_CALENDAR_BYTES) {
      return res.send(resultData(null, 413, L(req, '日历内容过大', 'The calendar file is too large')));
    }

    // 归属校验：只能导出自己的待办
    const [own] = await pool.query('SELECT id FROM todo_items WHERE id = ? AND user_id = ? AND del_flag = 0', [
      todoId,
      userId,
    ]);
    if (own.length === 0) {
      return res.send(resultData(null, 404, L(req, '待办不存在', 'Todo not found')));
    }

    const content = Buffer.from(contentBase64, 'base64');
    if (!content.length || content.length > MAX_CALENDAR_BYTES) {
      return res.send(resultData(null, 400, L(req, '日历内容无效', 'Invalid calendar content')));
    }

    const fileName = sanitizeCalendarFileName(req.body?.fileName);
    const { token, expiresIn } = await createExportTicket({
      userId,
      resourceId: todoId,
      format: 'ics',
      fileName,
      content,
    });

    // token 放 query 而不是路径段：路径里带随机值会让每次导出都是一个「新路径」，
    // 触发安全中间件的接口枚举检测，正常使用也可能被误判封 IP。
    res.send(
      resultData({
        downloadUrl: `/api/todo/exportCalendar?token=${encodeURIComponent(token)}`,
        fileName,
        expiresIn,
      }),
    );
  } catch (error) {
    console.error('[todo] 创建日历导出票据失败:', error?.code || error?.message || 'UNKNOWN');
    return res.send(resultData(null, 500, L(req, '导出失败，请稍后重试', 'Export failed, please try again later')));
  }
}

export async function downloadTodoCalendarFile(req, res) {
  /*
   * 这个端点由系统 DownloadManager（而不是页面 fetch）请求，所以必须用真实 HTTP 状态码：
   * 沿用「HTTP 200 + body.status」的接口惯例会把一段 JSON 原样存成用户的日历文件。
   * 也因此不能复用 ensureNotVisitor。
   */
  if (!req.user?.id || req.user.role === 'visitor') {
    return res
      .status(403)
      .type('text/plain')
      .send(L(req, '请登录后再导出日历', 'Please sign in before exporting the calendar'));
  }
  try {
    const ticket = await consumeExportTicket(req.query?.token, req.user.id);
    if (!ticket) {
      // 故意不用 404：安全中间件按 5 分钟内 404 次数判「扫描器」并累积 IP 信誉分，
      // 用户重复点导出踩到过期票据不该把自己的 IP 送进封禁名单。410 语义也更准确。
      return res
        .status(410)
        .type('text/plain')
        .send(L(req, '下载链接已失效，请重新导出', 'This download link has expired, please export again'));
    }

    /*
     * 这里给 text/calendar 而不是 octet-stream：Android 要靠类型/扩展名才会把「用日历打开」
     * 提给用户，octet-stream 会退化成一个点不开的文件。日历文本不会被浏览器当 HTML 渲染，
     * 没有笔记导出 HTML 那种站内 XSS 顾虑；nosniff + attachment 仍然都留着。
     */
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Length', String(ticket.content.length));
    res.setHeader(
      'Content-Disposition',
      // filename* 走 RFC 5987 让中文名在浏览器直连时也正确；App 内的文件名由原生桥另行指定
      `attachment; filename="todo.ics"; filename*=UTF-8''${encodeURIComponent(ticket.fileName)}`,
    );
    res.end(ticket.content);
  } catch (error) {
    console.error('[todo] 日历文件下载失败:', error?.code || error?.message || 'UNKNOWN');
    res
      .status(500)
      .type('text/plain')
      .send(L(req, '下载失败，请重新导出', 'Download failed, please export again'));
  }
}
