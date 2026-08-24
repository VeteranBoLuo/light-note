export declare const AI_SKILL_PROTOCOL_VERSION: 1;
export type AiSkillStatus =
  "completed" | "preview_ready" | "needs_confirmation" | "failed" | "cancelled";
export type AiSkillResultKind =
  | "grounded_markdown"
  | "text"
  | "structured_draft"
  | "field_suggestions"
  | "artifact_preview";
export type AiSkillResourceType =
  "note" | "bookmark" | "file" | "todo" | "tag" | "help";

export interface AiSkillResourceRef {
  type: AiSkillResourceType;
  id: string;
  version?: string;
}

export interface AiSkillRequest {
  protocolVersion: 1;
  requestId: string;
  skillId: string;
  skillVersion: number;
  threadId: string | null;
  input: Record<string, unknown>;
  scope: { resourceRefs: readonly AiSkillResourceRef[] };
  client: { locale: string; timezone: string; surface: string };
}

export interface AiSkillResponse {
  protocolVersion: 1;
  requestId: string;
  skillId: string;
  skillVersion: number;
  status: AiSkillStatus;
  threadId: string | null;
  scopeDigest: string | null;
  result: ({ kind: AiSkillResultKind } & Record<string, unknown>) | null;
  sources: readonly Record<string, unknown>[];
  coverage: Record<string, unknown> | null;
  availableActions: readonly Record<string, unknown>[];
  receipt: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
}

export declare const AI_SKILL_STATUSES: readonly AiSkillStatus[];
export declare const AI_SKILL_RESULT_KINDS: readonly AiSkillResultKind[];
export declare const AI_SKILL_RESOURCE_TYPES: readonly AiSkillResourceType[];

export declare class AiSkillProtocolError extends Error {
  code: string;
  status: 400;
}

export declare function validateAiSkillRequest(
  input: unknown,
): Readonly<AiSkillRequest>;
export declare function validateAiSkillResponse(
  input: unknown,
): Readonly<AiSkillResponse>;
