export const COMMUNITY_FEED_LIMITS: Readonly<{
  resources: number;
  images: number;
  imageBytes: number;
  title: number;
  body: number;
  comment: number;
  topics: number;
  interests: number;
  mentions: number;
  pageSize: number;
  maxPageSize: number;
}>;
export const COMMUNITY_POST_KINDS: readonly ["share", "question", "thought"];
export const COMMUNITY_PROFILE_CONSENT_VERSION: number;
export function communityTextLength(value: unknown): number;
export interface CommunityPostInput {
  resources?: string[];
  images?: string[];
  kind: "share" | "question" | "thought";
  title: string;
  body: string;
  topics: string[];
  mentions: string[];
}
export function normalizeCommunityPost(input: unknown): CommunityPostInput;
