import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { imageSize } from 'image-size';

const execFileAsync = promisify(execFile);

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

export const AI_OCR_MAX_PAGES = boundedInteger(process.env.AI_OCR_MAX_PAGES, 20, 1, 50);
export const AI_OCR_MAX_PIXELS = boundedInteger(process.env.AI_OCR_MAX_PIXELS, 24_000_000, 1_000_000, 60_000_000);
export const AI_OCR_PDF_DPI = boundedInteger(process.env.AI_OCR_PDF_DPI, 180, 120, 240);

const PDFTOPPM_BIN = String(process.env.AI_OCR_PDFTOPPM_BIN || 'pdftoppm').trim();
const TESSERACT_BIN = String(process.env.AI_OCR_TESSERACT_BIN || 'tesseract').trim();
const OCR_LANGUAGES = String(process.env.AI_OCR_LANGUAGES || 'chi_sim+eng').trim();
const MAGICK_BIN = String(process.env.AI_OCR_MAGICK_BIN || 'convert').trim();
const OCR_PREPROCESS = String(process.env.AI_OCR_PREPROCESS ?? '1').trim() !== '0';
const RENDER_TIMEOUT_MS = boundedInteger(process.env.AI_OCR_RENDER_TIMEOUT_MS, 60_000, 10_000, 180_000);
const PAGE_TIMEOUT_MS = boundedInteger(process.env.AI_OCR_PAGE_TIMEOUT_MS, 25_000, 5_000, 90_000);
const COMMAND_MAX_BUFFER = 8 * 1024 * 1024;

const TYPE_BY_EXTENSION = Object.freeze({
  '.png': 'png',
  '.jpg': 'jpg',
  '.jpeg': 'jpg',
  '.webp': 'webp',
});

function ocrError(code, message, cause) {
  const error = new Error(`${code}: ${message}`, cause ? { cause } : undefined);
  error.code = code;
  return error;
}

function cleanOcrText(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function mapCommandError(error, command) {
  if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') {
    throw ocrError('DOCUMENT_PARSE_TIMEOUT', 'OCR 识别超时，请缩小文件或减少页数后重试', error);
  }
  if (error?.code === 'ENOENT') {
    throw ocrError('OCR_ENGINE_UNAVAILABLE', '本地 OCR 组件尚未安装或不可用', error);
  }
  if (error?.killed || error?.code === 'ETIMEDOUT') {
    throw ocrError('OCR_TIMEOUT', 'OCR 单页识别超时，请换用更清晰或更小的文件', error);
  }
  const stderr = String(error?.stderr || '');
  if (/failed loading language|error opening data file|couldn't load any languages/i.test(stderr)) {
    throw ocrError('OCR_LANGUAGE_UNAVAILABLE', '本地 OCR 缺少中文或英文识别模型', error);
  }
  throw ocrError(
    command === PDFTOPPM_BIN ? 'OCR_PDF_RENDER_FAILED' : 'OCR_RECOGNITION_FAILED',
    command === PDFTOPPM_BIN ? 'PDF 页面无法转换为 OCR 图片' : '图片文字识别失败',
    error,
  );
}

async function runCommand(command, args, { timeout, signal } = {}) {
  try {
    return await execFileAsync(command, args, {
      encoding: 'utf8',
      timeout,
      signal,
      maxBuffer: COMMAND_MAX_BUFFER,
      windowsHide: true,
      killSignal: 'SIGKILL',
    });
  } catch (error) {
    mapCommandError(error, command);
  }
}

export function inspectOcrImage(buffer, extension) {
  const expectedType = TYPE_BY_EXTENSION[String(extension || '').toLowerCase()];
  if (!expectedType) throw ocrError('UNSUPPORTED_FILE_TYPE', 'OCR 图片格式不受支持');
  let dimensions;
  try {
    dimensions = imageSize(buffer);
  } catch (error) {
    throw ocrError('FILE_CONTENT_INVALID', '图片内容无法识别或已经损坏', error);
  }
  const width = Number(dimensions.width || 0);
  const height = Number(dimensions.height || 0);
  if (dimensions.type !== expectedType || !width || !height) {
    throw ocrError('FILE_CONTENT_INVALID', '图片扩展名与实际内容不一致');
  }
  if (width * height > AI_OCR_MAX_PIXELS) {
    throw ocrError('OCR_IMAGE_TOO_LARGE', `图片像素不能超过 ${AI_OCR_MAX_PIXELS.toLocaleString('en-US')}`);
  }
  return { width, height, type: dimensions.type };
}

