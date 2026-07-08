import { apiBaseGet, apiBasePost } from '@/http/request.ts';

// 读当前用户成长快照(游客返回 Lv.1 默认;root 满级)
export const getMyGrowth = () => apiBaseGet('/api/growth/me');

// 签到(游客后端返回 status 'preview',由 request 拦截统一弹注册引导)
export const checkin = () => apiBasePost('/api/growth/checkin');

// 段位表(「段位路线」总览用,公开只读)
export const getRanks = () => apiBaseGet('/api/growth/ranks');

// 标记升级通知已读(查看成长页后)
export const markNoticesRead = () => apiBasePost('/api/growth/notices/read');

export default { getMyGrowth, checkin, getRanks, markNoticesRead };
