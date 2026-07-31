import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findBlankRowInBand } from './htmlToPdf';

/**
 * 构造一条 RGBA 像素带。`rows` 里每一项描述一行:
 * - 'blank'：整行纯白(背景)
 * - 'text' ：行内有深色像素(文字笔画)
 * - 'transparent'：整行 alpha=0
 */
function band(rows: Array<'blank' | 'text' | 'transparent'>, width = 20) {
  const data = new Uint8ClampedArray(width * rows.length * 4);
  rows.forEach((kind, row) => {
    for (let x = 0; x < width; x += 1) {
      const i = (row * width + x) * 4;
      if (kind === 'transparent') continue; // 全 0，alpha=0
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = 255;
    }
    if (kind === 'text') {
      // 笔画落在行中部，且宽度覆盖采样步长，模拟真实文字
      const start = Math.floor(width / 2);
      for (let x = start; x < start + 4 && x < width; x += 1) {
        const i = (row * width + x) * 4;
        data[i] = 20;
        data[i + 1] = 20;
        data[i + 2] = 20;
        data[i + 3] = 255;
      }
    }
  });
  return { data, width, height: rows.length };
}

describe('findBlankRowInBand', () => {
  it('优先返回最靠下的空白行，让切点尽量贴近理想位置', () => {
    const { data, width, height } = band(['blank', 'text', 'blank', 'blank', 'text']);
    // 第 4 行是文字，往上最近的空白行是第 3 行
    expect(findBlankRowInBand(data, width, height)).toBe(3);
  });

  it('文字行紧贴底部时回退到它上方的空白行，不会切开这行字', () => {
    const { data, width, height } = band(['blank', 'blank', 'text', 'text']);
    expect(findBlankRowInBand(data, width, height)).toBe(1);
  });

  it('整条带都是内容时返回 -1，交由调用方退化为硬切（通栏大图/长表格）', () => {
    const { data, width, height } = band(['text', 'text', 'text']);
    expect(findBlankRowInBand(data, width, height)).toBe(-1);
  });

  it('全透明行等同背景，可作为切点', () => {
    const { data, width, height } = band(['text', 'transparent']);
    expect(findBlankRowInBand(data, width, height)).toBe(1);
  });

  it('接近纯白的反锯齿边缘仍算空白，不因抗锯齿噪点误判为文字', () => {
    const { data, width, height } = band(['text', 'blank']);
    // 把末行部分像素改成 252(高于阈值 250)，模拟反锯齿残留
    const lastRowStart = 1 * width * 4;
    data[lastRowStart + 40] = 252;
    data[lastRowStart + 41] = 252;
    data[lastRowStart + 42] = 252;
    expect(findBlankRowInBand(data, width, height)).toBe(1);
  });

  it('深色像素低于阈值即判为文字行', () => {
    const { data, width, height } = band(['blank', 'blank']);
    // 在末行中部塞入一段深色，使其不再是空白行
    const start = (1 * width + Math.floor(width / 2)) * 4;
    for (let k = 0; k < 4; k += 1) {
      data[start + k * 4] = 100;
      data[start + k * 4 + 1] = 100;
      data[start + k * 4 + 2] = 100;
    }
    expect(findBlankRowInBand(data, width, height)).toBe(0);
  });
});

/**
 * 分页循环的端到端行为(jsdom 无 canvas 实现，因此 mock 掉 html2canvas / jsPDF)。
 * 关注三件容易出严重问题的事：不死循环、切点落在空白行、图像不被拉伸。
 */
