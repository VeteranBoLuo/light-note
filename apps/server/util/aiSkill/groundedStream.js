import { validateGroundedAnswerArguments } from './groundedOutput.js';

/** Only complete, independently validated blocks leave the server; the complete tool call is still authoritative. */
export function createGroundedStream({ sources, coverage, onDelta }) {
  let scanned = 0;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let start = -1;
  let count = 0;
  let chars = 0;
  let stopped = false;
  return ({ index, name, arguments: input }) => {
    if (stopped) return;
    if (index !== 0 || name !== 'submit_grounded_answer') {
      stopped = true;
      return;
    }
    if (!scanned) {
      const prefix = input.match(/^\s*\{\s*"blocks"\s*:\s*\[/u);
      if (!prefix) return;
      scanned = prefix[0].length;
    }
    for (; scanned < input.length; scanned += 1) {
      const char = input[scanned];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') {
        inString = true;
        continue;
      }
      if (char === '{') {
        if (depth === 0) start = scanned;
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth !== 0 || start < 0) continue;
        try {
          const block = JSON.parse(input.slice(start, scanned + 1));
          const result = validateGroundedAnswerArguments({ blocks: [block] }, sources, coverage);
          chars += result.content.length + (count ? 2 : 0);
          if (count >= 60 || chars > 60_000) {
            stopped = true;
            return;
          }
          onDelta?.(`${count ? '\n\n' : ''}${result.content}`);
          count += 1;
        } catch {
          // Invalid partial output is never published. Final validation owns the bounded repair.
          stopped = true;
          return;
        }
        start = -1;
      } else if (depth === 0 && char === ']') {
        stopped = true;
        return;
      }
    }
  };
}
