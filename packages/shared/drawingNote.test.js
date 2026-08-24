import { describe, expect, it } from "vitest";
import {
  DRAWING_PAGE,
  DRAWING_SCENE_VERSION,
  DRAWING_SCENE_LIMITS,
  DRAWING_STROKE_WIDTHS,
  DRAWING_THUMBNAIL_RENDERER_VERSION,
  DrawingSceneValidationError,
  createEmptyDrawingScene,
  parseDrawingScene,
  serializeDrawingScene,
  upgradeDrawingScene,
} from "./drawingNote.js";

describe("drawingNote scene protocol", () => {
  it("缩略图渲染器版本与正文 scene 版本独立演进", () => {
    expect(DRAWING_THUMBNAIL_RENDERER_VERSION).toBe(3);
    expect(DRAWING_THUMBNAIL_RENDERER_VERSION).not.toBe(DRAWING_SCENE_VERSION);
  });

  it("提供覆盖细线到粗线的五档快捷笔画宽度", () => {
    expect(DRAWING_STROKE_WIDTHS).toEqual([2, 4, 7, 12, 20]);
  });

  it("创建并稳定序列化空白场景", () => {
    const empty = createEmptyDrawingScene();
    expect(empty).toEqual({ v: 4, page: DRAWING_PAGE, elements: [] });
    expect(parseDrawingScene(serializeDrawingScene(empty))).toEqual(empty);
  });

  it("无损将 V1 竖版场景水平居中升级为当前方形场景", () => {
    const upgraded = upgradeDrawingScene({
      v: 1,
      page: { width: 1024, height: 1448 },
      elements: [
        {
          id: "s",
          kind: "stroke",
          color: "#1f2937",
          width: 2,
          points: [0, 10, 1024, 20],
        },
        {
          id: "t",
          kind: "text",
          x: 20,
          y: 30,
          width: 180,
          fontSize: 20,
          color: "#1f2937",
          text: "文本",
        },
      ],
    });
    expect(upgraded.v).toBe(DRAWING_SCENE_VERSION);
    expect(upgraded.page).toEqual(DRAWING_PAGE);
    expect(upgraded.elements[0].points).toEqual([212, 10, 1236, 20]);
    expect(upgraded.elements[1].x).toBe(232);
  });

  it("升级时保留 V1 协议允许的最右侧坐标", () => {
    const upgraded = upgradeDrawingScene({
      v: 1,
      page: { width: 1024, height: 1448 },
      elements: [
        {
          id: "s",
          kind: "stroke",
          color: "#1f2937",
          width: 2,
          points: [8192, 10, 8192, 20],
        },
      ],
    });
    expect(upgraded.elements[0].points).toEqual([8404, 10, 8404, 20]);
  });

  it("只保留受支持字段并规范坐标精度", () => {
    expect(
      parseDrawingScene({
        v: 1,
        page: { width: 1024, height: 1448 },
        ignored: true,
        elements: [
          {
            id: "s_1",
            kind: "stroke",
            color: "#00a884",
            width: 4,
            points: [1.234, 2.345],
            extra: 1,
          },
          {
            id: "t_1",
            kind: "text",
            x: 10,
            y: 20,
            width: 180,
            fontSize: 28,
            color: "#1f2937",
            text: "文本",
          },
        ],
      }),
    ).toEqual({
      v: 1,
      page: { width: 1024, height: 1448 },
      elements: [
        {
          id: "s_1",
          kind: "stroke",
          color: "#00a884",
          width: 4,
          points: [1.23, 2.35],
        },
        {
          id: "t_1",
          kind: "text",
          x: 10,
          y: 20,
          width: 180,
          fontSize: 28,
          color: "#1f2937",
          text: "文本",
        },
      ],
    });
  });

  it("接受安全的自定义十六进制颜色并规范为小写", () => {
    expect(
      parseDrawingScene({
        v: 1,
        page: { width: 1024, height: 1448 },
        elements: [
          {
            id: "s",
            kind: "stroke",
            color: "#A1B2C3",
            width: 2,
            points: [0, 0],
          },
        ],
      }).elements[0].color,
    ).toBe("#a1b2c3");
  });

  it("接受范围内的连续整数画笔宽度和文字字号", () => {
    const parsed = parseDrawingScene({
      v: 1,
      page: { width: 1024, height: 1448 },
      elements: [
        {
          id: "s",
          kind: "stroke",
          color: "#1f2937",
          width: 11,
          points: [0, 0, 10, 10],
        },
        {
          id: "t",
          kind: "text",
          x: 10,
          y: 20,
          width: 180,
          fontSize: 42,
          color: "#1f2937",
          text: "文本",
        },
      ],
    });

    expect(parsed.elements[0].width).toBe(11);
    expect(parsed.elements[1].fontSize).toBe(42);
  });

  it("V2 接受正式形状元素并保留线条方向", () => {
    const parsed = parseDrawingScene({
      v: 2,
      page: DRAWING_PAGE,
      elements: [
        {
          id: "shape_1",
          kind: "shape",
          shape: "arrow",
          x: 320,
          y: 280,
          width: -120.126,
          height: 80.125,
          color: "#615CED",
          strokeWidth: 4,
        },
      ],
    });

    expect(parsed.elements[0]).toEqual({
      id: "shape_1",
      kind: "shape",
      shape: "arrow",
      x: 320,
      y: 280,
      width: -120.13,
      height: 80.13,
      color: "#615ced",
      strokeWidth: 4,
    });
  });

  it("V3 保存笔画专属擦除轨迹，升级 V2 时不改变现有坐标", () => {
    const upgraded = upgradeDrawingScene({
      v: 2,
      page: DRAWING_PAGE,
      elements: [
        {
          id: "s",
          kind: "stroke",
          color: "#1f2937",
          width: 20,
          points: [20, 30, 120, 30],
        },
      ],
    });
    expect(upgraded).toEqual({
      v: DRAWING_SCENE_VERSION,
      page: DRAWING_PAGE,
      elements: [
        {
          id: "s",
          kind: "stroke",
          color: "#1f2937",
          width: 20,
          points: [20, 30, 120, 30],
        },
      ],
    });

    const parsed = parseDrawingScene({
      ...upgraded,
      elements: [
        {
          ...upgraded.elements[0],
          erasures: [{ id: "erase_1", width: 4, points: [70.126, 30.125] }],
        },
      ],
    });
    expect(parsed.elements[0].erasures).toEqual([
      { id: "erase_1", width: 4, points: [70.13, 30.13] },
    ]);
  });

  it("V3 同样保存形状专属擦除轨迹并计入统一擦除上限", () => {
    const parsed = parseDrawingScene({
      v: 3,
      page: DRAWING_PAGE,
      elements: [
        {
          id: "shape_1",
          kind: "shape",
          shape: "rectangle",
          x: 10,
          y: 20,
          width: 100,
          height: 80,
          color: "#1f2937",
          strokeWidth: 20,
          erasures: [{ id: "erase_shape", width: 4, points: [60.126, 20.125] }],
        },
      ],
    });

    expect(parsed.elements[0].erasures).toEqual([
      { id: "erase_shape", width: 4, points: [60.13, 20.13] },
    ]);
  });

  it("V4 保存有界、规范排序的闭合区域填充", () => {
    const parsed = parseDrawingScene({
      v: 4,
      page: DRAWING_PAGE,
      elements: [
        {
          id: "fill_1",
          kind: "fill",
          color: "#00A884",
          x: 0,
          y: 0,
          spans: [10, 20, 40, 11, 18, 42],
        },
      ],
    });
    expect(parsed.elements[0]).toEqual({
      id: "fill_1",
      kind: "fill",
      color: "#00a884",
      x: 0,
      y: 0,
      spans: [10, 20, 40, 11, 18, 42],
    });
  });

  it("旧版本拒绝填充元素，V4 拒绝重叠或越界扫描段", () => {
    const fill = {
      id: "fill",
      kind: "fill",
      color: "#00a884",
      x: 0,
      y: 0,
      spans: [10, 20, 40],
    };
    expect(() =>
      parseDrawingScene({ v: 3, page: DRAWING_PAGE, elements: [fill] }),
    ).toThrow("手绘元素类型不受支持");
    expect(() =>
      parseDrawingScene({
        v: 4,
        page: DRAWING_PAGE,
        elements: [{ ...fill, spans: [10, 20, 40, 10, 39, 50] }],
      }),
    ).toThrow("填充区域坐标无效");
  });

  it("V3 拒绝非法或超量的擦除轨迹", () => {
    const base = {
      id: "s",
      kind: "stroke",
      color: "#1f2937",
      width: 20,
      points: [20, 30, 120, 30],
    };
    expect(() =>
      parseDrawingScene({
        v: 3,
        page: DRAWING_PAGE,
        elements: [
          { ...base, erasures: [{ id: "erase", width: 3, points: [70, 30] }] },
        ],
      }),
    ).toThrow("橡皮擦宽度 不受支持");
    expect(() =>
      parseDrawingScene({
        v: 3,
        page: DRAWING_PAGE,
        elements: [
          {
            ...base,
            erasures: Array.from(
              { length: DRAWING_SCENE_LIMITS.maxErasureTrails + 1 },
              (_, index) => ({
                id: `e${index}`,
                width: 4,
                points: [70, 30],
              }),
            ),
          },
        ],
      }),
    ).toThrow("橡皮擦轨迹数量超出限制");
  });

  it("V1 拒绝形状元素，避免旧协议客户端误接收未知内容", () => {
    expect(() =>
      parseDrawingScene({
        v: 1,
        page: { width: 1024, height: 1448 },
        elements: [
          {
            id: "shape_1",
            kind: "shape",
            shape: "rectangle",
            x: 10,
            y: 20,
            width: 100,
            height: 80,
            color: "#1f2937",
            strokeWidth: 4,
          },
        ],
      }),
    ).toThrow("手绘元素类型不受支持");
  });

  it("V2 拒绝未知形状与超出数量上限的形状", () => {
    const rectangle = (id) => ({
      id,
      kind: "shape",
      shape: "rectangle",
      x: 10,
      y: 20,
      width: 100,
      height: 80,
      color: "#1f2937",
      strokeWidth: 4,
    });
    expect(() =>
      parseDrawingScene({
        v: 2,
        page: DRAWING_PAGE,
        elements: [{ ...rectangle("shape"), shape: "star" }],
      }),
    ).toThrow("手绘形状不受支持");
    expect(() =>
      parseDrawingScene({
        v: 2,
        page: DRAWING_PAGE,
        elements: Array.from(
          { length: DRAWING_SCENE_LIMITS.maxShapes + 1 },
          (_, index) => rectangle(`s${index}`),
        ),
      }),
    ).toThrow("手绘形状数量超出限制");
  });

  it.each([
    [
      "脚本色值",
      {
        id: "s",
        kind: "stroke",
        color: "url(javascript:1)",
        width: 2,
        points: [0, 0],
      },
    ],
    [
      "奇数坐标",
      {
        id: "s",
        kind: "stroke",
        color: "#1f2937",
        width: 2,
        points: [0, 0, 1],
      },
    ],
    [
      "过细画笔",
      { id: "s", kind: "stroke", color: "#1f2937", width: 0, points: [0, 0] },
    ],
    [
      "过粗画笔",
      { id: "s", kind: "stroke", color: "#1f2937", width: 25, points: [0, 0] },
    ],
    [
      "非整数画笔",
      { id: "s", kind: "stroke", color: "#1f2937", width: 3.5, points: [0, 0] },
    ],
    [
      "未知形状",
      {
        id: "shape",
        kind: "shape",
        shape: "star",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        color: "#1f2937",
        strokeWidth: 4,
      },
    ],
    ["外链元素", { id: "i", kind: "image", url: "https://example.com/a.png" }],
  ])("拒绝%s", (_label, element) => {
    expect(() =>
      parseDrawingScene({
        v: 1,
        page: { width: 1024, height: 1448 },
        elements: [element],
      }),
    ).toThrow(DrawingSceneValidationError);
  });

  it("拒绝超出点数上限的场景", () => {
    const points = Array.from(
      { length: (DRAWING_SCENE_LIMITS.maxPointPairs + 1) * 2 },
      () => 1,
    );
    expect(() =>
      parseDrawingScene({
        v: 1,
        page: { width: 1024, height: 1448 },
        elements: [
          { id: "s", kind: "stroke", color: "#1f2937", width: 2, points },
        ],
      }),
    ).toThrow("画笔轨迹点数量超出限制");
  });
});
