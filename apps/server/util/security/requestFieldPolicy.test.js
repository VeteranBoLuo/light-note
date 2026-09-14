import { describe, expect, it } from 'vitest';
import { DRAWING_SCENE_MAX_BYTES } from '@lightnote/shared/drawing-note';
import {
  DRAWING_THUMBNAIL_MAX_BYTES,
  ORGANIZE_SELECTED_ITEMS_MAX_COUNT,
  ORGANIZE_RESOURCE_ID_MAX_LENGTH,
} from '../contentLimits.js';
import { AI_SKILL_NOTE_TRANSFORM_MAX_TEXT_CHARS } from '../aiSkill/limits.js';
import { resolveRequestFieldPolicy } from './requestFieldPolicy.js';

describe('请求字段安全策略', () => {
  it('整理选择数组使用业务条目数预算且保留签名规则', () => {
    const context = {
      method: 'POST',
      path: '/api/organize/suggestions/previews/',
      body: { scope: 'selected', resourceTypes: ['note'], items: [{ type: 'note', id: 'note-1' }] },
    };
    expect(resolveRequestFieldPolicy(context, 'body.items')).toMatchObject({
      semantic: 'organize-selected-items',
      sizeUnit: 'items',
      size: 1,
      maxSize: ORGANIZE_SELECTED_ITEMS_MAX_COUNT,
      trustedEnvelope: true,
      skipSignatureRules: [],
    });
    expect(resolveRequestFieldPolicy({ ...context, method: 'GET' }, 'body.items')).toBeNull();
    expect(resolveRequestFieldPolicy(context, 'body.items[0].id')).toBeNull();
  });

  it.each(
    [
      [],
      [null],
      [['note', 'note-1']],
      [{ type: 'unknown', id: 'note-1' }],
      [{ type: 'file', id: 'note-1' }],
      [{ type: 'note', id: '' }],
      [{ type: 'note', id: 1 }],
      [{ type: 'note', id: 'x'.repeat(ORGANIZE_RESOURCE_ID_MAX_LENGTH + 1) }],
      [{ type: 'note', id: 'note-1', content: 'extra' }],
    ].map((items) => [items]),
  )('畸形整理选择不获得条目预算豁免：%j', (items) => {
    expect(
      resolveRequestFieldPolicy(
        {
          method: 'POST',
          path: '/organize/suggestions/previews',
          body: { scope: 'selected', resourceTypes: ['note'], items },
        },
        'body.items',
      ),
    ).toMatchObject({ trustedEnvelope: false });
  });

  it('超限整理选择在原始数组上计数', () => {
    expect(
      resolveRequestFieldPolicy(
        {
          method: 'POST',
          path: '/organize/suggestions/previews',
          body: {
            scope: 'selected',
            resourceTypes: ['note'],
            items: Array.from({ length: ORGANIZE_SELECTED_ITEMS_MAX_COUNT + 1 }, (_, index) => ({
              type: 'note',
              id: String(index),
            })),
          },
        },
        'body.items',
      ),
    ).toMatchObject({ size: ORGANIZE_SELECTED_ITEMS_MAX_COUNT + 1, overBudget: true, trustedEnvelope: false });
  });

  it('按方法、规范化路由和完整字段路径匹配业务语义', () => {
    const context = {
      method: 'post',
      path: '/api/note/updateDrawingNote/',
      body: { scene: '{"v":4}' },
    };
    expect(resolveRequestFieldPolicy(context, 'body.scene')).toMatchObject({
      semantic: 'drawing-scene',
      maxSize: DRAWING_SCENE_MAX_BYTES,
      trustedEnvelope: true,
      overBudget: false,
    });
    expect(resolveRequestFieldPolicy(context, 'body.title')).toBeNull();
    expect(resolveRequestFieldPolicy({ ...context, path: '/note/other' }, 'body.scene')).toBeNull();
    expect(resolveRequestFieldPolicy({ ...context, method: 'PUT' }, 'body.scene')).toBeNull();
  });

  it('只有形态与业务预算同时满足的派生载荷才获得业务语义预算', () => {
    const valid = resolveRequestFieldPolicy(
      {
        method: 'POST',
        path: '/note/uploadDrawingThumbnail',
        body: { thumbnail: 'data:image/webp;base64,AAAA' },
      },
      'body.thumbnail',
    );
    const malformed = resolveRequestFieldPolicy(
      {
        method: 'POST',
        path: '/note/uploadDrawingThumbnail',
        body: { thumbnail: '; curl https://attacker.invalid' },
      },
      'body.thumbnail',
    );
    expect(valid).toMatchObject({ semantic: 'webp-data-url', trustedEnvelope: true });
    expect(malformed).toMatchObject({ semantic: 'webp-data-url', trustedEnvelope: false });
  });

  it('Base64 派生载荷按解码后的真实字节数使用业务上限', () => {
    const result = resolveRequestFieldPolicy(
      {
        method: 'POST',
        path: '/note/uploadDrawingThumbnail',
        body: {
          thumbnail: `data:image/webp;base64,${Buffer.alloc(DRAWING_THUMBNAIL_MAX_BYTES + 1).toString('base64')}`,
        },
      },
      'body.thumbnail',
    );
    expect(result).toMatchObject({
      sizeUnit: 'decoded-bytes',
      size: DRAWING_THUMBNAIL_MAX_BYTES + 1,
      overBudget: true,
      trustedEnvelope: false,
    });
  });

  it('按 UTF-8 字节数判断手绘场景业务上限', () => {
    const result = resolveRequestFieldPolicy(
      {
        method: 'POST',
        path: '/note/updateDrawingNote',
        body: { scene: '绘'.repeat(Math.ceil(DRAWING_SCENE_MAX_BYTES / 3) + 1) },
      },
      'body.scene',
    );
    expect(result).toMatchObject({ sizeUnit: 'utf8-bytes', overBudget: true, trustedEnvelope: false });
  });

  it.each(['/ai/skills/execute', '/api/ai/skills/stream/'])('只信任精确 AI 技能的笔记原文字段：%s', (path) => {
    const context = {
      method: 'POST',
      path,
      body: {
        skillId: 'note.transform_text',
        input: { text: 'sudo apt update && sudo apt full-upgrade -y' },
      },
    };
    expect(resolveRequestFieldPolicy(context, 'body.input.text')).toMatchObject({
      semantic: 'ai-note-transform-text',
      maxSize: AI_SKILL_NOTE_TRANSFORM_MAX_TEXT_CHARS,
      trustedEnvelope: true,
      overBudget: false,
      skipSignatureRules: '*',
    });
    expect(
      resolveRequestFieldPolicy({ ...context, body: { ...context.body, skillId: 'help.answer' } }, 'body.input.text'),
    ).toMatchObject({ trustedEnvelope: false });
    expect(
      resolveRequestFieldPolicy(
        {
          ...context,
          body: { ...context.body, input: { text: 'x'.repeat(AI_SKILL_NOTE_TRANSFORM_MAX_TEXT_CHARS + 1) } },
        },
        'body.input.text',
      ),
    ).toMatchObject({ trustedEnvelope: false, overBudget: true });
  });

  it.each([
    ['/api/daily-review/items/item-1/action', 'open', 'daily-review-item-action'],
    ['/daily-review/items/item-1/action', 'open_tag_space', 'daily-review-item-action'],
    ['/daily-review/items/item-1/action', 'snooze_7d', 'daily-review-item-action'],
    ['/daily-review/items/item-1/action', 'dismiss', 'daily-review-item-action'],
    ['/daily-review/today/action', 'skip_today', 'daily-review-session-action'],
    ['/api/daily-review/today/action/', 'resume_today', 'daily-review-session-action'],
  ])('每日回顾 action 只按精确方法、路由、字段和值获得枚举语义：%s %s', (path, action, semantic) => {
    expect(resolveRequestFieldPolicy({ method: 'POST', path, body: { action } }, 'body.action')).toMatchObject({
      semantic,
      trustedEnvelope: true,
      overBudget: false,
    });
  });

  it('每日回顾非法 action 不获得安全豁免', () => {
    expect(
      resolveRequestFieldPolicy(
        { method: 'POST', path: '/daily-review/items/item-1/action', body: { action: '; rm -rf /tmp/x' } },
        'body.action',
      ),
    ).toMatchObject({
      semantic: 'daily-review-item-action',
      trustedEnvelope: false,
      fallbackContext: 'identifier',
    });
    expect(
      resolveRequestFieldPolicy(
        { method: 'PUT', path: '/daily-review/items/item-1/action', body: { action: 'open' } },
        'body.action',
      ),
    ).toBeNull();
  });
});

it('浏览器推送凭据豁免绑定精确 POST 和字段形态', () => {
  const value = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)]).toString('base64url');
  const context = {
    method: 'POST',
    path: '/notification/browser/subscribe',
    body: { subscription: { keys: { p256dh: value } } },
  };
  expect(resolveRequestFieldPolicy(context, 'body.subscription.keys.p256dh')?.trustedEnvelope).toBe(true);
  expect(resolveRequestFieldPolicy({ ...context, method: 'GET' }, 'body.subscription.keys.p256dh')).toBeNull();
  expect(
    resolveRequestFieldPolicy({ ...context, path: '/notification/send' }, 'body.subscription.keys.p256dh'),
  ).toBeNull();
  expect(
    resolveRequestFieldPolicy(
      { ...context, body: { subscription: { keys: { p256dh: "' OR 1=1" } } } },
      'body.subscription.keys.p256dh',
    )?.trustedEnvelope,
  ).toBe(false);
});
