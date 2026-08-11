import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
import i18n from '@/i18n';
import useUserStore from '@/store/useUser';
import { getBrowserType, getLogDeviceId, getLogFingerprint, getUserOsInfo } from '@/utils/common.ts';
import { resolveLightNoteRuntime } from '@/utils/appRuntime.ts';
import { getLightNoteAndroidVersion } from '@/utils/androidBridge.ts';
import { clearAdminLoginPreview, getAdminContextToken, getAdminLoginPreviewPreferences } from '@/utils/authStorage.ts';
import { buildQueryRequestData, type QueryData } from '@/http/queryRequest.ts';
import { beginNetworkRequestFeedback, finishNetworkRequestFeedback } from '@/composables/useNetworkRequestFeedback';

// 常量定义
const TIMEOUT = 120000;
const HTTP_STATUS_KEYS: { [key: number]: string } = {
  500: 'http.status500',
  403: 'http.status403',
  423: 'http.status423',
  401: 'http.status401',
  400: 'http.status400',
  409: 'http.status409',
  404: 'http.status404',
  504: 'http.status504',
  505: 'http.status505',
};
// 组件外用 i18n.global.t 取当前语言的状态码提示;未登记的 status 返回 undefined(保持原「有映射才提示」的逻辑)
function statusMessage(status: number): string | undefined {
  const key = HTTP_STATUS_KEYS[status];
  return key ? i18n.global.t(key) : undefined;
}

// 接口定义
export interface ApiResponse {
  status: number;
  msg: string;
  data: any;
  requestId?: string;
}

export type RequestOptions = AxiosRequestConfig & {
  silent?: boolean;
  suppressAuthExpired?: boolean;
  /** 是否把超过 380ms 的前台请求呈现在全局进度条；静默请求默认不呈现。 */
  feedback?: boolean;
  __networkFeedbackTracked?: boolean;
};

const request = axios.create({
  timeout: TIMEOUT,
  withCredentials: true,
});

let authExpiredFlow = false;
let userBannedNotifyLocked = false;

function notifyAuthSession(response?: any) {
  const expiresIn = Number(response?.headers?.['x-auth-expires-in'] || 0);
  const serverRole = response?.headers?.['x-auth-role'];
  if (serverRole && serverRole !== 'visitor' && expiresIn > 0) {
    window.dispatchEvent(new CustomEvent('light-note:auth-session', { detail: { expiresIn } }));
  }
}

function notifyAuthExpired(response?: any) {
  const user = useUserStore();
  // 陈旧的在途响应保护:请求发起时的登录身份 ≠ 当前身份,说明这条响应发出后用户已切换了账号
  // (典型:退出时发出的游客 /me 响应,晚于「重新登录」才到达)。直接忽略,否则误弹「登录已过期」。
  const reqUserId = response?.config?.__reqUserId;
  if (reqUserId !== undefined && reqUserId !== (user.id || '')) {
    return false;
  }
  const status = response?.data?.status;
  const headerExpired = response?.headers?.['x-auth-expired'] === '1';
  const serverRole = response?.headers?.['x-auth-role'];
  const lostLoginState =
    user.id && user.role !== 'visitor' && (serverRole === 'visitor' || status === 'visitor' || status === 401);
  if (status === 200 && serverRole && serverRole !== 'visitor') {
    authExpiredFlow = false;
    // 收到有效登录响应 → 重新登录成功,解除一次性抑制,下次真过期还能正常提示
    try {
      sessionStorage.removeItem('ln_auth_ended');
    } catch {}
    return false;
  }
  if (headerExpired || lostLoginState) {
    authExpiredFlow = true;
    // 一次性:同一浏览器标签内只提示 + 重定向一次。之后残留 sid(httpOnly cookie / rememberedSid)
    // 反复触发的过期信号静默降级为游客(App 已按 /me 返回的 visitor 渲染),
    // 避免账号被删/僵尸会话导致「登录已过期 → landing」每次刷新都循环。
    let alreadyEnded = false;
    try {
      alreadyEnded = sessionStorage.getItem('ln_auth_ended') === '1';
    } catch {}
    if (alreadyEnded) {
      return true;
    }
    try {
      sessionStorage.setItem('ln_auth_ended', '1');
    } catch {}
    window.dispatchEvent(new CustomEvent('light-note:auth-expired'));
    return true;
  }
  return false;
}

