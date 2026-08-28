// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from '@vue/compiler-sfc';
import { describe, expect, it } from 'vitest';

function readTemplate(relativePath: string) {
  const filename = resolve(process.cwd(), 'src', relativePath);
  const source = readFileSync(filename, 'utf8');
  const { descriptor } = parse(source, { filename });
  return descriptor.template?.ast;
}

function rootElements(ast: ReturnType<typeof readTemplate>) {
  return (ast?.children || []).filter((node) => node.type === 1);
}

describe('标签空间路由布局', () => {
  it('路由页与索引页都保持单一 DOM 根节点，确保 RouterView 定位样式可透传', () => {
    const routeRoots = rootElements(readTemplate('view/manage/TagMg.vue'));
    const indexRoots = rootElements(readTemplate('components/tagSpace/TagSpaceIndex.vue'));

    expect(routeRoots).toHaveLength(1);
    expect(indexRoots).toHaveLength(1);
    expect(routeRoots[0]).toMatchObject({ tag: 'div' });
    expect(indexRoots[0]).toMatchObject({ tag: 'div' });
  });
});
