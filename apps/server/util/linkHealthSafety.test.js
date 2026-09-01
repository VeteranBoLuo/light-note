import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  bookmark: { id: 'bookmark-1', name: '示例', url: 'https://example.com/gone' },
  health: null,
  liveness: { status: 'suspect', code: 404 },
}));

function hash(url) {
  return crypto.createHash('sha256').update(Buffer.from(url, 'utf8')).digest();
}

vi.mock('../db/index.js', () => {
  const query = vi.fn(async (sql, params = []) => {
    const text = String(sql).replace(/\s+/g, ' ').trim();
    if (text.startsWith('SELECT user_id, run_id, status, total, processed')) {
      return [[]];
    }
    if (text.startsWith('SELECT id, url FROM bookmark')) {
      return [[{ id: state.bookmark.id, url: state.bookmark.url }]];
    }
    if (text.startsWith('INSERT INTO bookmark_health')) {
      const next = { status: params[2], code: params[3], urlHash: params[4], userOverride: null };
      const sameUrl = Boolean(state.health?.urlHash?.equals(next.urlHash));
      if (state.health && sameUrl && next.status === 'unknown') {
        state.health.urlHash = next.urlHash;
      } else {
        state.health = {
          ...next,
          userOverride: sameUrl ? state.health?.userOverride || null : null,
        };
      }
      return [{ affectedRows: 1 }];
    }
    if (text.startsWith('SELECT b.id, b.name')) {
      if (!state.health || !state.health.urlHash.equals(hash(state.bookmark.url))) return [[]];
      const effectiveStatus = state.health.userOverride === 'normal' ? 'user_normal' : state.health.status;
      return [
        [
          {
            ...state.bookmark,
            observedCode: state.health.code,
            checkedAt: '2026-08-31 10:00:00',
            userOverride: state.health.userOverride,
            effectiveStatus,
            hasSnapshot: 0,
          },
        ],
      ];
    }
    if (text.startsWith('UPDATE bookmark_health h') && text.includes("SET h.user_override = 'normal'")) {
      if (!state.health || state.health.status !== 'suspect') return [{ affectedRows: 0 }];
      state.health.userOverride = 'normal';
      return [{ affectedRows: 1 }];
    }
    if (text.startsWith('DELETE FROM bookmark_health')) {
      if (state.health?.userOverride !== 'normal') state.health = null;
      return [{ affectedRows: 1 }];
    }
    throw new Error(`UNEXPECTED_QUERY:${text.slice(0, 100)}`);
  });
  const connection = {
    query,
    beginTransaction: vi.fn(async () => {}),
    commit: vi.fn(async () => {}),
    rollback: vi.fn(async () => {}),
    release: vi.fn(),
  };
  return {
    default: {
      query,
      getConnection: vi.fn(async () => connection),
    },
  };
});

vi.mock('./fetchWebMeta.js', () => ({
  checkUrlLiveness: vi.fn(async () => state.liveness),
}));

const { markLinkNormal, recheckBookmarkHealth, resetHealth } = await import('./linkHealth.js');

describe('linkHealth 安全观测语义', () => {
  beforeEach(() => {
    state.bookmark = { id: 'bookmark-1', name: '示例', url: 'https://example.com/gone' };
    state.health = {
      status: 'suspect',
      code: '404',
      urlHash: hash(state.bookmark.url),
      userOverride: null,
    };
    state.liveness = { status: 'suspect', code: 404 };
  });

  it('DNS 与网络类未知结果不会抹掉同一 URL 的既有 404 观测', async () => {
    state.liveness = { status: 'suspect', code: 'ENOTFOUND' };

    const result = await recheckBookmarkHealth('user-1', 'bookmark-1');

    expect(result.observation).toMatchObject({ status: 'unknown', code: 'ENOTFOUND' });
    expect(result.item).toMatchObject({ effectiveStatus: 'suspect', observedCode: '404' });
  });

  it('用户标记正常与外部观测分层，复检不会覆盖用户决定', async () => {
    await expect(markLinkNormal('user-1', 'bookmark-1')).resolves.toEqual({ ok: true });
    const result = await recheckBookmarkHealth('user-1', 'bookmark-1');

    expect(result.item).toMatchObject({ effectiveStatus: 'user_normal', userOverride: 'normal' });
  });

  it('重置系统观测时保留用户“标记正常”的独立决定', async () => {
    await markLinkNormal('user-1', 'bookmark-1');

    await expect(resetHealth('user-1')).resolves.toEqual({ ok: true });

    expect(state.health).toMatchObject({ userOverride: 'normal', status: 'suspect', code: '404' });
  });

  it('书签 URL 变化后自动失效旧覆盖，并以新地址的观测重新开始', async () => {
    state.health.userOverride = 'normal';
    state.bookmark.url = 'https://example.com/new-address';
    state.liveness = { status: 'suspect', code: 'ENOTFOUND' };

    const result = await recheckBookmarkHealth('user-1', 'bookmark-1');

    expect(result.item).toMatchObject({ effectiveStatus: 'unknown', userOverride: null });
    expect(state.health.urlHash.equals(hash(state.bookmark.url))).toBe(true);
  });
});
