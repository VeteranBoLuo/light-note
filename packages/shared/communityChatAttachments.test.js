import { describe, expect, it } from "vitest";
import {
  COMMUNITY_CHAT_ATTACHMENT_MAX_COUNT,
  COMMUNITY_CHAT_ATTACHMENT_MAX_PENDING_PER_USER,
  COMMUNITY_CHAT_ATTACHMENT_MAX_TOTAL_BYTES,
  COMMUNITY_CHAT_ATTACHMENT_PENDING_HOURS,
  COMMUNITY_CHAT_ATTACHMENT_RETENTION_DAYS,
  COMMUNITY_CHAT_BLOCKED_FILE_EXTENSIONS,
  COMMUNITY_CHAT_BLOCKED_FILE_MIME_TYPES,
  COMMUNITY_CHAT_IMAGE_MAX_BYTES,
} from "./communityChatAttachments.js";

describe("community chat attachment contract", () => {
  it("keeps client and server limits in one immutable contract", () => {
    expect(COMMUNITY_CHAT_ATTACHMENT_MAX_COUNT).toBe(4);
    expect(COMMUNITY_CHAT_ATTACHMENT_MAX_TOTAL_BYTES).toBe(20 * 1024 * 1024);
    expect(COMMUNITY_CHAT_ATTACHMENT_MAX_PENDING_PER_USER).toBe(12);
    expect(COMMUNITY_CHAT_ATTACHMENT_PENDING_HOURS).toBe(24);
    expect(COMMUNITY_CHAT_ATTACHMENT_RETENTION_DAYS).toBe(30);
    expect(COMMUNITY_CHAT_IMAGE_MAX_BYTES).toBe(5 * 1024 * 1024);
    expect(Object.isFrozen(COMMUNITY_CHAT_BLOCKED_FILE_EXTENSIONS)).toBe(true);
    expect(Object.isFrozen(COMMUNITY_CHAT_BLOCKED_FILE_MIME_TYPES)).toBe(true);
    expect(COMMUNITY_CHAT_BLOCKED_FILE_EXTENSIONS).toEqual(
      expect.arrayContaining(["exe", "apk", "dmg", "sh"]),
    );
  });
});
