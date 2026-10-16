import { describe, expect, it } from "vitest";
import {
  communityImageMarkdown,
  parseCommunityPostDocument,
  mapCommunityImageIds,
  communityImageInsertion,
  normalizeCommunityPost,
} from "./communityFeed.js";
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222";
describe("community post images", () => {
  it("recognizes only standalone images and leaves code, escapes and reference links intact", () => {
    const body = `前文\n\n${communityImageMarkdown(a, "步骤")}\n\n后文\n\n\`\`\`md\n${communityImageMarkdown(b)}\n\`\`\`\n\n\\![](${`community-image:${b}`})`;
    const doc = parseCommunityPostDocument(body);
    expect(doc.imageIds).toEqual([a]);
    expect(doc.invalid).toBe(false);
    expect(mapCommunityImageIds(body, () => b)).toContain(
      communityImageMarkdown(b, "步骤"),
    );
    expect(mapCommunityImageIds(body, () => null)).toContain("后文");
  });
  it("rejects duplicate, nested, malformed and undeclared images without treating code as images", () => {
    for (const body of [
      `${communityImageMarkdown(a)}\n\n${communityImageMarkdown(a)}`,
      `前${communityImageMarkdown(a)}`,
      `> ${communityImageMarkdown(a)}`,
      "![](community-image:bad)",
    ])
      expect(() =>
        normalizeCommunityPost({
          kind: "share",
          body,
          images: [a],
          contentVersion: 2,
        }),
      ).toThrow();
    expect(() =>
      normalizeCommunityPost({
        kind: "share",
        body: communityImageMarkdown(a),
        images: [b],
        contentVersion: 2,
      }),
    ).toThrow();
    expect(() =>
      normalizeCommunityPost({
        kind: "share",
        body: communityImageMarkdown(a),
        images: [a],
      }),
    ).toThrow();
    expect(
      normalizeCommunityPost({
        kind: "share",
        body: communityImageMarkdown(a),
        images: [a],
        contentVersion: 2,
      }).images,
    ).toEqual([a]);
  });
  it("splits ordinary text at the caret and inserts after compound blocks", () => {
    expect(
      communityImageInsertion("前后", 1, communityImageMarkdown(a)).body,
    ).toBe(`前\n\n${communityImageMarkdown(a)}\n\n后`);
    for (const body of [
      "- first\n- second\n",
      "```js\ncode()\n```\n",
      "| a | b |\n| - | - |\n| x | y |\n",
    ])
      expect(
        communityImageInsertion(body, 3, communityImageMarkdown(a)).position,
      ).toBe(body.length);
  });
});
