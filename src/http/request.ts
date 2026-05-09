import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { message } from 'ant-design-vue';
import useUserStore from '@/store/useUser';
import { getBrowserType, getUserOsInfo } from '@/utils/common.ts';
import {
  getAdminLoginPreviewPreferences,
  getAdminLoginPreviewUserId,
} from '@/utils/authStorage.ts';

// 常量定义
const TIMEOUT = 120000;
const ROLES_ADMIN = ['admin', 'root'];
const NO_AUTH_ENDPOINTS = ['del'];
const ERROR_MESSAGES: { [key: number]: string } = {
  500: '服务器错误',
  403: '服务器拒绝请求',
  423: '账号已被封禁',
  401: '无权限，请登录',
  400: '客户端请求异常',
  404: '请求资源不存在',
  504: '服务器异常',
  505: 'HTTP 版本不受支持',
};

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
    return false;
  }
  if (headerExpired || lostLoginState) {
    authExpiredFlow = true;
    window.dispatchEvent(new CustomEvent('light-note:auth-expired'));
    return true;
  }
  return false;
}

function notifyUserBanned(response?: any) {
  const status = response?.status || response?.data?.status;
  const headerBanned = response?.headers?.['x-user-banned'] === '1';
  if (status !== 423 && !headerBanned) {
    return false;
  }
  const msg = response?.data?.msg || '账号已被封禁，请登录其他账号或联系管理员';
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
      const user = useUserStore();
      const previewUserId = getAdminLoginPreviewUserId();
      if (previewUserId && config.data?.filters && Object.prototype.hasOwnProperty.call(config.data.filters, 'userId')) {
        config.data.filters.userId = previewUserId;
      }
      const notNeedAuth = NO_AUTH_ENDPOINTS.some((key) => config.url?.includes(key));
      if (!ROLES_ADMIN.includes(user.role) && notNeedAuth) {
        message.warn('没有操作权限，请登录！！！');
        return Promise.reject(new Error(`接口 ${config.url} 没有操作权限`));
      }
      config.headers['fingerprint'] = (window as any)['fingerprint'];
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
          message: error.response.data?.msg || '账号已被封禁',
          status: 423,
        });
      }
      notifyAuthExpired(error.response);
      const status = error.response.status;
      if (status === 429) {
        const msg = error.response.data?.msg || '请求过于频繁，请稍后再试';
        message.error(msg);
        return Promise.reject({
          code: 'HTTP_429',
          message: msg,
          status: 429,
        });
      }
      if (status >= 500) {
        const msg = error.response.data?.msg || '服务器开小差了，请稍后重试';
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
        message: '网络连接不稳定，请检查网络后重试',
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

export const apiBasePost = async (url: string, data?: any, options?: AxiosRequestConfig): Promise<ApiResponse> => {
  const res = await request({
    url,
    method: 'post',
    data,
    ...options,
  });
  return handleErrorResponse(res.data);
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

export function handleErrorResponse(res: AxiosResponse['data']): ApiResponse {
  // 如果状态码在映射中，则显示错误消息
  if (authExpiredFlow && (res.status === 'visitor' || res.status === 401 || res.status === 403)) {
    return res;
  }
  if (res.status === 423) {
    notifyUserBanned({ data: res, status: 423, headers: { 'x-user-banned': '1' } });
    return res;
  }
  if (ERROR_MESSAGES[res.status]) {
    const errorMsg = res.msg ?? ERROR_MESSAGES[res.status];
    message.error(errorMsg);
  }
  return res;
}

export default request;
