import { apiBaseGet, apiBasePost, apiBasePut } from '@/http/request';

export type DailyBriefStatus = 'disabled' | 'not_generated' | 'generating' | 'ready' | 'failed';
export type DailyBriefSectionId = 'today_actions' | 'new_content' | 'organize' | 'recommendation';

export interface DailyBriefItem {
  id: string;
  label: string;
  count?: number;
  text?: string;
  route?: string;
}

export interface DailyBriefInsight {
  id: string;
  text: string;
  factIds: string[];
  sources?: Array<{ type: 'bookmark' | 'note' | 'file' | 'toolbox_task' | 'research_workspace' | 'learning_workspace' | 'writing_workspace'; id: string; title: string; url?: string }>;
  tagName?: string;
  tagRoute?: string;
}

export interface DailyBrief {
  version: 2;
  date: string;
  generatedBy: 'ai';
  headline: string;
  insights: DailyBriefInsight[];
  recommendation: string;
  sections?: Array<{
    id: DailyBriefSectionId;
    title: string;
    items: DailyBriefItem[];
  }>;
}

export interface DailyBriefState {
  featureEnabled: boolean;
  enabled: boolean;
  date: string;
  /** 账号时区中的下一个自然日边界；用于页面持续打开时自动确保新一天的简报。 */
  nextDateAt: string | null;
  status: DailyBriefStatus;
  brief: DailyBrief | null;
  generatedAt: string | null;
  lastErrorCode: string | null;
  autoUpdate?: boolean;
  timezone?: string;
  checkedAt?: string | null;
  dataAsOf?: string | null;
  stale?: boolean;
  staleFactIds?: string[];
  shouldGenerate?: boolean;
  nextRefreshAt?: string | null;
  pauseReason?: 'manual' | 'quota' | 'budget' | null;
}

export interface DailyBriefPreference {
  featureEnabled: boolean;
  enabled: boolean;
  autoUpdate?: boolean;
}

export const getDailyBrief = (options: { check?: boolean } = {}) =>
  apiBaseGet('/api/workbench/daily-brief', options.check ? { check: '1' } : undefined, { silent: true });

export const ensureDailyBrief = () => apiBasePost('/api/workbench/daily-brief/ensure', {}, { silent: true });

export const refreshDailyBrief = () => apiBasePost('/api/workbench/daily-brief/refresh', {}, { silent: true });

export const getDailyBriefPreference = () =>
  apiBaseGet('/api/workbench/daily-brief/preference', undefined, { silent: true });

export const updateDailyBriefPreference = (enabled: boolean, autoUpdate?: boolean) =>
  apiBasePut(
    '/api/workbench/daily-brief/preference',
    { enabled, ...(autoUpdate === undefined ? {} : { autoUpdate }) },
    { silent: true },
  );
