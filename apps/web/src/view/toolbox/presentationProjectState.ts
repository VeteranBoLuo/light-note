import {
  createEmptyProductionProjectContent,
  normalizeProductionProjectContent,
  type ProductionPresentationContentV1,
  type ProductionPresentationElementV1,
  type ProductionPresentationImageElementV1,
  type ProductionPresentationShapeElementV1,
  type ProductionPresentationSlideV1,
  type ProductionPresentationTextElementV1,
} from '@lightnote/shared/production-project-protocol';

function createPresentationLocalId(prefix: 'slide' | 'element') {
  const suffix =
    globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

export function createPresentationSlide(index = 0): ProductionPresentationSlideV1 {
  return {
    id: createPresentationLocalId('slide'),
    title: index === 0 ? 'Untitled presentation' : `Slide ${index + 1}`,
    body: { format: 'markdown', value: '' },
    notes: '',
    layout: index === 0 ? 'title' : 'content',
    elements: [],
    extensions: {},
  };
}

export function createPresentationTextElement(text = '点击文字即可直接编辑'): ProductionPresentationTextElementV1 {
  return {
    id: createPresentationLocalId('element'),
    type: 'text',
    x: 16,
    y: 20,
    width: 42,
    height: 18,
    rotation: 0,
    text,
    fontSize: 28,
    fontWeight: 600,
    color: '#20232d',
    align: 'left',
    verticalAlign: 'middle',
    fill: null,
  };
}

export function createPresentationShapeElement(
  shape: ProductionPresentationShapeElementV1['shape'] = 'rectangle',
): ProductionPresentationShapeElementV1 {
  const isConnector = shape === 'line' || shape === 'arrow';
  return {
    id: createPresentationLocalId('element'),
    type: 'shape',
    x: 22,
    y: 28,
    width: 32,
    height: isConnector ? 8 : 24,
    rotation: 0,
    shape,
    fill: isConnector ? null : '#e9e7ff',
    stroke: '#615ced',
    strokeWidth: 2,
    text: isConnector ? '' : '形状文本',
    color: '#20232d',
    fontSize: 22,
  };
}

export function createPresentationImageElement(src: string, alt = ''): ProductionPresentationImageElementV1 {
  return {
    id: createPresentationLocalId('element'),
    type: 'image',
    x: 18,
    y: 18,
    width: 42,
    height: 42,
    rotation: 0,
    src,
    alt,
    fit: 'contain',
  };
}

export function clonePresentationElement(element: ProductionPresentationElementV1): ProductionPresentationElementV1 {
  const cloned = JSON.parse(JSON.stringify(element)) as ProductionPresentationElementV1;
  cloned.id = createPresentationLocalId('element');
  cloned.x = Math.max(0, Math.min(100 - cloned.width, cloned.x + 3));
  cloned.y = Math.max(0, Math.min(100 - cloned.height, cloned.y + 3));
  return cloned;
}

export function createPresentationContent(): ProductionPresentationContentV1 {
  const empty = createEmptyProductionProjectContent('presentation') as ProductionPresentationContentV1;
  return clonePresentationContent({ ...empty, slides: [createPresentationSlide()] });
}

export function clonePresentationContent(input: unknown): ProductionPresentationContentV1 {
  const normalized = normalizeProductionProjectContent(input, 'presentation') as ProductionPresentationContentV1;
  return JSON.parse(JSON.stringify(normalized)) as ProductionPresentationContentV1;
}

export function presentationContentSnapshot(input: ProductionPresentationContentV1) {
  return JSON.stringify(normalizeProductionProjectContent(input, 'presentation'));
}

export function presentationContentForSave(input: ProductionPresentationContentV1): ProductionPresentationContentV1 {
  return normalizeProductionProjectContent(input, 'presentation') as ProductionPresentationContentV1;
}

export function movePresentationSlide(content: ProductionPresentationContentV1, fromIndex: number, toIndex: number) {
  const slides = content.slides;
  if (fromIndex < 0 || fromIndex >= slides.length || toIndex < 0 || toIndex >= slides.length) return false;
  const [slide] = slides.splice(fromIndex, 1);
  if (!slide) return false;
  slides.splice(toIndex, 0, slide);
  return true;
}
