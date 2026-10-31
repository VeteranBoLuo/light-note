import { describe, expect, it } from 'vitest';
import icon from '@/config/icon';
import { FEATURE_SHORTCUTS } from '@/config/featureShortcuts';
import { featureShortcutEn, featureShortcutZh } from '@/i18n/locales/featureShortcut';
import {
  localDateKey,
  matchFeatureShortcuts,
  resolveFeaturedFeatures,
  type FeatureShortcutContext,
} from './featureShortcuts';

const desktop: FeatureShortcutContext = { platform: 'desktop', isGuest: false };
const titles = featureShortcutZh.items as Record<string, { title: string }>;
const titleOf = (feature: { key: string }) => titles[feature.key].title;
const ids = (keyword: string, context = desktop) =>
  matchFeatureShortcuts(keyword, context, titleOf).map((match) => match.feature.id);

describe('功能清单', () => {
  it('每项都有唯一 ID、可用图标和中英文案，服务端 ID 规则也能接受', () => {
    const seen = new Set<string>();
    for (const feature of FEATURE_SHORTCUTS) {
      expect(seen.has(feature.id)).toBe(false);
      seen.add(feature.id);
      expect(feature.id).toMatch(/^[a-z][a-z0-9-]{1,47}$/);
      expect(feature.icon).toBeTruthy();
      expect(feature.icon).not.toBe(icon.nullImg);
      expect(feature.route.path.startsWith('/')).toBe(true);
      for (const locale of [featureShortcutZh, featureShortcutEn]) {
        const text = (locale.items as Record<string, Record<string, string>>)[feature.key];
        expect(text?.title && text.location && text.description).toBeTruthy();
        if (feature.hint) expect(text.hint).toBeTruthy();
      }
    }
  });
});

describe('matchFeatureShortcuts', () => {
  it('名称开头命中排在说法命中之前，最多 3 项', () => {
    expect(ids('导出')).toEqual(['note-export', 'data-backup', 'todo-calendar']);
  });

  it('只靠说法命中时返回该说法，名称命中时不返回', () => {
    const [backup] = matchFeatureShortcuts('备份', desktop, titleOf);
    expect(backup).toMatchObject({ alias: null });
    const [importBookmarks] = matchFeatureShortcuts('收藏夹', desktop, titleOf);
    expect(importBookmarks).toMatchObject({ feature: { id: 'bookmark-import' }, alias: '收藏夹' });
  });

  it('整句里包含说法或名称也能命中，大小写不敏感', () => {
    expect(ids('怎么导入浏览器书签')[0]).toBe('bookmark-import');
    expect(ids('DARK MODE')).toEqual(['theme']);
  });

  it('少于 2 个字不匹配，避免一个字就弹出功能', () => {
    expect(ids('导')).toEqual([]);
    expect(ids('  ')).toEqual([]);
  });

  it('按端型与游客身份过滤', () => {
    expect(ids('收藏夹', { platform: 'mobile', isGuest: false })).toEqual([]);
    expect(ids('快捷键', { platform: 'mobile', isGuest: false })).toEqual([]);
    expect(ids('回收站', { platform: 'desktop', isGuest: true })).toEqual([]);
    expect(ids('共建', { platform: 'mobile', isGuest: true })).toEqual(['co-build']);
  });
});

describe('最近上线', () => {
  const item = { featureId: 'manor', description: '', publishDate: '2026-01-02' };

  it('没有到期时间，按 Root 设定的顺序展示，只过滤已下线和当前端或身份不可用的功能', () => {
    const items = [
      { ...item, featureId: 'note-reference' },
      { ...item, featureId: 'removed-feature' },
      item,
      { ...item, featureId: 'trash' },
    ];
    expect(resolveFeaturedFeatures(items, desktop).map((entry) => entry.feature.id)).toEqual([
      'note-reference',
      'manor',
      'trash',
    ]);
    expect(resolveFeaturedFeatures(items, { platform: 'mobile', isGuest: false }).map((entry) => entry.feature.id)).toEqual([
      'manor',
      'trash',
    ]);
    expect(resolveFeaturedFeatures(items, { platform: 'desktop', isGuest: true }).map((entry) => entry.feature.id)).toEqual([
      'note-reference',
    ]);
  });

  it('本地日期键不受 UTC 换日影响', () => {
    expect(localDateKey(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01');
  });
});
