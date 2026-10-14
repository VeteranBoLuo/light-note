import { describe, expect, it } from "vitest";
import {
  PROFILE_BACKGROUND_IDS,
  isProfileBackgroundId,
} from "./profileBackgrounds.js";

describe("公开背景白名单", () => {
  it("允许稳定 ID，拒绝任意 URL、对象与其他装扮", () => {
    expect(new Set(PROFILE_BACKGROUND_IDS).size).toBe(4);
    for (const id of PROFILE_BACKGROUND_IDS)
      expect(isProfileBackgroundId(id)).toBe(true);
    for (const value of [
      undefined,
      null,
      {},
      "",
      "frame_mint",
      "https://example.com/a",
      "__proto__",
    ]) {
      expect(isProfileBackgroundId(value)).toBe(false);
    }
  });
});
