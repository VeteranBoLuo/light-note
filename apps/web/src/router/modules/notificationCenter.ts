import { RouteRecordRaw } from 'vue-router';
import { RoleEnum } from '@/config/bookmarkCfg.ts';

// 通知中心(顶部管理下的独立模块,仅 root):把原先散落在「用户管理」里的发通知能力
// 收拢为独立模块,并扩展为 群发/多选/按角色 + 发送记录 + 已读率 + 撤回。
const notificationCenterRouter: RouteRecordRaw = {
  meta: {
    title: '通知中心',
    keepAlive: true,
    requireAuth: true,
    roles: [RoleEnum.Root],
  },
  path: '/notificationCenter',
  name: 'notificationCenter',
  component: () => import('@/view/admin/components/notificationCenter/NotificationCenter.vue'),
};

export default notificationCenterRouter;
