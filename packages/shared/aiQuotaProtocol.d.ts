export type AiQuotaErrorKind = 'exhausted' | 'insufficient_for_request';

export declare const AI_QUOTA_ERROR_CODES: {
  readonly EXHAUSTED: 'AI_QUOTA_EXCEEDED';
  readonly INSUFFICIENT_FOR_REQUEST: 'AI_QUOTA_INSUFFICIENT_FOR_REQUEST';
};

export declare function classifyAiQuotaErrorCode(value: unknown): AiQuotaErrorKind | null;
export declare function isAiQuotaErrorCode(value: unknown): boolean;
