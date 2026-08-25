import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/components/manage/bookmarkMg/AiOrganizeModal.vue'), 'utf8');

function styleBlock(selector: string) {
  const start = source.indexOf(`  ${selector} {`);
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf('\n  }', start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

/**
 * 建议列表是 column flex + max-height，条目必须禁止收缩。
 *
 * 曾经出的问题：.aio-item 没有 flex-shrink: 0，建议条数多到超过 46vh 时 flex 默认的
 * flex-shrink: 1 把每一项等比压扁，再被 .aio-item 自己的 overflow: hidden 裁掉，
 * 结果标签行整行消失、标题被切掉半截，看起来像后端没返回标签。
 * 条数少时不触发，人工回归极容易漏掉，所以这里锁死。
 */
describe('AI 整理建议列表布局', () => {
  it('列表用 max-height + 纵向滚动承载多条建议', () => {
    const list = styleBlock('.aio-list');
    expect(list).toMatch(/flex-direction:\s*column/);
    expect(list).toMatch(/max-height:/);
    expect(list).toMatch(/overflow-y:\s*auto/);
  });

  it('条目禁止收缩，否则会被压扁并裁掉标签行', () => {
    expect(styleBlock('.aio-item')).toMatch(/flex-shrink:\s*0/);
  });

  it('标签行与标题都在条目内渲染，标题长了走省略号而不是撑开', () => {
    expect(source).toMatch(/<div class="aio-tags">/);
    expect(styleBlock('.aio-item-name')).toMatch(/text-overflow:\s*ellipsis/);
  });

  it('所选资源使用 selected 范围并消费服务端确认过的当前批次', () => {
    expect(source).toContain("scope: isSelectedScope.value ? 'selected' : 'untagged'");
    expect(source).toContain('requestIds');
    expect(source).toMatch(/selectedQueue\.value = selectedQueue\.value\.filter/);
  });

  it('明确提示带加号的建议会在应用时创建账号级新标签', () => {
    expect(source).toContain('v-if="hasSelectedNewTags"');
    expect(source).toContain("$t('bookmarkMg.aiOrganizeNewTagHint')");
  });
});