async function recognizeImagePath(imagePath, { signal, runner = runCommand, psm = '3' } = {}) {
  const { stdout } = await runner(
    TESSERACT_BIN,
    [imagePath, 'stdout', '-l', OCR_LANGUAGES, '--oem', '1', '--psm', String(psm)],
    { timeout: PAGE_TIMEOUT_MS, signal },
  );
  return cleanOcrText(stdout);
}

// Tesseract OSD 检测方向:仅在明确 90/180/270 且置信度足够时返回旋转角度(避免把正图转歪);任何异常都返回 0 不旋转。
async function detectOcrRotation(imagePath, { signal, runner = runCommand } = {}) {
  try {
    const { stdout = '', stderr = '' } = await runner(TESSERACT_BIN, [imagePath, 'stdout', '--psm', '0'], {
      timeout: PAGE_TIMEOUT_MS,
      signal,
    });
    const text = `${stdout}\n${stderr}`;
    const rotate = Number(/Rotate:\s*(\d+)/i.exec(text)?.[1] || 0);
    const confidence = Number(/Orientation confidence:\s*([\d.]+)/i.exec(text)?.[1] || 0);
    if ([90, 180, 270].includes(rotate) && confidence >= 1) return rotate;
    return 0;
  } catch {
    return 0;
  }
}

// ImageMagick 预处理:灰度 + 深色主题自动反色 + 放大小图 + 对比归一化,大幅改善深色/小字截图的 OCR 质量。
// 与 tesseract/pdftoppm 一样走系统 CLI(execFile),契合「本地打包 rsync」的部署模式(不引入平台相关的 native node 库)。
async function preprocessOcrImage(inputPath, outputPath, { signal, runner = runCommand } = {}) {
  let isDark = false;
  try {
    const { stdout } = await runner(MAGICK_BIN, [inputPath, '-colorspace', 'Gray', '-format', '%[fx:mean]', 'info:'], {
      timeout: PAGE_TIMEOUT_MS,
      signal,
    });
    const mean = parseFloat(stdout);
    isDark = Number.isFinite(mean) && mean < 0.5; // 灰度均值偏低 = 深色底(如代码编辑器暗色主题)
  } catch {
    // 测不到亮度就按非深色处理,不影响后续
  }
  const args = [inputPath, '-auto-orient', '-colorspace', 'Gray'];
  if (isDark) args.push('-negate'); // 深色底反相成「浅底深字」,Tesseract 才认
  args.push('-resize', '1800x1800<', '-normalize', outputPath); // 「<」只放大小图、不缩大图(免超像素上限)
  await runner(MAGICK_BIN, args, { timeout: RENDER_TIMEOUT_MS, signal });
}

function pageNumberFromFileName(fileName) {
  return Number(/-(\d+)\.png$/i.exec(fileName)?.[1] || 0);
}

