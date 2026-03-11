import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { message } from 'ant-design-vue';
import { useUserStore } from '@/store';
import { getBrowserType, getUserOsInfo } from '@/utils/common.ts';

// 常量定义
const TIMEOUT = 60000;
const ROLES_ADMIN = ['admin', 'root'];
const NO_AUTH_ENDPOINTS = ['del'];
const ERROR_MESSAGES: { [key: number]: string } = {
  500: '服务器错误',
  403: '服务器拒绝请求',
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
});
//请求拦截
request.interceptors.request.use(
  (config) => {
    if (config.url?.includes('/api')) {
      config.headers['OS'] = getUserOsInfo();
      config.headers['Browser'] = getBrowserType();
      const user = useUserStore();
      const userId = localStorage?.getItem('userId');
      const notNeedAuth = NO_AUTH_ENDPOINTS.some((key) => config.url?.includes(key));
      if (!ROLES_ADMIN.includes(user.role) && notNeedAuth) {
        message.warn('没有操作权限，请登录！！！');
        return Promise.reject(new Error(`接口 ${config.url} 没有操作权限`));
      }
      if (config.url.includes('login')) {
        config.headers['X-User-Id'] = '';
        config.headers['role'] = '';
      } else if (userId) {
        config.headers['X-User-Id'] = userId;
        config.headers['role'] = user.role;
      } else {
        config.headers['role'] = 'visitor';
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
    return response;
  },
  (error) => {
    // 有HTTP响应（服务器返回了错误状态码）
    if (error.response) {
      const status = error.response.status;
      if (status >= 500) {
        message.error('服务器开小差了，请稍后重试');
        return Promise.reject({
          code: 'HTTP_' + status,
          message: '服务器开小差了，请稍后重试',
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
  if (ERROR_MESSAGES[res.status]) {
    const errorMsg = res.msg ?? ERROR_MESSAGES[res.status];
    message.error(errorMsg);
  }
  return res;
}

export default request;
