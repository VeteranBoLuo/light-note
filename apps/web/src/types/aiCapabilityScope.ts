import type { BaseOptions } from '@/config/bookmarkCfg';

export type AiCapabilityDomain =
  | 'content'
  | 'note'
  | 'bookmark'
  | 'file'
  | 'todo'
  | 'tag'
  | 'account'
  | 'growth'
  | 'admin'
  | 'web';

export type AiCapabilityModule =
  | 'auto'
  | 'content'
  | 'note'
  | 'bookmark'
  | 'file'
  | 'todo'
  | 'tag'
  | 'account_growth'
  | 'admin';

const MODULE_DOMAINS: Readonly<Record<AiCapabilityModule, readonly AiCapabilityDomain[]>> = Object.freeze({
  auto: [] as const,
  content: ['content'] as const,
  note: ['note'] as const,
  bookmark: ['bookmark', 'web'] as const,
  file: ['file'] as const,
  todo: ['todo'] as const,
  tag: ['tag'] as const,
  account_growth: ['account', 'growth'] as const,
  admin: ['admin'] as const,
});

const MODULE_LABEL_KEYS: Readonly<Record<AiCapabilityModule, string>> = Object.freeze({
  auto: 'ai.capabilityScope.auto',
  content: 'ai.capabilityScope.content',
  note: 'ai.capabilityScope.note',
  bookmark: 'ai.capabilityScope.bookmark',
  file: 'ai.capabilityScope.file',
  todo: 'ai.capabilityScope.todo',
  tag: 'ai.capabilityScope.tag',
  account_growth: 'ai.capabilityScope.accountGrowth',
  admin: 'ai.capabilityScope.admin',
});

const MODULES = new Set<AiCapabilityModule>(Object.keys(MODULE_DOMAINS) as AiCapabilityModule[]);

export function normalizeAiCapabilityModule(value: unknown): AiCapabilityModule {
  const module = String(value || '') as AiCapabilityModule;
  return MODULES.has(module) ? module : 'auto';
}

export function aiCapabilityModuleLabelKey(value: unknown) {
  return MODULE_LABEL_KEYS[normalizeAiCapabilityModule(value)];
}

export function buildAiCapabilityScope(value: unknown) {
  const module = normalizeAiCapabilityModule(value);
  const domains = [...MODULE_DOMAINS[module]];
  return Object.freeze({
    mode: domains.length ? ('restricted' as const) : ('auto' as const),
    domains: Object.freeze(domains),
  });
}

export function buildAiCapabilityModuleOptions(
  translate: (key: string) => string,
  { includeAdmin = false }: { includeAdmin?: boolean } = {},
): BaseOptions[] {
  return (Object.keys(MODULE_DOMAINS) as AiCapabilityModule[])
    .filter((module) => includeAdmin || module !== 'admin')
    .map((module) => ({ value: module, label: translate(MODULE_LABEL_KEYS[module]) }));
}

export const __testing = Object.freeze({ MODULE_DOMAINS, MODULE_LABEL_KEYS });
