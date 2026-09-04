export type CommunityChatAttachmentKind = "image" | "file";
export type CommunityChatAttachmentAvailability = "available" | "expired";

export interface CommunityChatAttachment {
  publicId: string;
  kind: CommunityChatAttachmentKind;
  fileName: string;
  fileType: string;
  fileSize: number;
  availability: CommunityChatAttachmentAvailability;
  expiresAt: string | null;
  url?: string;
  width?: number;
  height?: number;
}

export declare const COMMUNITY_CHAT_ATTACHMENT_MAX_COUNT: 4;
export declare const COMMUNITY_CHAT_ATTACHMENT_MAX_TOTAL_BYTES: number;
export declare const COMMUNITY_CHAT_ATTACHMENT_MAX_PENDING_PER_USER: 12;
export declare const COMMUNITY_CHAT_ATTACHMENT_PENDING_HOURS: 24;
export declare const COMMUNITY_CHAT_ATTACHMENT_RETENTION_DAYS: 30;
export declare const COMMUNITY_CHAT_IMAGE_MAX_BYTES: number;
export declare const COMMUNITY_CHAT_BLOCKED_FILE_EXTENSIONS: readonly string[];
export declare const COMMUNITY_CHAT_BLOCKED_FILE_MIME_TYPES: readonly string[];
