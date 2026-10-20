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
  contentVersion?: 2;
  resources?: string[];
  images?: string[];
  kind: "share" | "question" | "thought";
  title: string;
  body: string;
  topics: string[];
  mentions: string[];
}
export function normalizeCommunityPost(input: unknown): CommunityPostInput;
export type CommunityDocumentBlock =
  | { kind: "text"; source: string }
  | { kind: "image"; id: string; alt: string; from: number; to: number };
export function parseCommunityPostDocument(body?: string): {
  blocks: CommunityDocumentBlock[];
  imageIds: string[];
  invalid: boolean;
  definitions: string;
};
export function mapCommunityImageIds(
  body: string,
  resolve: (id: string) => string | null | undefined,
): string;
export function communityImageMarkdown(id: string, alt?: string): string;
export function communityImageInsertion(
  body: string,
  caret: number,
  markdown: string,
): { position: number; insert: string; caret: number; body: string };