export async function recognizePdfWithLocalOcr(
  buffer,
  { pageCount, signal, runner = runCommand, tempRoot = os.tmpdir() } = {},
) {
  const totalPages = Number(pageCount || 0);
  if (!Number.isInteger(totalPages) || totalPages <= 0) {
    throw ocrError('FILE_CONTENT_INVALID', '无法确认 PDF 页数');
  }
  if (totalPages > AI_OCR_MAX_PAGES) {
    throw ocrError('OCR_PAGE_LIMIT', `图片型 PDF 最多支持 ${AI_OCR_MAX_PAGES} 页 OCR`);
  }

  const tempDir = await mkdtemp(path.join(tempRoot, 'light-note-ocr-'));
  try {
    const inputPath = path.join(tempDir, 'input.pdf');
    const pagePrefix = path.join(tempDir, 'page');
    await writeFile(inputPath, buffer, { mode: 0o600 });
    await runner(
      PDFTOPPM_BIN,
      ['-png', '-r', String(AI_OCR_PDF_DPI), '-f', '1', '-l', String(totalPages), inputPath, pagePrefix],
      { timeout: RENDER_TIMEOUT_MS, signal },
    );
    const pageFiles = (await readdir(tempDir))
      .filter((fileName) => /^page-\d+\.png$/i.test(fileName))
      .sort((left, right) => pageNumberFromFileName(left) - pageNumberFromFileName(right));
    if (!pageFiles.length) throw ocrError('OCR_PDF_RENDER_FAILED', 'PDF 没有生成可识别的页面');

    const pages = [];
    for (const fileName of pageFiles) {
      const pagePath = path.join(tempDir, fileName);
      inspectOcrImage(await readFile(pagePath), '.png');
      const content = await recognizeImagePath(pagePath, { signal, runner });
      if (content) pages.push({ pageNumber: pageNumberFromFileName(fileName), content });
    }
    if (!pages.length) throw ocrError('EMPTY_DOCUMENT', 'OCR 未能从 PDF 图片中识别出文字');
    return pages;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function recognizeImageWithLocalOcr(
  buffer,
  { extension, signal, runner = runCommand, tempRoot = os.tmpdir() } = {},
) {
  inspectOcrImage(buffer, extension);
  const tempDir = await mkdtemp(path.join(tempRoot, 'light-note-ocr-'));
  try {
    const inputPath = path.join(tempDir, `input${String(extension || '').toLowerCase()}`);
    await writeFile(inputPath, buffer, { mode: 0o600 });

    // 预处理(灰度/深色反色/放大/归一)+ 方向校正,提升深色主题、旋转、小字截图的识别率;
    // 预处理不可用(未装 ImageMagick)或失败时静默回退原图,保证 OCR 不因预处理挂掉。
    let ocrPath = inputPath;
    if (OCR_PREPROCESS) {
      try {
        const processedPath = path.join(tempDir, 'processed.png');
        await preprocessOcrImage(inputPath, processedPath, { signal, runner });
        const rotate = await detectOcrRotation(processedPath, { signal, runner });
        if (rotate) {
          const rotatedPath = path.join(tempDir, 'rotated.png');
          await runner(MAGICK_BIN, [processedPath, '-rotate', String(rotate), rotatedPath], {
            timeout: RENDER_TIMEOUT_MS,
            signal,
          });
          ocrPath = rotatedPath;
        } else {
          ocrPath = processedPath;
        }
      } catch {
        ocrPath = inputPath;
      }
    }

    // 截图/代码类用 --psm 6(整块统一文本)通常优于文档式的 --psm 3
    const content = await recognizeImagePath(ocrPath, { signal, runner, psm: '6' });
    if (!content) throw ocrError('EMPTY_DOCUMENT', 'OCR 未能从图片中识别出文字');
    return { content };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function inspectLocalOcrRuntime({ runner = runCommand } = {}) {
  try {
    const [{ stdout: languageStdout = '', stderr: languageStderr = '' }] = await Promise.all([
      runner(TESSERACT_BIN, ['--list-langs'], { timeout: 10_000 }),
      runner(PDFTOPPM_BIN, ['-v'], { timeout: 10_000 }),
    ]);
    const languages = `${languageStdout}\n${languageStderr}`;
    const requiredLanguages = OCR_LANGUAGES.split('+').filter(Boolean);
    const missingLanguages = requiredLanguages.filter(
      (language) => !new RegExp(`(^|\\s)${language}(?=\\s|$)`, 'm').test(languages),
    );
    return {
      ready: missingLanguages.length === 0,
      languages: requiredLanguages,
      missingLanguages,
    };
  } catch (error) {
    return {
      ready: false,
      languages: OCR_LANGUAGES.split('+').filter(Boolean),
      missingLanguages: [],
      errorCode: error?.code || 'OCR_ENGINE_UNAVAILABLE',
    };
  }
}

export const localOcrProvider = Object.freeze({
  recognizePdf: recognizePdfWithLocalOcr,
  recognizeImage: recognizeImageWithLocalOcr,
});
