import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
import i18n from '@/i18n';
import useUserStore from '@/store/useUser';
import { getBrowserType, getUserOsInfo } from '@/utils/common.ts';
import {
  getAdminLoginPreviewPreferences,
  getAdminLoginPreviewUserId,
} from '@/utils/authStorage.ts';

// 常量定义
const TIMEOUT = 120000;
const HTTP_STATUS_KEYS: { [key: number]: string } = {
  500: 'http.status500',
  403: 'http.status403',
  423: 'http.status423',
  401: 'http.status401',
  400: 'http.status400',
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
interface ApiResponse {
  status: number;
  msg: string;
  data: any;
}

interface QueryData {
  pageSize?: number;
  currentPage?: number;
  level?: number;
  order?: { [key: string]: 'DESC' | 'ASC' };
  filters?: any;
}

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
  const status = response?.data?.status;
  const headerExpired = response?.headers?.['x-auth-expired'] === '1';
  const serverRole = response?.headers?.['x-auth-role'];
  const lostLoginState =
    user.id &&
    user.role !== 'visitor' &&
    (serverRole === 'visitor' || status === 'visitor' || status === 401);
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
    if (config.url?.includes('/api')) {
      let currentLang = 'zh-CN';
      try {
        currentLang =
          getAdminLoginPreviewPreferences().lang || JSON.parse(localStorage.getItem('preferences') || '{}').lang || 'zh-CN';
      } catch (e) {
        currentLang = 'zh-CN';
      }
      config.headers['OS'] = getUserOsInfo();
      config.headers['Browser'] = getBrowserType();
      config.headers['X-Lang'] = currentLang;
      const previewUserId = getAdminLoginPreviewUserId();
      if (previewUserId) {
        config.headers['X-Admin-Preview-User-Id'] = previewUserId;
        if (config.data?.filters && Object.prototype.hasOwnProperty.call(config.data.filters, 'userId')) {
          config.data.filters.userId = previewUserId;
        }
      }
      config.headers['fingerprint'] = (window as any)['fingerprint'];
      const rememberedSid = localStorage.getItem('rememberedSid');
      // 过期流程中不再重放旧 sid,避免带着失效凭证继续触发过期
      if (rememberedSid && !authExpiredFlow) {
        config.headers['X-Session-Id'] = rememberedSid;
      }
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
    notifyAuthSession(response);
    notifyUserBanned(response);
    notifyIpBanned(response);
    notifyAuthExpired(response);
    return response;
  },
  (error) => {
    // 有HTTP响应（服务器返回了错误状态码）
    if (error.response) {
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
      notifyAuthExpired(error.response);
      const status = error.response.status;
      if (status === 429) {
        const msg = error.response.data?.msg || i18n.global.t('http.tooFrequent');
        message.error(msg);
        return Promise.reject({
          code: 'HTTP_429',
          message: msg,
          status: 429,
        });
      }
      if (status >= 500) {
        const msg = error.response.data?.msg || i18n.global.t('http.serverBusy');
        message.error(msg);
        return Promise.reject({
          code: 'HTTP_' + status,
          message: msg,
          status: status,
        });
      }
    }
    // 无HTTP响应（网络层错误）
    if (error.code === 'ECONNRESET' || (error.message && error.message.includes('ECONNRESET'))) {
      // 这里只是基础处理，实际项目中应该调用统一的错误提示组件
      console.error('网络连接异常:', error);
      // 返回一个自定义错误对象，避免原生的技术错误暴露给用户
      return Promise.reject({
        code: 'NETWORK_ERROR',
        message: i18n.global.t('http.networkUnstable'),
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
    data: {
      pageSize: data?.pageSize ?? 10,
      currentPage: data?.currentPage ?? 1,
      level: data?.level ?? 0,
      filters: data?.filters ?? {},
      order: data?.order ?? {},
    },
    ...options,
  });
  return handleErrorResponse(res.data);
};

export const apiBasePost = async (
  url: string,
  data?: any,
  options?: AxiosRequestConfig & { silent?: boolean },
): Promise<ApiResponse> => {
  const res = await request({
    url,
    method: 'post',
    data,
    ...options,
  });
  return handleErrorResponse(res.data, options?.silent);
};

export const apiBaseGet = async (url: string, params?: any, options?: AxiosRequestConfig): Promise<ApiResponse> => {
  const res = await request({
    url,
    method: 'get',
    params,
    ...options,
  });
  return handleErrorResponse(res.data);
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
