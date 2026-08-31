import type {
  ProductionPresentationContentV1,
  ProductionPresentationElementV1,
  ProductionPresentationShapeElementV1,
} from '@lightnote/shared/production-project-protocol';
import {
  addDeterministicZipFile,
  escapeXml,
  markupBodyToPlainText,
  ooxmlCoreProperties,
  productionProjectFileName,
  type ProductionProjectExportFile,
} from '@/utils/productionProjectExportHelpers';

const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const SLIDE_WIDTH = 1600;

const PRESENTATION_EXPORT_LINE_LIMITS = Object.freeze({
  title: 8,
  section: 10,
  content: 16,
  two_column: 24,
  blank: Number.POSITIVE_INFINITY,
});

const PRESENTATION_EXPORT_LINE_WIDTH_UNITS = Object.freeze({
  title: 60,
  section: 48,
  content: 72,
  two_column: 32,
  blank: Number.POSITIVE_INFINITY,
});

const PRESENTATION_EXPORT_TITLE_LINE_LIMITS = Object.freeze({
  title: 2,
  section: 2,
  content: 2,
  two_column: 2,
  blank: 0,
});

const PRESENTATION_EXPORT_TITLE_WIDTH_UNITS = Object.freeze({
  title: 56,
  section: 46,
  content: 68,
  two_column: 68,
  blank: Number.POSITIVE_INFINITY,
});

export interface ProductionPresentationExportOverflowIssue {
  slideIndex: number;
  slideNumber: number;
  title: string;
  layout: ProductionPresentationContentV1['slides'][number]['layout'];
  field: 'title' | 'body' | 'blank';
  lineCount: number;
  maxLines: number;
}

export class ProductionPresentationExportOverflowError extends Error {
  readonly code = 'PRODUCTION_PRESENTATION_EXPORT_OVERFLOW';
  readonly issues: readonly ProductionPresentationExportOverflowIssue[];

  constructor(issues: readonly ProductionPresentationExportOverflowIssue[]) {
    super('One or more slides contain content that their export layout cannot safely display');
    this.name = 'ProductionPresentationExportOverflowError';
    this.issues = issues;
  }
}

export interface ProductionSlideRenderSnapshot {
  index: number;
  width: number;
  height: number;
  svg: string;
}

export type ProductionSlidePngRenderer = (snapshot: ProductionSlideRenderSnapshot) => Promise<Blob>;

function assertPresentationSnapshot(content: ProductionPresentationContentV1) {
  if (content?.type !== 'presentation' || content.schemaVersion !== 1) {
    throw new Error('Unsupported production presentation snapshot');
  }
  return content;
}

function colorWithoutHash(value: string, fallback: string) {
  return /^#[0-9a-f]{6}$/iu.test(value) ? value.slice(1).toUpperCase() : fallback;
}

function contrastingTextColor(background: string) {
  const color = colorWithoutHash(background, 'FFFFFF');
  const red = Number.parseInt(color.slice(0, 2), 16);
  const green = Number.parseInt(color.slice(2, 4), 16);
  const blue = Number.parseInt(color.slice(4, 6), 16);
  return red * 0.299 + green * 0.587 + blue * 0.114 < 145 ? 'F4F6FF' : '20232D';
}

function presentationDimensions(content: ProductionPresentationContentV1) {
  return content.canvas.aspectRatio === '4:3'
    ? { width: SLIDE_WIDTH, height: 1200, cx: 12_192_000, cy: 9_144_000 }
    : { width: SLIDE_WIDTH, height: 900, cx: 12_192_000, cy: 6_858_000 };
}

