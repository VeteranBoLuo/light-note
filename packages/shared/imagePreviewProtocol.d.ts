export declare const CARD_IMAGE_PROFILE: Readonly<{
  id: "card";
  version: 2;
  maxEdge: 720;
  maxBytes: number;
}>;
export declare const IMAGE_PREVIEW_SOURCES: readonly ["note", "cloud_file"];
export type ImagePreviewSource = {
  sourceType: "note" | "cloud_file";
  sourceId: string;
  profile?: "card";
};
export type ImagePreviewState = ImagePreviewSource & {
  assetId?: string | null;
  status:
    | "queued"
    | "processing"
    | "ready"
    | "failed"
    | "unsupported"
    | "disabled"
    | "unavailable";
  url?: string | null;
  expiresAt?: number | null;
  width?: number;
  height?: number;
  bytes?: number;
  errorCode?: string | null;
  failureKind?: "source" | "resource_limit" | "service" | null;
  retryable?: boolean;
  presentation?: "full" | "long_top";
};
