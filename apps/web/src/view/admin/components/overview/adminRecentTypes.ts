import type { ResourceType } from '@/config/resourceColor.ts';

export type RecentResourceType = Exclude<ResourceType, 'tag'>;
export type AdminRecentPeriod = 'recent' | 'today';
export type AdminRecentFilterType = 'all' | 'resource' | 'user' | RecentResourceType;

export type AdminRecentFilter = {
  period: AdminRecentPeriod;
  type: AdminRecentFilterType;
};

export type AdminRecentResource = {
  id: string | number;
  type: RecentResourceType;
  title?: string | null;
  userId: string;
  userName?: string | null;
  userRemark?: string | null;
  createdAt: string;
};

export type AdminRecentUser = {
  id: string;
  name?: string | null;
  userRemark?: string | null;
  role?: string | null;
  createdAt: string;
};

export type AdminRecentData = {
  recentResources: AdminRecentResource[];
  recentUsers: AdminRecentUser[];
  filter?: AdminRecentFilter & { timezone?: 'Asia/Shanghai' };
  limit?: number;
};
