/**
 * App 内「加入日历」：把待办递给系统日历的新建事件页。
 *
 * 原生走 `Intent.ACTION_INSERT`（见 WebViewSupport.insertCalendarEvent），由系统日历完成写入，
 * 零新增权限——直接写 CalendarContract 需要 WRITE_CALENDAR 危险权限，会动到对外公示且已备案的
 * 权限清单（config/androidRelease.ts）。
 *
 * **提前提醒预填不了**：intent 没有这个标准 extra。要带提醒的场景仍然走 .ics（VALARM 在文件里），
 * 所以这条路是「快」，.ics 那条是「全」，两条并存，别把 .ics 撤掉。
 *
 * 能力协商沿用 image.save 的做法（见 androidBridge.ts 的说明）：带 token 发出去、等原生回传结果，
 * 旧版 App 收到未知类型会直接忽略、什么都不回，等不到就按不支持处理并回落。不靠 UA 里的版本号，
 * 因为 debug 与正式版 versionName 相同、分辨不出来。
 *
 * 这里刻意不写进 androidBridge.ts：那个文件正被另一路改动占用，独立成文件可以少一次合并冲突。
 */

import { apiBasePost } from '@/http/request';
import { hasAndroidBridge, postAndroidMessage } from '@/utils/androidBridge';
import { encodeFileContentToBase64 } from '@/utils/fileDelivery';

export interface AndroidCalendarInsertResult {
  ok: boolean;
  /**
   * `unsupported` —— 旧版 App 没有这条通道、压根不回复，由超时收口；
   * `failed` —— App 支持，但设备上没有能接 ACTION_INSERT 的日历应用（鸿蒙 + 卓易通这类
   * 兼容层容器里很常见）。两者出路不同，调用方要分开提示。
   */
  reason?: 'unsupported' | 'failed';
}

declare global {
  interface Window {
    /** 原生 → 网页的日历结果回调，由本模块装上 */
    __lightNoteAndroidCalendarResult?: (raw: unknown) => void;
  }
}

/*
 * 比 image.save 的 8s 短得多：那边要等原生把 base64 解码写进相册，这边只是发一个本地 intent，
 * 支持的版本毫秒级就回了。超时在这条路上只可能意味着「旧版 App 根本没有这个分支」，
 * 让用户对着按钮干等 8 秒没有任何意义。
 */
const CALENDAR_INSERT_TIMEOUT_MS = 2500;

/*
 * 本次会话内记住「这个 App 版本没有这条通道」，之后直接不显示「加入日历」按钮。
 * 存量 1.0.0 有桥但没有 calendar.insert 分支，不记的话每次打开弹窗都摆一个点了必然失败的按钮。
 * 只存在内存里：用户升级 APK 后重开页面就会重新探测。
 */
let bridgeMissingCalendarChannel = false;

const pendingInserts = new Map<string, (result: AndroidCalendarInsertResult) => void>();
let resultHookInstalled = false;

function ensureResultHook() {
  if (resultHookInstalled || typeof window === 'undefined') return;
  resultHookInstalled = true;
  window.__lightNoteAndroidCalendarResult = (raw: unknown) => {
    if (!raw || typeof raw !== 'object') return;
    const source = raw as Record<string, unknown>;
    const token = typeof source.token === 'string' ? source.token : '';
    const settle = pendingInserts.get(token);
    if (!settle) return;
    pendingInserts.delete(token);
    settle({
      ok: source.ok === true,
      reason: source.ok === true ? undefined : source.reason === 'failed' ? 'failed' : 'unsupported',
    });
  };
}

export interface AndroidCalendarEvent {
  title: string;
  description?: string;
  location?: string;
  /** 事件开始的毫秒时间戳 */
  beginTime: number;
  /** 事件结束的毫秒时间戳；不大于 beginTime 时原生不带这个 extra，由日历应用取默认时长 */
  endTime?: number;
}

export function canInsertAndroidCalendarEvent(): boolean {
  return hasAndroidBridge() && !bridgeMissingCalendarChannel;
}

