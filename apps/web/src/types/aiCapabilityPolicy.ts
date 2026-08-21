import type { BaseOptions } from '@/config/bookmarkCfg';

export type AiCapabilityPolicyProfile = 'auto' | 'chat_only' | 'read_only';

const PROFILE_LABEL_KEYS: Readonly<Record<AiCapabilityPolicyProfile, string>> = Object.freeze({
  auto: 'ai.capabilityPolicy.auto',
  chat_only: 'ai.capabilityPolicy.chatOnly',
  read_only: 'ai.capabilityPolicy.readOnly',
});

const PROFILES = new Set<AiCapabilityPolicyProfile>(Object.keys(PROFILE_LABEL_KEYS) as AiCapabilityPolicyProfile[]);

export function normalizeAiCapabilityPolicyProfile(value: unknown): AiCapabilityPolicyProfile {
  const profile = String(value || '') as AiCapabilityPolicyProfile;
  return PROFILES.has(profile) ? profile : 'auto';
}

export function aiCapabilityPolicyLabelKey(value: unknown) {
  return PROFILE_LABEL_KEYS[normalizeAiCapabilityPolicyProfile(value)];
}

export function buildAiCapabilityPolicyOptions(translate: (key: string) => string): BaseOptions[] {
  return (Object.keys(PROFILE_LABEL_KEYS) as AiCapabilityPolicyProfile[]).map((profile) => ({
    value: profile,
    label: translate(PROFILE_LABEL_KEYS[profile]),
  }));
}

export const __testing = Object.freeze({ PROFILE_LABEL_KEYS });