function notifyUserBanned(response?: any) {
  // 被封登录响应里带的短期申诉令牌(不是登录 cookie):存起来供封禁页提交申诉时识别身份
  const appealToken = response?.data?.data?.appealToken;
  if (appealToken) {
    try {
      sessionStorage.setItem('ln_appeal_token', appealToken);
    } catch {}
  }
  // 申诉接口豁免:被封用户提交申诉的响应也带 x-user-banned 头,若触发跳转会导致申诉页无法提交
  if ((response?.config?.url || '').includes('/user/appeal')) {
    return false;
  }
  const status = response?.status || response?.data?.status;
  const headerBanned = response?.headers?.['x-user-banned'] === '1';
  if (status !== 423 && !headerBanned) {
    return false;
  }
  const msg = response?.data?.msg || i18n.global.t('http.banned');
  if (!userBannedNotifyLocked) {
    userBannedNotifyLocked = true;
    message.error(msg);
    window.dispatchEvent(new CustomEvent('light-note:user-banned'));
    window.setTimeout(() => {
      userBannedNotifyLocked = false;
    }, 4000);
  }
  return true;
}

let ipBannedNotifyLocked = false;
function notifyIpBanned(response?: any) {
  const status = response?.status || response?.data?.status;
  const msg = response?.data?.msg || '';
  if (status !== 403 || !msg.includes('IP 已处于封禁期')) {
    return false;
  }
  if (!ipBannedNotifyLocked) {
    ipBannedNotifyLocked = true;
    message.error(msg);
    window.dispatchEvent(new CustomEvent('light-note:user-banned'));
    window.setTimeout(() => {
      ipBannedNotifyLocked = false;
    }, 4000);
  }
  return true;
}
//请求拦截
request.interceptors.request.use(
  (config) => {
    const options = config as RequestOptions;
    if (config.url?.includes('/api')) {
      let currentLang = 'zh-CN';
      try {
        currentLang =
          getAdminLoginPreviewPreferences().lang ||
          JSON.parse(localStorage.getItem('preferences') || '{}').lang ||
          'zh-CN';
      } catch (e) {
        currentLang = 'zh-CN';
      }
      config.headers['OS'] = getUserOsInfo();
      config.headers['Browser'] = getBrowserType();
      config.headers['X-LightNote-Runtime'] = resolveLightNoteRuntime();
      // 只在 App 内有值。日志里的运行环境带上版本号才能按 APK 版本定位问题
      const androidAppVersion = getLightNoteAndroidVersion();
      if (androidAppVersion) config.headers['X-LightNote-App-Version'] = androidAppVersion;
      config.headers['X-Lang'] = currentLang;
      const adminContextToken = getAdminContextToken();
      if (adminContextToken) {
        config.headers['X-Admin-Context'] = adminContextToken;
      }
      config.headers['fingerprint'] = getLogFingerprint();
      const logDeviceId = getLogDeviceId();
      if (logDeviceId) config.headers['X-Log-Device-Id'] = logDeviceId;
      // 会话层只用该稳定标识归并同一浏览器的重复登录记录，不作为认证或权限依据。
      if (logDeviceId) config.headers['X-Device-Id'] = logDeviceId;
      let rememberedSid = '';
      try {
        rememberedSid = localStorage.getItem('rememberedSid') || '';
      } catch {
        // 隐私模式下存储不可用不应让正常接口在发出前失败。
      }
      // 过期流程中不再重放旧 sid,避免带着失效凭证继续触发过期
      if (rememberedSid && !authExpiredFlow) {
        config.headers['X-Session-Id'] = rememberedSid;
      }
      // 记录请求发起时的登录身份:响应回来时若身份已变(如退出后又登录了别的账号),
      // 说明这是一条「陈旧的在途响应」,notifyAuthExpired 会据此忽略其过期信号,避免误弹「登录已过期」
      (config as any).__reqUserId = useUserStore().id || '';
    }
    // 所有可能抛错的请求头准备完成后才登记，避免请求尚未发出就异常时让全局进度条永久挂起。
    if (
      config.url?.includes('/api') &&
      (options.feedback === true || (options.feedback !== false && !options.silent))
    ) {
      beginNetworkRequestFeedback();
      options.__networkFeedbackTracked = true;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// 响应拦截
request.interceptors.response.use(
  (response) => {
    const requestOptions = response.config as RequestOptions;
    if (requestOptions.__networkFeedbackTracked) {
      requestOptions.__networkFeedbackTracked = false;
      finishNetworkRequestFeedback();
    }
    const requestId = String(response.headers?.['x-request-id'] || '');
    if (requestId && response.data && typeof response.data === 'object') {
      response.data.requestId = requestId;
    }
    notifyAuthSession(response);
    notifyUserBanned(response);
    notifyIpBanned(response);
    if (!(response.config as RequestOptions).suppressAuthExpired) {
      notifyAuthExpired(response);
    }
    return response;
  },
  (error) => {
    const requestOptions = error.config as RequestOptions | undefined;
    if (requestOptions?.__networkFeedbackTracked) {
      requestOptions.__networkFeedbackTracked = false;
      finishNetworkRequestFeedback();
    }
    const silent = Boolean(requestOptions?.silent);
    // 有HTTP响应（服务器返回了错误状态码）
    if (error.response) {
      const adminContextCode = error.response.data?.data?.code;
      const invalidAdminContextCodes = new Set([
        'ADMIN_CONTEXT_EXPIRED',
        'ADMIN_CONTEXT_UNAVAILABLE',
        'ADMIN_CONTEXT_TARGET_MISSING',
        'ADMIN_CONTEXT_FORBIDDEN',
      ]);
      if (invalidAdminContextCodes.has(adminContextCode)) {
        clearAdminLoginPreview();
        window.dispatchEvent(
          new CustomEvent('light-note:admin-context-expired', {
            detail: { code: adminContextCode, msg: error.response.data?.msg },
          }),
        );
        return Promise.reject({
          code: adminContextCode,
          message: error.response.data?.msg,
          status: error.response.status,
        });
      }
      if (adminContextCode === 'ADMIN_PREVIEW_READONLY') {
        const msg = error.response.data?.msg || '当前处于只读预览模式。';
        message.info(msg);
        return Promise.reject({ code: adminContextCode, message: msg, status: error.response.status });
      }
      if (adminContextCode === 'ADMIN_MAINTENANCE_FORBIDDEN' || adminContextCode === 'ADMIN_MAINTENANCE_DISABLED') {
        const msg = error.response.data?.msg || '当前内容代管模式不允许此操作。';
        message.warning(msg);
        return Promise.reject({ code: adminContextCode, message: msg, status: error.response.status });
      }
      if (adminContextCode === 'ADMIN_CONTEXT_POLICY_MISSING') {
        const msg = error.response.data?.msg || '该功能尚未声明管理员预览策略。';
        message.error(msg);
        return Promise.reject({ code: adminContextCode, message: msg, status: error.response.status });
      }
      if (notifyIpBanned(error.response)) {
        return Promise.reject({
          code: 'IP_BANNED',
          message: error.response.data?.msg || 'IP 已处于封禁期',
          status: 403,
        });
      }
      if (notifyUserBanned(error.response)) {
        return Promise.reject({
          code: 'USER_BANNED',
          message: error.response.data?.msg || i18n.global.t('http.bannedShort'),
          status: 423,
        });
      }
      if (!requestOptions?.suppressAuthExpired) {
        notifyAuthExpired(error.response);
      }
      const status = error.response.status;
      if (status === 429) {
        const msg = error.response.data?.msg || i18n.global.t('http.tooFrequent');
        if (!silent) {
          message.open({
            key: 'http-rate-limit',
            type: 'error',
            content: msg,
            duration: 5,
          });
        }
        return Promise.reject({
          code: 'HTTP_429',
          message: msg,
          status: 429,
          data: error.response.data?.data,
          retryAfter: Number(error.response.data?.data?.retryAfter || 0),
          requestId: error.response.headers?.['x-request-id'],
        });
      }
      if (status >= 500) {
        const msg = error.response.data?.msg || i18n.global.t('http.serverBusy');
        if (!silent) {
          message.error(msg);
        }
        return Promise.reject({
          code: 'HTTP_' + status,
          message: msg,
          status: status,
          requestId: error.response.headers?.['x-request-id'],
        });
      }
    }
    // 无HTTP响应（网络层错误）
    const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const isTimeout = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
    const isNetworkFailure =
      isOffline ||
      isTimeout ||
      error.code === 'ERR_NETWORK' ||
      error.code === 'ECONNRESET' ||
      (error.message && /ECONNRESET|Network Error|Failed to fetch/i.test(error.message));
    if (isNetworkFailure) {
      console.error('网络连接异常:', error);
      const failureMessage = i18n.global.t(
        isOffline ? 'http.offline' : isTimeout ? 'http.requestTimeout' : 'http.networkUnstable',
      );
      if (!silent) {
        message.open({
          key: 'http-network-failure',
          type: 'error',
          content: failureMessage,
          duration: 4,
        });
      }
      return Promise.reject({
        code: isOffline ? 'OFFLINE' : isTimeout ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR',
        message: failureMessage,
        originalError: error,
      });
    }

    return Promise.reject(error);
  },
);

export const apiQueryPost = async (
  url: string,
  data?: QueryData,
  options?: AxiosRequestConfig,
): Promise<ApiResponse> => {
  const res = await request({
    url,
    method: 'post',
    data: buildQueryRequestData(data),
    ...options,
  });
  return handleErrorResponse(res.data);
};

export const apiBasePost = async (url: string, data?: any, options?: RequestOptions): Promise<ApiResponse> => {
  const res = await request({
    url,
    method: 'post',
    data,
    ...options,
  });
  return handleErrorResponse(res.data, options?.silent);
};

export const apiBaseGet = async (url: string, params?: any, options?: RequestOptions): Promise<ApiResponse> => {
  const res = await request({
    url,
    method: 'get',
    params,
    ...options,
  });
  return handleErrorResponse(res.data, options?.silent);
};

export const apiBasePut = async (url: string, data?: any, options?: RequestOptions): Promise<ApiResponse> => {
  const res = await request({
    url,
    method: 'put',
    data,
    ...options,
  });
  return handleErrorResponse(res.data, options?.silent);
};

export function handleErrorResponse(res: AxiosResponse['data'], silent = false): ApiResponse {
  // 如果状态码在映射中，则显示错误消息
  if (authExpiredFlow && (res.status === 'visitor' || res.status === 401 || res.status === 403)) {
    return res;
  }
  if (res.status === 'preview') {
    // 游客写操作被后端拦截：派发事件，由 App 统一弹「预览模式」注册引导（用事件而非直接 import，避免循环依赖）。
    // 若正处于会话过期流程，让「重新登录」提示优先，不叠加预览弹窗，避免双弹。
    if (!authExpiredFlow) {
      window.dispatchEvent(new CustomEvent('light-note:preview-blocked', { detail: { msg: res.msg } }));
    }
    return res;
  }
  if (res.status === 423) {
    notifyUserBanned({ data: res, status: 423, headers: { 'x-user-banned': '1' } });
    return res;
  }
  const statusMsg = statusMessage(res.status);
  if (!silent && statusMsg) {
    const errorMsg = res.msg ?? statusMsg;
    message.error(errorMsg);
  }
  return res;
}

export default request;
