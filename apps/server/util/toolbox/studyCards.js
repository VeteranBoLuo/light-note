import { createHash } from 'node:crypto';

/** Only new outputs with explicit question/answer tables become interactive cards. */
export function extractStudyCards(markdown) {
  let section = '';
  const cards = [];
  for (const line of String(markdown || '').split('\n')) {
    if (/^##\s/u.test(line))
      section = /记忆卡|闪卡|flashcard/iu.test(line) ? 'flashcard' : /自测|quiz/iu.test(line) ? 'quiz' : '';
    if (!section || !/^\s*\|/u.test(line)) continue;
    const cells = line
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((cell) => cell.trim());
    if (cells.length !== 2 || cells.some((cell) => !cell || /^:?-+:?$/u.test(cell))) continue;
    if (/^(问题|题目|question|正面)$/iu.test(cells[0])) continue;
    const [question, answer] = cells;
    if (question.length > 1000 || answer.length > 4000) continue;
    const id = createHash('sha256')
      .update(JSON.stringify([section, question, answer]))
      .digest('hex')
      .slice(0, 24);
    if (!cards.some((card) => card.id === id)) cards.push({ id, kind: section, question, answer });
    if (cards.length >= 60) break;
  }
  return { version: 1, cards };
}
export const STUDY_SCHEMA = `CREATE TABLE IF NOT EXISTS toolbox_study_progress (
  user_id VARCHAR(64) NOT NULL, artifact_id CHAR(36) NOT NULL, artifact_version INT UNSIGNED NOT NULL,
  card_id VARCHAR(24) NOT NULL, mastered TINYINT(1) NOT NULL DEFAULT 0, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,artifact_id,artifact_version,card_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
