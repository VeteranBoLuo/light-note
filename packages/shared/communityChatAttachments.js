export const COMMUNITY_CHAT_ATTACHMENT_MAX_COUNT = 4;
export const COMMUNITY_CHAT_ATTACHMENT_MAX_TOTAL_BYTES = 20 * 1024 * 1024;
export const COMMUNITY_CHAT_ATTACHMENT_MAX_PENDING_PER_USER = 12;
export const COMMUNITY_CHAT_ATTACHMENT_PENDING_HOURS = 24;
export const COMMUNITY_CHAT_ATTACHMENT_RETENTION_DAYS = 30;
export const COMMUNITY_CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export const COMMUNITY_CHAT_BLOCKED_FILE_EXTENSIONS = Object.freeze([
  "aab",
  "apk",
  "app",
  "appimage",
  "appx",
  "appxbundle",
  "bat",
  "cmd",
  "com",
  "cpl",
  "deb",
  "dll",
  "dmg",
  "exe",
  "hta",
  "iso",
  "jar",
  "js",
  "jse",
  "lnk",
  "msi",
  "msix",
  "msp",
  "pif",
  "pkg",
  "ps1",
  "reg",
  "rpm",
  "scr",
  "sh",
  "vbe",
  "vbs",
  "wsf",
]);

export const COMMUNITY_CHAT_BLOCKED_FILE_MIME_TYPES = Object.freeze([
  "application/java-archive",
  "application/vnd.android.package-archive",
  "application/vnd.microsoft.portable-executable",
  "application/x-apple-diskimage",
  "application/x-bat",
  "application/x-debian-package",
  "application/x-dosexec",
  "application/x-executable",
  "application/x-java-archive",
  "application/x-msdownload",
  "application/x-msdos-program",
  "application/x-msi",
  "application/x-rpm",
  "application/x-sh",
  "application/x-shellscript",
]);
