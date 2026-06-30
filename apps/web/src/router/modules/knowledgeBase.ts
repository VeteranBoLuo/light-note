import { RouteRecordRaw } from 'vue-router';
import { RoleEnum } from '@/config/bookmarkCfg.ts';

const knowledgeBaseRouter: RouteRecordRaw = {
  meta: {
    title: '知识库',
    requireAuth: true,
    roles: [RoleEnum.Root],
  },
  path: '/knowledgeBase',
  name: 'knowledgeBase',
  component: () => import('@/view/knowledgeBase/KnowledgeBase.vue'),
};

export default knowledgeBaseRouter;
