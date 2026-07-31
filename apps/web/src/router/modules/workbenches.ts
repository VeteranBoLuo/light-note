import { RouteRecordRaw } from 'vue-router';
import { ALL_ROLES } from '@/config/bookmarkCfg.ts';

const workbenchesRouter: RouteRecordRaw = {
  meta: {
    roles: ALL_ROLES,
    // 桌面端是完整工作台，移动端渲染「今日」并高亮底部第一个入口
    mobileShell: 'today',
    mobileBottomNav: true,
  },
  path: '/workbenches',
  name: 'workbenches',
  component: () => import('@/view/workbenches/Workbenches.vue'),
};

export default workbenchesRouter;