describe('generatePDF 分页', () => {
  const addImage = vi.fn();
  const addPage = vi.fn();
  const save = vi.fn();
  let sourceCanvas: { width: number; height: number; getContext: () => unknown };

  /** 造一个假的长图 canvas：blankRows 里的绝对行号为纯白背景，其余视为文字。 */
  function fakeCanvas(width: number, height: number, blankRows: Set<number>) {
    return {
      width,
      height,
      getContext: () => ({
        getImageData: (_x: number, top: number, w: number, h: number) => {
          const data = new Uint8ClampedArray(w * h * 4);
          for (let row = 0; row < h; row += 1) {
            const value = blankRows.has(top + row) ? 255 : 10;
            for (let px = 0; px < w; px += 1) {
              const i = (row * w + px) * 4;
              data[i] = value;
              data[i + 1] = value;
              data[i + 2] = value;
              data[i + 3] = 255;
            }
          }
          return { data, width: w, height: h };
        },
      }),
    };
  }

  beforeEach(() => {
    addImage.mockClear();
    addPage.mockClear();
    save.mockClear();
    document.body.innerHTML = '<div id="pdf-target">note</div>';
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,stub');
    // jsdom 没有 canvas 实现，桩掉临时切片 canvas 的 2D 上下文（源长图的上下文由 fakeCanvas 提供）
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  async function run() {
    vi.resetModules();
    vi.doMock('html2canvas', () => ({ default: vi.fn(async () => sourceCanvas) }));
    vi.doMock('jspdf', () => ({
      default: class {
        addImage = addImage;
        addPage = addPage;
        save = save;
      },
    }));
    const { generatePDF } = await import('./htmlToPdf');
    // 显式 margins:0,让断言维持「满幅 A4」的简单几何(默认边距另有专门用例)
    await generatePDF('测试笔记', '#pdf-target', { margins: 0 });
  }

  it('整页无空白行时退化为硬切，页数正确且不会死循环', async () => {
    // 3000px 长图、全是内容：A4 下每页约 1414px，应切成 3 页
    sourceCanvas = fakeCanvas(1000, 3000, new Set());
    await run();
    expect(addImage).toHaveBeenCalledTimes(3);
    expect(addPage).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenCalledOnce();
  });

  it('把切点挪到理想位置上方的空白行，文字不再被切成两半', async () => {
    // 理想切点约 1414px；在其上方 1300px 处留一条空白行
    sourceCanvas = fakeCanvas(1000, 3000, new Set([1300]));
    await run();
    const pxPerPt = 3000 / ((3000 * 595.28) / 1000);
    const firstPageHeightPt = addImage.mock.calls[0][5];
    // 第一页应止于 1300px 处，而不是机械等分的 1414px
    expect(firstPageHeightPt).toBeCloseTo(1300 / pxPerPt, 1);
    expect(firstPageHeightPt).toBeLessThan(841.89);
  });

  it('每页高度按同一比例换算，图像不会被纵向拉伸', async () => {
    sourceCanvas = fakeCanvas(1000, 3000, new Set([1300]));
    await run();
    const widthPt = 595.28;
    const scale = widthPt / 1000; // 宽度方向的缩放比
    const totalHeightPt = addImage.mock.calls.reduce((sum, call) => sum + call[5], 0);
    // 各页高度之和应等于整张长图按同一比例缩放后的高度
    expect(totalHeightPt).toBeCloseTo(3000 * scale, 1);
  });
});

describe('withNormalizedZoom / forcePdfLightTheme', () => {
  it('渲染期间原文档 zoom 归一为 1，结束后恢复原值（含异常路径）', async () => {
    const { withNormalizedZoom } = await import('./htmlToPdf');
    document.documentElement.style.zoom = '1.25';
    document.body.style.zoom = '0.9';
    let zoomDuringRun = '';
    await withNormalizedZoom(async () => {
      zoomDuringRun = `${document.documentElement.style.zoom}/${document.body.style.zoom}`;
    });
    expect(zoomDuringRun).toBe('1/1');
    expect(document.documentElement.style.zoom).toBe('1.25');
    expect(document.body.style.zoom).toBe('0.9');

    await expect(
      withNormalizedZoom(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    // 失败也必须恢复，导出报错不能把用户界面缩放弄丢
    expect(document.documentElement.style.zoom).toBe('1.25');
    document.documentElement.style.zoom = '';
    document.body.style.zoom = '';
  });

  it('克隆文档主题固定为浅色（day）', async () => {
    const { forcePdfLightTheme } = await import('./htmlToPdf');
    const cloned = document.implementation.createHTMLDocument('');
    cloned.documentElement.setAttribute('data-theme', 'night');
    forcePdfLightTheme(cloned);
    expect(cloned.documentElement.getAttribute('data-theme')).toBe('day');
  });
});
