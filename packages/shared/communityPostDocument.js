import { Marked } from "marked";

// Protocol parsing must not inherit extensions installed by unrelated Markdown consumers.
const marked = new Marked({ gfm: true });

const IMAGE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function communityImageMarkdown(id, alt = "") {
  return `![${String(alt).replace(/[\\\[\]\r\n]/g, " ")}](community-image:${id})`;
}

/** Only standalone top-level image paragraphs are document images. Code is never scanned as markup. */
export function parseCommunityPostDocument(body = "") {
  const source = String(body),
    tokens = marked.lexer(source, { gfm: true });
  const blocks = [],
    imageIds = [],
    accepted = new Set();
  let offset = 0,
    textStart = 0,
    invalid = false;
  for (const token of tokens) {
    const image =
      token.type === "paragraph" &&
      token.tokens?.length === 1 &&
      token.tokens[0].type === "image"
        ? token.tokens[0]
        : null;
    if (image && /^community-image:/i.test(image.href || "")) {
      const id = image.href.slice("community-image:".length).toLowerCase();
      if (!IMAGE_ID.test(id) || imageIds.includes(id)) invalid = true;
      if (offset > textStart)
        blocks.push({ kind: "text", source: source.slice(textStart, offset) });
      blocks.push({
        kind: "image",
        id,
        alt: image.text || "",
        from: offset,
        to: offset + token.raw.length,
      });
      imageIds.push(id);
      accepted.add(image);
      textStart = offset + token.raw.length;
    }
    offset += token.raw.length;
  }
  marked.walkTokens(tokens, (token) => {
    if (
      token.type === "image" &&
      /^community-image:/i.test(token.href || "") &&
      !accepted.has(token)
    )
      invalid = true;
  });
  if (textStart < source.length)
    blocks.push({ kind: "text", source: source.slice(textStart) });
  return {
    blocks,
    imageIds,
    invalid,
    definitions: tokens
      .filter((t) => t.type === "def")
      .map((t) => t.raw)
      .join("\n"),
  };
}

export function mapCommunityImageIds(body, resolve) {
  const document = parseCommunityPostDocument(body);
  let result = String(body);
  for (const block of [...document.blocks].reverse()) {
    if (block.kind !== "image") continue;
    const id = resolve(block.id);
    if (id === block.id) continue;
    const trailing =
      String(body).slice(block.from, block.to).match(/\s*$/)?.[0] || "";
    result =
      result.slice(0, block.from) +
      (id ? communityImageMarkdown(id, block.alt) + trailing : "") +
      result.slice(block.to);
  }
  return result;
}

/** Preserve compound blocks; split ordinary paragraphs at the caret without replacing selected text. */
export function communityImageInsertion(body, caret, markdown) {
  let position = Math.max(0, Math.min(String(body).length, caret)),
    offset = 0;
  for (const token of marked.lexer(body)) {
    const end = offset + token.raw.length;
    if (
      position >= offset &&
      position < end &&
      token.type !== "paragraph" &&
      token.type !== "space"
    )
      position = end;
    offset = end;
  }
  const before = body.slice(0, position),
    after = body.slice(position);
  const insert =
    (before && !before.endsWith("\n\n") ? "\n\n" : "") + markdown + "\n\n";
  return {
    position,
    insert,
    caret: position + insert.length,
    body: before + insert + after,
  };
}
