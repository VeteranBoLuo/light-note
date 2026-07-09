import { apiBaseGet, apiBasePost } from '@/http/request.ts';

// 读当前用户成长快照(游客返回 Lv.1 默认;root 满级)
export const getMyGrowth = () => apiBaseGet('/api/growth/me');

// 签到(游客后端返回 status 'preview',由 request 拦截统一弹注册引导)
export const checkin = () => apiBasePost('/api/growth/checkin');

// 领取今日任务奖励(全部完成后)
export const claimDailyBonus = () => apiBasePost('/api/growth/claimDailyBonus');

// 使用补签卡(补回昨天漏签、续连签)
export const useProtectCard = () => apiBasePost('/api/growth/useProtectCard');

// 段位表(「段位路线」总览用,公开只读)
export const getRanks = () => apiBaseGet('/api/growth/ranks');

// 成长看板(成就墙/统计/今日任务/时间线)
export const getDashboard = () => apiBaseGet('/api/growth/dashboard');

// 实时本周成长周报(前端「查看大图」用)
export const getWeeklyReport = () => apiBaseGet('/api/growth/weeklyReport');

// 标记升级通知已读(查看成长页后)
export const markNoticesRead = () => apiBasePost('/api/growth/notices/read');

export default { getMyGrowth, checkin, claimDailyBonus, useProtectCard, getRanks, getDashboard, getWeeklyReport, markNoticesRead };
