import { describe, expect, it } from "vitest";
import { redactOperationalText } from "./redaction.js";

describe("redactOperationalText", () => {
  it("隐藏常见凭据但保留普通运维日志", () => {
    const result = redactOperationalText(
      "started token=abc123 DB_PASSWORD=hello Authorization=Bearer abc.def url=?signature=signed mysql://user:db-pass@localhost/db eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop -----BEGIN PRIVATE KEY-----\nprivate\n-----END PRIVATE KEY-----",
    );
    expect(result).toContain("started");
    expect(result).not.toContain("abc123");
    expect(result).not.toContain("hello");
    expect(result).not.toContain("signed");
    expect(result).not.toContain("db-pass");
    expect(result).not.toContain("eyJhbGci");
    expect(result).not.toContain("private");
  });
});
