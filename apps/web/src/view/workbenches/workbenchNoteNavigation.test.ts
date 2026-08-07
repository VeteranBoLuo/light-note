import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const desktopSource = readFileSync(resolve(process.cwd(), 'src/view/workbenches/DesktopWorkbenchView.vue'), 'utf8');
const mobileSource = readFileSync(resolve(process.cwd(), 'src/view/workbenches/MobileTodayView.vue'), 'utf8');
const actionSource = readFileSync(
  resolve(process.cwd(), 'src/components/workbenches/TodayActionSection.vue'),
  'utf8',
);

describe('今日与工作台打开笔记时记录返回来源', () => {
  it('桌面工作台最近笔记携带当前工作台地址', () => {
    expect(desktopSource).toMatch(
      /function openContinueItem[\s\S]*?path: `\/noteLibrary\/\$\{item\.raw\.id\}`[\s\S]*?from: router\.currentRoute\.value\.fullPath/,
    );
  });

  it('移动端今日继续处理笔记保留服务端目标参数并补充来源', () => {
    expect(mobileSource).toMatch(
      /function openContinueItem[\s\S]*?item\.type !== 'note'[\s\S]*?query: \{ \.\.\.target\.query, from: router\.currentRoute\.value\.fullPath \}/,
    );
  });

  it('今日待整理笔记也携带当前工作台地址', () => {
    expect(actionSource).toMatch(
      /item\.resourceType === 'note'[\s\S]*?organize: 'inbox', from: router\.currentRoute\.value\.fullPath/,
    );
  });
});
