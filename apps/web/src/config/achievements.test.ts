import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_KEYS, ACHIEVEMENT_VISUALS, achievementVisualFor } from './achievements.ts';

function serverAchievements() {
  const source = readFileSync(resolve(process.cwd(), '../server/util/growth.js'), 'utf8');
  const definition = source.match(/export const ACHIEVEMENTS = \[([\s\S]*?)\n\];/)?.[1] || '';
  return [...definition.matchAll(/\{ key: '([^']+)', group: '([^']+)'/g)].map((match) => ({
    key: match[1],
    group: match[2],
  }));
}

describe('achievement visuals', () => {
  it('covers every server achievement with a matching group', () => {
    const serverItems = serverAchievements();
    expect(serverItems.length).toBeGreaterThan(0);
    expect(ACHIEVEMENT_KEYS).toEqual(serverItems.map((item) => item.key));
    serverItems.forEach((item) => {
      expect(ACHIEVEMENT_VISUALS[item.key as keyof typeof ACHIEVEMENT_VISUALS].group).toBe(item.group);
    });
  });

  it('gives every achievement an independent currentColor svg', () => {
    const icons = ACHIEVEMENT_KEYS.map((key) => ACHIEVEMENT_VISUALS[key].icon);
    expect(new Set(icons).size).toBe(ACHIEVEMENT_KEYS.length);
    icons.forEach((svg) => {
      expect(svg).toContain('<svg');
      expect(svg).toContain('currentColor');
      expect(svg).toContain('viewBox="0 0 24 24"');
    });
  });

  it('keeps unknown future achievements readable through a group fallback', () => {
    const fallback = achievementVisualFor('future-achievement', 'organize');
    expect(fallback.group).toBe('organize');
    expect(fallback.family).toBe('organize');
    expect(fallback.icon).toContain('<svg');
  });

  it('uses rarity metal rather than family color for high-tier prestige', () => {
    const legendary = ACHIEVEMENT_VISUALS.streak_100;
    const mythic = ACHIEVEMENT_VISUALS.note_500;

    expect(legendary.rarity).toBe('legendary');
    expect(legendary.metalBright).toBe('#ffdc3f');
    expect(mythic.rarity).toBe('mythic');
    expect(mythic.metalBright).toBe('#ffe44d');
    expect(mythic.metalBright).not.toBe(mythic.accent);
  });

  it('reserves the apex treatment for the rarest identity achievements', () => {
    expect(ACHIEVEMENT_VISUALS.streak_365.apex).toBe(true);
    expect(ACHIEVEMENT_VISUALS.level_15.apex).toBe(true);
    expect(ACHIEVEMENT_VISUALS.note_500.apex).toBe(false);
    expect(ACHIEVEMENT_VISUALS.streak_100.apex).toBe(false);
  });
});