function characterWidthUnits(character: string) {
  if (/\s/u.test(character)) return 0.5;
  if (/[MWmw@%&#]/u.test(character)) return 1.8;
  if (/[A-Z]/u.test(character)) return 1.35;
  if (/[ilI1|.,:;'`]/u.test(character)) return 0.55;
  return /^[\u0000-\u00ff]$/u.test(character) ? 1 : 2;
}

function wrapExportLine(value: string, maxWidthUnits: number) {
  if (!Number.isFinite(maxWidthUnits)) return [value];
  const wrapped: string[] = [];
  let line = '';
  let widthUnits = 0;
  for (const character of Array.from(value)) {
    const nextUnits = characterWidthUnits(character);
    if (line && widthUnits + nextUnits > maxWidthUnits) {
      wrapped.push(line.trimEnd());
      line = character.trimStart();
      widthUnits = line ? nextUnits : 0;
      continue;
    }
    line += character;
    widthUnits += nextUnits;
  }
  if (line || !wrapped.length) wrapped.push(line.trimEnd());
  return wrapped.filter(Boolean);
}

function slideLines(content: ProductionPresentationContentV1, index: number) {
  const slide = content.slides[index];
  const maxWidthUnits = PRESENTATION_EXPORT_LINE_WIDTH_UNITS[slide.layout];
  return markupBodyToPlainText(slide.body)
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => wrapExportLine(line, maxWidthUnits));
}

function slideTitleLines(content: ProductionPresentationContentV1, index: number) {
  const slide = content.slides[index];
  const value = slide.title.trim() || `Slide ${index + 1}`;
  return wrapExportLine(value, PRESENTATION_EXPORT_TITLE_WIDTH_UNITS[slide.layout]);
}

function blankSlideHasHiddenText(content: ProductionPresentationContentV1, index: number) {
  const slide = content.slides[index];
  return Boolean(slide.title.trim() || markupBodyToPlainText(slide.body).trim());
}

export function productionPresentationExportOverflowIssues(
  content: ProductionPresentationContentV1,
): readonly ProductionPresentationExportOverflowIssue[] {
  const snapshot = assertPresentationSnapshot(content);
  return snapshot.slides.flatMap((slide, slideIndex) => {
    if (slide.layout === 'blank') {
      if (!blankSlideHasHiddenText(snapshot, slideIndex)) return [];
      return [
        {
          slideIndex,
          slideNumber: slideIndex + 1,
          title: slide.title,
          layout: slide.layout,
          field: 'blank' as const,
          lineCount: 1,
          maxLines: 0,
        },
      ];
    }
    const issues: ProductionPresentationExportOverflowIssue[] = [];
    const titleLineCount = slideTitleLines(snapshot, slideIndex).length;
    const maxTitleLines = PRESENTATION_EXPORT_TITLE_LINE_LIMITS[slide.layout];
    if (titleLineCount > maxTitleLines) {
      issues.push({
        slideIndex,
        slideNumber: slideIndex + 1,
        title: slide.title,
        layout: slide.layout,
        field: 'title',
        lineCount: titleLineCount,
        maxLines: maxTitleLines,
      });
    }
    const bodyLineCount = slideLines(snapshot, slideIndex).length;
    const maxBodyLines = PRESENTATION_EXPORT_LINE_LIMITS[slide.layout];
    if (bodyLineCount > maxBodyLines) {
      issues.push({
        slideIndex,
        slideNumber: slideIndex + 1,
        title: slide.title,
        layout: slide.layout,
        field: 'body',
        lineCount: bodyLineCount,
        maxLines: maxBodyLines,
      });
    }
    return issues;
  });
}

export function isProductionPresentationExportOverflowError(
  error: unknown,
): error is ProductionPresentationExportOverflowError {
  return (
    error instanceof ProductionPresentationExportOverflowError ||
    (error instanceof Error &&
      (error as ProductionPresentationExportOverflowError).code === 'PRODUCTION_PRESENTATION_EXPORT_OVERFLOW')
  );
}

function assertPresentationExportFits(content: ProductionPresentationContentV1) {
  const issues = productionPresentationExportOverflowIssues(content);
  if (issues.length) throw new ProductionPresentationExportOverflowError(issues);
}

function fittedLineTypography(lineCount: number, availableHeight: number, preferredSize: number, minimumSize: number) {
  if (!lineCount) return { size: preferredSize, lineHeight: Math.round(preferredSize * 1.6) };
  const lineHeight = Math.max(
    Math.round(minimumSize * 1.3),
    Math.min(Math.round(preferredSize * 1.6), Math.floor(availableHeight / lineCount)),
  );
  return {
    size: Math.max(minimumSize, Math.min(preferredSize, Math.floor(lineHeight * 0.72))),
    lineHeight,
  };
}

function presentationElementGeometry(
  element: ProductionPresentationElementV1,
  dimensions: { width: number; height: number },
) {
  return {
    x: (element.x / 100) * dimensions.width,
    y: (element.y / 100) * dimensions.height,
    width: (element.width / 100) * dimensions.width,
    height: (element.height / 100) * dimensions.height,
  };
}

function presentationElementTextLines(text: string, width: number, fontSize: number) {
  const maxWidthUnits = Math.max(4, width / Math.max(6, fontSize * 0.55));
  return String(text || '')
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .flatMap((line) => wrapExportLine(line, maxWidthUnits));
}

function svgShapeMarkup(element: ProductionPresentationShapeElementV1, width: number, height: number) {
  const fill = element.fill ? escapeXml(element.fill) : 'none';
  const stroke = escapeXml(element.stroke);
  const strokeWidth = element.strokeWidth;
  const common = `fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"`;
  if (element.shape === 'ellipse') {
    return `<ellipse cx="${width / 2}" cy="${height / 2}" rx="${width / 2}" ry="${height / 2}" ${common}/>`;
  }
  if (element.shape === 'triangle') {
    return `<polygon points="${width / 2},0 ${width},${height} 0,${height}" ${common}/>`;
  }
  if (element.shape === 'diamond') {
    return `<polygon points="${width / 2},0 ${width},${height / 2} ${width / 2},${height} 0,${height / 2}" ${common}/>`;
  }
  if (element.shape === 'line' || element.shape === 'arrow') {
    const markerId = `arrow-${escapeXml(element.id)}`;
    const marker =
      element.shape === 'arrow'
        ? `<defs><marker id="${markerId}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${stroke}"/></marker></defs>`
        : '';
    return `${marker}<line x1="0" y1="${height / 2}" x2="${width}" y2="${height / 2}" stroke="${stroke}" stroke-width="${Math.max(1, strokeWidth)}"${element.shape === 'arrow' ? ` marker-end="url(#${markerId})"` : ''}/>`;
  }
  return `<rect width="${width}" height="${height}"${
    element.shape === 'rounded_rectangle' ? ` rx="${Math.min(width, height) * 0.12}"` : ''
  } ${common}/>`;
}

function svgPresentationElements(content: ProductionPresentationContentV1, index: number) {
  const dimensions = presentationDimensions(content);
  return (content.slides[index]?.elements || [])
    .map((element) => {
      const geometry = presentationElementGeometry(element, dimensions);
      const centerX = geometry.x + geometry.width / 2;
      const centerY = geometry.y + geometry.height / 2;
      const transform = element.rotation ? ` transform="rotate(${element.rotation} ${centerX} ${centerY})"` : '';
      if (element.type === 'image') {
        return `<image x="${geometry.x}" y="${geometry.y}" width="${geometry.width}" height="${geometry.height}" href="${escapeXml(element.src)}" preserveAspectRatio="${
          element.fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet'
        }"${transform}/>`;
      }
      const lines = presentationElementTextLines(element.text, geometry.width, element.fontSize);
      const lineHeight = element.fontSize * 1.25;
      const textHeight = Math.max(lineHeight, lines.length * lineHeight);
      const startY =
        element.type === 'text' && element.verticalAlign === 'bottom'
          ? geometry.height - textHeight + element.fontSize
          : element.type === 'text' && element.verticalAlign === 'middle'
            ? (geometry.height - textHeight) / 2 + element.fontSize
            : element.fontSize;
      const alignment = element.type === 'text' ? element.align : 'center';
      const textX = alignment === 'center' ? geometry.width / 2 : alignment === 'right' ? geometry.width : 0;
      const anchor = alignment === 'center' ? 'middle' : alignment === 'right' ? 'end' : 'start';
      const textMarkup = lines.length
        ? `<text x="${textX}" y="${startY}" text-anchor="${anchor}" fill="${escapeXml(element.color)}" font-family="Arial, PingFang SC, sans-serif" font-size="${element.fontSize}"${
            element.type === 'text' ? ` font-weight="${element.fontWeight}"` : ''
          }>${lines
            .map(
              (line, lineIndex) =>
                `<tspan x="${textX}" dy="${lineIndex === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`,
            )
            .join('')}</text>`
        : '';
      const background =
        element.type === 'text'
          ? element.fill
            ? `<rect width="${geometry.width}" height="${geometry.height}" rx="8" fill="${escapeXml(element.fill)}"/>`
            : ''
          : svgShapeMarkup(element, geometry.width, geometry.height);
      return `<g transform="translate(${geometry.x} ${geometry.y})"><g${
        element.rotation ? ` transform="rotate(${element.rotation} ${geometry.width / 2} ${geometry.height / 2})"` : ''
      }>${background}${textMarkup}</g></g>`;
    })
    .join('');
}

export function buildProductionPresentationSlideSvg(content: ProductionPresentationContentV1, index: number) {
  const snapshot = assertPresentationSnapshot(content);
  const slide = snapshot.slides[index];
  if (!slide) throw new Error('Slide index is out of range');
  assertPresentationExportFits(snapshot);
  const { width, height } = presentationDimensions(snapshot);
  const titleLines = slideTitleLines(snapshot, index);
  const lines = slideLines(snapshot, index);
  const accent = escapeXml(snapshot.theme.accent);
  const background = escapeXml(snapshot.theme.background);
  const bodyColor = `#${contrastingTextColor(snapshot.theme.background)}`;
  const textLines = (
    values: string[],
    x: number,
    startY: number,
    options: {
      anchor?: 'start' | 'middle';
      size?: number;
      lineHeight?: number;
      color?: string;
      weight?: number;
    } = {},
  ) =>
    values
      .map(
        (line, lineIndex) =>
          `<text x="${x}" y="${startY + lineIndex * (options.lineHeight ?? 48)}" text-anchor="${options.anchor ?? 'start'}" fill="${options.color ?? bodyColor}" font-family="Arial, PingFang SC, sans-serif" font-size="${options.size ?? 30}"${options.weight ? ` font-weight="${options.weight}"` : ''}><tspan>${escapeXml(line)}</tspan></text>`,
      )
      .join('');
  const backgroundRect = `<rect width="${width}" height="${height}" fill="${background}"/>`;
  let shapes = '';
  if (slide.layout === 'title') {
    const titleTypography = fittedLineTypography(titleLines.length, Math.round(height * 0.25), 72, 44);
    const typography = fittedLineTypography(lines.length, Math.round(height * 0.25), 30, 18);
    shapes = `${textLines(titleLines, width / 2, Math.round(height * 0.29), { anchor: 'middle', color: accent, weight: 700, ...titleTypography })}${textLines(lines, width / 2, Math.round(height * 0.56), { anchor: 'middle', ...typography })}<rect x="${Math.round(width * 0.18)}" y="${Math.round(height * 0.82)}" width="${Math.round(width * 0.64)}" height="8" rx="4" fill="${accent}"/>`;
  } else if (slide.layout === 'section') {
    const titleTypography = fittedLineTypography(titleLines.length, Math.round(height * 0.25), 68, 42);
    const typography = fittedLineTypography(lines.length, Math.round(height * 0.34), 30, 20);
    shapes = `<rect width="${Math.round(width * 0.28)}" height="${height}" fill="${accent}"/>${textLines(titleLines, Math.round(width * 0.35), Math.round(height * 0.27), { color: accent, weight: 700, ...titleTypography })}${textLines(lines, Math.round(width * 0.35), Math.round(height * 0.55), typography)}`;
  } else if (slide.layout === 'two_column') {
    const midpoint = Math.ceil(lines.length / 2);
    const titleTypography = fittedLineTypography(titleLines.length, Math.round(height * 0.18), 58, 36);
    const typography = fittedLineTypography(Math.ceil(lines.length / 2), height - 365, 29, 20);
    shapes = `<rect width="${width}" height="14" fill="${accent}"/>${textLines(titleLines, 100, 105, { color: accent, weight: 700, ...titleTypography })}<line x1="${width / 2}" y1="245" x2="${width / 2}" y2="${height - 90}" stroke="${accent}" stroke-opacity=".28" stroke-width="3"/>${textLines(lines.slice(0, midpoint), 100, 295, typography)}${textLines(lines.slice(midpoint), width / 2 + 70, 295, typography)}`;
  } else if (slide.layout === 'content') {
    const titleTypography = fittedLineTypography(titleLines.length, Math.round(height * 0.18), 58, 36);
    const typography = fittedLineTypography(lines.length, height - 350, 32, 22);
    shapes = `<rect x="0" y="0" width="18" height="${height}" fill="${accent}"/>${textLines(titleLines, 120, 105, { color: accent, weight: 700, ...titleTypography })}<line x1="120" y1="245" x2="${width - 120}" y2="245" stroke="${accent}" stroke-width="4"/>${textLines(lines, 120, 295, typography)}`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" data-layout="${slide.layout}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${backgroundRect}${shapes}${svgPresentationElements(snapshot, index)}</svg>`;
}

async function defaultSlidePngRenderer(snapshot: ProductionSlideRenderSnapshot) {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    throw new Error('PNG slide rendering requires a browser document');
  }
  const source = new Blob([snapshot.svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(source);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const next = new Image();
      next.onload = () => resolve(next);
      next.onerror = () => reject(new Error('Slide SVG could not be rendered'));
      next.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = snapshot.width;
    canvas.height = snapshot.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))), 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function pptxTextParagraph(
  text: string,
  size: number,
  color: string,
  bold = false,
  alignment: 'l' | 'ctr' | 'r' = 'l',
) {
  return `<a:p><a:pPr algn="${alignment}"/><a:r><a:rPr lang="zh-CN" sz="${size}"${bold ? ' b="1"' : ''}><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:rPr><a:t>${escapeXml(text)}</a:t></a:r><a:endParaRPr lang="zh-CN" sz="${size}"/></a:p>`;
}

function pptxTextShape(
  id: number,
  name: string,
  x: number,
  y: number,
  cx: number,
  cy: number,
  paragraphs: string,
  anchor: 't' | 'ctr' | 'b' = 't',
) {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${escapeXml(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" anchor="${anchor}"/><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`;
}

function pptxSolidRectShape(id: number, name: string, x: number, y: number, cx: number, cy: number, color: string) {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${escapeXml(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`;
}

function pptxElementGeometry(element: ProductionPresentationElementV1, content: ProductionPresentationContentV1) {
  const dimensions = presentationDimensions(content);
  return {
    x: Math.round((element.x / 100) * dimensions.cx),
    y: Math.round((element.y / 100) * dimensions.cy),
    cx: Math.round((element.width / 100) * dimensions.cx),
    cy: Math.round((element.height / 100) * dimensions.cy),
    rotation: Math.round(element.rotation * 60_000),
  };
}

function pptxPresentationElement(
  element: ProductionPresentationElementV1,
  content: ProductionPresentationContentV1,
  index: number,
  imageRelationshipIds: ReadonlyMap<string, string>,
) {
  const id = 100 + index;
  const geometry = pptxElementGeometry(element, content);
  const rotation = geometry.rotation ? ` rot="${geometry.rotation}"` : '';
  if (element.type === 'image') {
    const relationshipId = imageRelationshipIds.get(element.id);
    if (!relationshipId) return '';
    return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${escapeXml(element.alt || `Image ${index + 1}`)}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm${rotation}><a:off x="${geometry.x}" y="${geometry.y}"/><a:ext cx="${geometry.cx}" cy="${geometry.cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr></p:pic>`;
  }
  const alignment =
    element.type === 'text' ? ({ left: 'l', center: 'ctr', right: 'r' } as const)[element.align] : 'ctr';
  const paragraphs = presentationElementTextLines(element.text, (element.width / 100) * SLIDE_WIDTH, element.fontSize)
    .map((line) =>
      pptxTextParagraph(
        line,
        Math.round(element.fontSize * 100),
        colorWithoutHash(element.color, '20232D'),
        element.type === 'text' && element.fontWeight >= 600,
        alignment,
      ),
    )
    .join('');
  const anchor =
    element.type === 'text' ? ({ top: 't', middle: 'ctr', bottom: 'b' } as const)[element.verticalAlign] : 'ctr';
  const fill =
    element.fill === null
      ? '<a:noFill/>'
      : `<a:solidFill><a:srgbClr val="${colorWithoutHash(element.fill, 'FFFFFF')}"/></a:solidFill>`;
  if (element.type === 'text') {
    return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text ${index + 1}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm${rotation}><a:off x="${geometry.x}" y="${geometry.y}"/><a:ext cx="${geometry.cx}" cy="${geometry.cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fill}<a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" anchor="${anchor}"/><a:lstStyle/>${paragraphs || pptxTextParagraph('', 1200, '20232D')}</p:txBody></p:sp>`;
  }
  const preset = (
    {
      rectangle: 'rect',
      rounded_rectangle: 'roundRect',
      ellipse: 'ellipse',
      triangle: 'triangle',
      diamond: 'diamond',
      line: 'line',
      arrow: 'line',
    } as const
  )[element.shape];
  const stroke = colorWithoutHash(element.stroke, '615CED');
  const line = `<a:ln w="${Math.max(1, Math.round(element.strokeWidth * 12_700))}"><a:solidFill><a:srgbClr val="${stroke}"/></a:solidFill>${element.shape === 'arrow' ? '<a:tailEnd type="triangle"/>' : ''}</a:ln>`;
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${escapeXml(element.shape)} ${index + 1}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm${rotation}><a:off x="${geometry.x}" y="${geometry.y}"/><a:ext cx="${geometry.cx}" cy="${geometry.cy}"/></a:xfrm><a:prstGeom prst="${preset}"><a:avLst/></a:prstGeom>${fill}${line}</p:spPr>${paragraphs ? `<p:txBody><a:bodyPr wrap="square" anchor="ctr"/><a:lstStyle/>${paragraphs}</p:txBody>` : ''}</p:sp>`;
}

function pptxPresentationElements(
  content: ProductionPresentationContentV1,
  index: number,
  imageRelationshipIds: ReadonlyMap<string, string>,
) {
  return (content.slides[index]?.elements || [])
    .map((element, elementIndex) => pptxPresentationElement(element, content, elementIndex, imageRelationshipIds))
    .join('');
}

function pptxSlideShapes(content: ProductionPresentationContentV1, index: number) {
  const slide = content.slides[index];
  const dimensions = presentationDimensions(content);
  const accent = colorWithoutHash(content.theme.accent, '615CED');
  const textColor = contrastingTextColor(content.theme.background);
  const titleLines = slideTitleLines(content, index);
  const lines = slideLines(content, index);
  const bodyParagraphs = (values: string[], alignment: 'l' | 'ctr' = 'l', size = 1800) =>
    (values.length ? values : ['']).map((line) => pptxTextParagraph(line, size, textColor, false, alignment)).join('');
  const titleParagraphs = (values: string[], alignment: 'l' | 'ctr', size: number) =>
    values.map((line) => pptxTextParagraph(line, size, accent, true, alignment)).join('');
  if (slide.layout === 'blank') return '';
  if (slide.layout === 'title') {
    const titleTypography = fittedLineTypography(titleLines.length, Math.round(dimensions.height * 0.25), 72, 44);
    const typography = fittedLineTypography(lines.length, Math.round(dimensions.height * 0.25), 30, 18);
    return [
      pptxTextShape(
        2,
        'Title Center',
        Math.round(dimensions.cx * 0.1),
        Math.round(dimensions.cy * 0.25),
        Math.round(dimensions.cx * 0.8),
        Math.round(dimensions.cy * 0.24),
        titleParagraphs(titleLines, 'ctr', titleTypography.size * 60),
        'ctr',
      ),
      pptxTextShape(
        3,
        'Subtitle Center',
        Math.round(dimensions.cx * 0.15),
        Math.round(dimensions.cy * 0.5),
        Math.round(dimensions.cx * 0.7),
        Math.round(dimensions.cy * 0.18),
        bodyParagraphs(lines, 'ctr', typography.size * 60),
        'ctr',
      ),
      pptxSolidRectShape(
        4,
        'Title Accent',
        Math.round(dimensions.cx * 0.18),
        Math.round(dimensions.cy * 0.76),
        Math.round(dimensions.cx * 0.64),
        76_200,
        accent,
      ),
    ].join('');
  }
  if (slide.layout === 'section') {
    const titleTypography = fittedLineTypography(titleLines.length, Math.round(dimensions.height * 0.25), 68, 42);
    const typography = fittedLineTypography(lines.length, Math.round(dimensions.height * 0.34), 30, 20);
    return [
      pptxSolidRectShape(2, 'Section Accent', 0, 0, Math.round(dimensions.cx * 0.28), dimensions.cy, accent),
      pptxTextShape(
        3,
        'Section Title',
        Math.round(dimensions.cx * 0.35),
        Math.round(dimensions.cy * 0.27),
        Math.round(dimensions.cx * 0.57),
        Math.round(dimensions.cy * 0.25),
        titleParagraphs(titleLines, 'l', titleTypography.size * 60),
        'ctr',
      ),
      pptxTextShape(
        4,
        'Section Content',
        Math.round(dimensions.cx * 0.35),
        Math.round(dimensions.cy * 0.53),
        Math.round(dimensions.cx * 0.57),
        Math.round(dimensions.cy * 0.25),
        bodyParagraphs(lines, 'l', typography.size * 60),
      ),
    ].join('');
  }
  if (slide.layout === 'two_column') {
    const midpoint = Math.ceil(lines.length / 2);
    const titleTypography = fittedLineTypography(titleLines.length, Math.round(dimensions.height * 0.18), 58, 36);
    const typography = fittedLineTypography(Math.ceil(lines.length / 2), dimensions.height - 365, 29, 20);
    const margin = 762_000;
    const gap = 457_200;
    const columnWidth = Math.floor((dimensions.cx - margin * 2 - gap) / 2);
    return [
      pptxSolidRectShape(2, 'Two Column Accent', 0, 0, dimensions.cx, 114_300, accent),
      pptxTextShape(
        3,
        'Two Column Title',
        margin,
        381_000,
        dimensions.cx - margin * 2,
        1_143_000,
        titleParagraphs(titleLines, 'l', titleTypography.size * 60),
      ),
      pptxTextShape(
        4,
        'Left Column',
        margin,
        1_752_600,
        columnWidth,
        dimensions.cy - 2_209_800,
        bodyParagraphs(lines.slice(0, midpoint), 'l', typography.size * 60),
      ),
      pptxTextShape(
        5,
        'Right Column',
        margin + columnWidth + gap,
        1_752_600,
        columnWidth,
        dimensions.cy - 2_209_800,
        bodyParagraphs(lines.slice(midpoint), 'l', typography.size * 60),
      ),
      pptxSolidRectShape(
        6,
        'Column Divider',
        margin + columnWidth + Math.floor(gap / 2),
        1_752_600,
        19_050,
        dimensions.cy - 2_209_800,
        accent,
      ),
    ].join('');
  }
  const titleTypography = fittedLineTypography(titleLines.length, Math.round(dimensions.height * 0.18), 58, 36);
  const typography = fittedLineTypography(lines.length, dimensions.height - 350, 32, 22);
  return [
    pptxSolidRectShape(2, 'Content Accent', 0, 0, 114_300, dimensions.cy, accent),
    pptxTextShape(
      3,
      'Content Title',
      914_400,
      548_640,
      dimensions.cx - 1_828_800,
      914_400,
      titleParagraphs(titleLines, 'l', titleTypography.size * 60),
    ),
    pptxTextShape(
      4,
      'Content Body',
      914_400,
      1_737_360,
      dimensions.cx - 1_828_800,
      dimensions.cy - 2_286_000,
      bodyParagraphs(lines, 'l', typography.size * 60),
    ),
  ].join('');
}

function pptxSlideXml(
  content: ProductionPresentationContentV1,
  index: number,
  imageRelationshipIds: ReadonlyMap<string, string>,
) {
  const background = colorWithoutHash(content.theme.background, 'FFFFFF');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${background}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${pptxSlideShapes(content, index)}${pptxPresentationElements(content, index, imageRelationshipIds)}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

function embeddedPresentationImage(src: string) {
  const match = src.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/iu);
  if (!match) throw new Error('Unsupported embedded presentation image');
  const extension = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
  const binary = globalThis.atob(match[2]);
  return {
    extension,
    bytes: Uint8Array.from(binary, (character) => character.charCodeAt(0)),
  };
}

function pptxNotesSlideXml(notes: string) {
  const paragraphs = String(notes || '')
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .map((line) => pptxTextParagraph(line, 1200, '20232D'))
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="Notes Text"/><p:cNvSpPr txBox="1"/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="914400"/><a:ext cx="5486400" cy="5486400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/>${paragraphs || pptxTextParagraph('', 1200, '20232D')}</p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`;
}

const PPTX_NOTES_MASTER = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:notesMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld name="Light Note Notes"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/><p:hf dt="1" hdr="1" ftr="1" sldNum="1"/><p:notesStyle><a:lvl1pPr marL="0" algn="l" defTabSz="914400"><a:defRPr sz="1200"/></a:lvl1pPr></p:notesStyle></p:notesMaster>`;

const PPTX_THEME = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Light Note"><a:themeElements><a:clrScheme name="Light Note"><a:dk1><a:srgbClr val="20232D"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="404552"/></a:dk2><a:lt2><a:srgbClr val="F5F6FA"/></a:lt2><a:accent1><a:srgbClr val="615CED"/></a:accent1><a:accent2><a:srgbClr val="00A884"/></a:accent2><a:accent3><a:srgbClr val="2563EB"/></a:accent3><a:accent4><a:srgbClr val="EA580C"/></a:accent4><a:accent5><a:srgbClr val="DC2626"/></a:accent5><a:accent6><a:srgbClr val="764BA2"/></a:accent6><a:hlink><a:srgbClr val="2563EB"/></a:hlink><a:folHlink><a:srgbClr val="764BA2"/></a:folHlink></a:clrScheme><a:fontScheme name="Light Note"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface="PingFang SC"/><a:cs typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface="PingFang SC"/><a:cs typeface="Arial"/></a:minorFont></a:fontScheme><a:fmtScheme name="Light Note"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"/></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"/></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;

export async function exportProductionPresentationPptx(
  content: ProductionPresentationContentV1,
  title: string,
): Promise<ProductionProjectExportFile> {
  const snapshot = assertPresentationSnapshot(content);
  assertPresentationExportFits(snapshot);
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const dimensions = presentationDimensions(snapshot);
  const slideOverrides = snapshot.slides
    .map(
      (_, index) =>
        `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
    )
    .join('');
  const notesOverrides = snapshot.slides
    .map(
      (_, index) =>
        `<Override PartName="/ppt/notesSlides/notesSlide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`,
    )
    .join('');
  addDeterministicZipFile(
    zip,
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="webp" ContentType="image/webp"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${slideOverrides}${notesOverrides}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
  );
  addDeterministicZipFile(
    zip,
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`,
  );
  const slideIds = snapshot.slides.map((_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 2}"/>`).join('');
  const notesMasterRelationshipId = snapshot.slides.length + 2;
  addDeterministicZipFile(
    zip,
    'ppt/presentation.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:notesMasterIdLst><p:notesMasterId r:id="rId${notesMasterRelationshipId}"/></p:notesMasterIdLst><p:sldIdLst>${slideIds}</p:sldIdLst><p:sldSz cx="${dimensions.cx}" cy="${dimensions.cy}" type="${snapshot.canvas.aspectRatio === '4:3' ? 'screen4x3' : 'screen16x9'}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
  );
  const slideRelations = snapshot.slides
    .map(
      (_, index) =>
        `<Relationship Id="rId${index + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`,
    )
    .join('');
  addDeterministicZipFile(
    zip,
    'ppt/_rels/presentation.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${slideRelations}<Relationship Id="rId${notesMasterRelationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="notesMasters/notesMaster1.xml"/></Relationships>`,
  );
  addDeterministicZipFile(
    zip,
    'ppt/slideMasters/slideMaster1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld name="Light Note"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`,
  );
  addDeterministicZipFile(
    zip,
    'ppt/slideMasters/_rels/slideMaster1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`,
  );
  addDeterministicZipFile(
    zip,
    'ppt/slideLayouts/slideLayout1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`,
  );
  addDeterministicZipFile(
    zip,
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`,
  );
  addDeterministicZipFile(zip, 'ppt/theme/theme1.xml', PPTX_THEME);
  addDeterministicZipFile(zip, 'ppt/notesMasters/notesMaster1.xml', PPTX_NOTES_MASTER);
  addDeterministicZipFile(
    zip,
    'ppt/notesMasters/_rels/notesMaster1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`,
  );
  snapshot.slides.forEach((slide, index) => {
    const imageRelationshipIds = new Map<string, string>();
    const imageRelationships = (slide.elements || [])
      .filter((element) => element.type === 'image')
      .map((element, imageIndex) => {
        const relationshipId = `rId${imageIndex + 3}`;
        const image = embeddedPresentationImage(element.src);
        const fileName = `slide${index + 1}-image${imageIndex + 1}.${image.extension}`;
        imageRelationshipIds.set(element.id, relationshipId);
        addDeterministicZipFile(zip, `ppt/media/${fileName}`, image.bytes);
        return `<Relationship Id="${relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${fileName}"/>`;
      })
      .join('');
    addDeterministicZipFile(
      zip,
      `ppt/slides/slide${index + 1}.xml`,
      pptxSlideXml(snapshot, index, imageRelationshipIds),
    );
    addDeterministicZipFile(
      zip,
      `ppt/slides/_rels/slide${index + 1}.xml.rels`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide${index + 1}.xml"/>${imageRelationships}</Relationships>`,
    );
    addDeterministicZipFile(zip, `ppt/notesSlides/notesSlide${index + 1}.xml`, pptxNotesSlideXml(slide.notes));
    addDeterministicZipFile(
      zip,
      `ppt/notesSlides/_rels/notesSlide${index + 1}.xml.rels`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="../slides/slide${index + 1}.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="../notesMasters/notesMaster1.xml"/></Relationships>`,
    );
  });
  addDeterministicZipFile(zip, 'docProps/core.xml', ooxmlCoreProperties(title));
  addDeterministicZipFile(
    zip,
    'docProps/app.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Light Note</Application><PresentationFormat>${snapshot.canvas.aspectRatio}</PresentationFormat><Slides>${snapshot.slides.length}</Slides><AppVersion>1.0</AppVersion></Properties>`,
  );
  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: PPTX_MIME,
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  return { fileName: productionProjectFileName(title, 'untitled-presentation', 'pptx'), mimeType: PPTX_MIME, blob };
}

export async function exportProductionPresentationPngZip(
  content: ProductionPresentationContentV1,
  title: string,
  renderer: ProductionSlidePngRenderer = defaultSlidePngRenderer,
): Promise<ProductionProjectExportFile> {
  const snapshot = assertPresentationSnapshot(content);
  assertPresentationExportFits(snapshot);
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const dimensions = presentationDimensions(snapshot);
  if (!snapshot.slides.length) {
    addDeterministicZipFile(zip, 'README.txt', 'This presentation has no slides.');
  }
  for (let index = 0; index < snapshot.slides.length; index += 1) {
    const blob = await renderer({
      index,
      width: dimensions.width,
      height: dimensions.height,
      svg: buildProductionPresentationSlideSvg(snapshot, index),
    });
    addDeterministicZipFile(zip, `slide-${String(index + 1).padStart(3, '0')}.png`, blob);
  }
  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/zip',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  return {
    fileName: productionProjectFileName(title, 'untitled-presentation', 'zip'),
    mimeType: 'application/zip',
    blob,
  };
}

export async function exportProductionPresentationPdf(
  content: ProductionPresentationContentV1,
  title: string,
  renderer: ProductionSlidePngRenderer = defaultSlidePngRenderer,
): Promise<ProductionProjectExportFile> {
  const snapshot = assertPresentationSnapshot(content);
  assertPresentationExportFits(snapshot);
  const { default: JsPDF } = await import('jspdf');
  const landscape = snapshot.canvas.aspectRatio === '16:9';
  const format = landscape ? [960, 540] : [720, 540];
  const pdf = new JsPDF({ orientation: 'landscape', unit: 'pt', format });
  const dimensions = presentationDimensions(snapshot);
  if (snapshot.slides.length) {
    for (let index = 0; index < snapshot.slides.length; index += 1) {
      if (index) pdf.addPage(format, 'landscape');
      const png = await renderer({
        index,
        width: dimensions.width,
        height: dimensions.height,
        svg: buildProductionPresentationSlideSvg(snapshot, index),
      });
      pdf.addImage(new Uint8Array(await png.arrayBuffer()), 'PNG', 0, 0, format[0], format[1]);
    }
  }
  return {
    fileName: productionProjectFileName(title, 'untitled-presentation', 'pdf'),
    mimeType: 'application/pdf',
    blob: pdf.output('blob'),
  };
}
