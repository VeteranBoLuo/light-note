import { describe, expect, it } from 'vitest';
import { containsUnverifiedExecutionClaim, guardUnverifiedExecutionClaim } from './executionClaimGuard.js';

describe('executionClaimGuard', () => {
  it.each([
    '我已经帮你删除了这篇笔记。',
    '已为你成功修改待办状态。',
    '操作成功。',
    '✅ 待办“测试代办”已标记为已完成。',
    '待办“测试代办”已经完成了。',
    '笔记“引用测试”已被删除。',
    'I have successfully deleted the note.',
    'The note has been deleted.',
  ])('识别 AI 自称执行成功：%s', (answer) => {
    expect(containsUnverifiedExecutionClaim(answer)).toBe(true);
  });

  it.each(['你目前有 3 条已完成待办。', '你可以在笔记库里删除这篇笔记。', '这篇笔记是你之前已经创建的。'])(
    '不误伤查询事实或产品说明：%s',
    (answer) => {
      expect(containsUnverifiedExecutionClaim(answer)).toBe(false);
    },
  );

  it('只在动作相关请求中替换无回执成功声明', () => {
    expect(
      guardUnverifiedExecutionClaim('我已经帮你删除了笔记。', {
        actionRelated: true,
        locale: 'zh-CN',
      }),
    ).toEqual({
      guarded: true,
      answer: '该操作尚未执行：服务端没有生成可核验的确认或成功回执。',
    });
    expect(
      guardUnverifiedExecutionClaim('我已经帮你删除了笔记。', {
        actionRelated: false,
      }).guarded,
    ).toBe(false);
  });
});