export function insertAndroidCalendarEvent(
  event: AndroidCalendarEvent,
): Promise<AndroidCalendarInsertResult> {
  return new Promise((resolve) => {
    if (!hasAndroidBridge() || !Number.isFinite(event.beginTime) || event.beginTime <= 0) {
      resolve({ ok: false, reason: 'unsupported' });
      return;
    }
    ensureResultHook();
    const token = `cal-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    let settled = false;
    const settle = (result: AndroidCalendarInsertResult) => {
      if (settled) return;
      settled = true;
      pendingInserts.delete(token);
      resolve(result);
    };
    pendingInserts.set(token, settle);
    setTimeout(() => {
      // 只有「等不到回复」才判定这个版本没这条通道；原生明确回 failed 说明通道在，只是没日历应用
      bridgeMissingCalendarChannel = true;
      settle({ ok: false, reason: 'unsupported' });
    }, CALENDAR_INSERT_TIMEOUT_MS);

    const delivered = postAndroidMessage({
      type: 'calendar.insert',
      token,
      title: event.title || '',
      description: event.description || '',
      location: event.location || '',
      beginTime: Math.round(event.beginTime),
      endTime: Number.isFinite(event.endTime) ? Math.round(Number(event.endTime)) : 0,
    });
    if (!delivered) settle({ ok: false, reason: 'unsupported' });
  });
}

export type AndroidIcsDeliveryOutcome =
  | { ok: true }
  | { ok: false; reason: 'too_large' | 'request_failed' | 'bridge_failed'; message?: string };

/**
 * 把 .ics 送进 App 的系统下载目录。
 *
 * 和「加入日历」并存的那条路：文件里带着 VALARM 提前提醒（intent 预填不了提醒），
 * 也覆盖还没升级到带 ACTION_INSERT 版本的存量装机。做法与笔记导出同构 ——
 * 内容换成一次性 http 地址，交给已有的 `{type:'download'}` 桥走系统 DownloadManager。
 *
 * 成功只代表已交给 DownloadManager 排队，真正落盘由原生的下载通知/进度卡片告知。
 */
export async function deliverIcsViaAndroidBridge(options: {
  todoId: string;
  content: string;
  fileName: string;
}): Promise<AndroidIcsDeliveryOutcome> {
  const { todoId, content, fileName } = options;
  if (!hasAndroidBridge()) return { ok: false, reason: 'bridge_failed' };

  let contentBase64: string;
  try {
    contentBase64 = await encodeFileContentToBase64(content, 'text/calendar');
  } catch (error) {
    console.error('日历内容编码失败:', error);
    return { ok: false, reason: 'request_failed' };
  }
  if (!contentBase64) return { ok: false, reason: 'request_failed' };

  let res;
  try {
    // silent:失败提示由调用方按导出语境给，避免和全局错误提示重复弹
    res = await apiBasePost('/api/todo/exportCalendar', { id: todoId, fileName, contentBase64 }, { silent: true });
  } catch (error) {
    console.error('获取日历下载地址失败:', error);
    return { ok: false, reason: 'request_failed' };
  }

  if (res?.status === 413) return { ok: false, reason: 'too_large', message: res?.msg };
  if (res?.status !== 200 || !res?.data?.downloadUrl) {
    return { ok: false, reason: 'request_failed', message: res?.msg };
  }

  // 必须是绝对地址：原生 WebViewSupport.download 第一步就是 isHttpUrl 校验，
  // 相对路径会被直接判成非法下载并弹「无法开始下载」。
  const downloadUrl = new URL(String(res.data.downloadUrl), window.location.origin).toString();
  const delivered = postAndroidMessage({
    type: 'download',
    url: downloadUrl,
    fileName: String(res.data.fileName || fileName),
  });

  return delivered ? { ok: true } : { ok: false, reason: 'bridge_failed' };
}

/** 仅供测试：清掉模块级状态，避免用例之间互相污染 */
export function resetAndroidCalendarForTest() {
  pendingInserts.clear();
  resultHookInstalled = false;
  bridgeMissingCalendarChannel = false;
  if (typeof window !== 'undefined') delete window.__lightNoteAndroidCalendarResult;
}
