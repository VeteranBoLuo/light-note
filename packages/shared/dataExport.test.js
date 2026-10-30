import { describe, expect, it } from "vitest";
import {
  DATA_EXPORT_FULL_BACKUP,
  isFullDataBackup,
  normalizeDataExportOptions,
} from "./dataExport.js";

describe("full backup preset", () => {
  it("is a valid export request covering notes, bookmarks and original files", () => {
    expect(normalizeDataExportOptions(DATA_EXPORT_FULL_BACKUP)).toEqual({
      types: ["notes", "bookmarks", "files"],
      noteFormat: "original",
      includeImages: true,
    });
  });

  it("treats extra types as a full backup but not partial selections", () => {
    expect(
      isFullDataBackup(["notes", "bookmarks", "files", "extractions"]),
    ).toBe(true);
    expect(isFullDataBackup(["notes", "bookmarks"])).toBe(false);
    expect(isFullDataBackup(null)).toBe(false);
  });
});
