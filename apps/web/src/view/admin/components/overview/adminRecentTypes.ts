import type { ResourceType } from '@/config/resourceColor.ts';

export type RecentResourceType = Exclude<ResourceType, 'tag'>;

export type AdminRecentResource = {
  id: string | number;
  type: RecentResourceType;
  title?: string | null;
  userId: string;
  userName?: string | null;
  createdAt: string;
};

export type AdminRecentUser = {
  id: string;
  name?: string | null;
  role?: string | null;
  createdAt: string;
};

export type AdminRecentData = {
  recentResources: AdminRecentResource[];
  recentUsers: AdminRecentUser[];
};
