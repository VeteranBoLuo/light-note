// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { compileStyle, parse } from '@vue/compiler-sfc';
import { describe, expect, it } from 'vitest';

const sourceRoot = resolve(process.cwd(), 'src');
const commonStyles = readFileSync(resolve(sourceRoot, 'assets/css/common.less'), 'utf8');
const baselineStyles = readFileSync(resolve(sourceRoot, 'assets/css/mobile-rendering-baseline.less'), 'utf8');
const androidEngineStyles = readFileSync(resolve(sourceRoot, 'assets/css/android-webview-compat.less'), 'utf8');
const styleIndex = readFileSync(resolve(sourceRoot, 'assets/css/index.less'), 'utf8');
const viteConfig = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8');
const authModalStyles = readFileSync(resolve(sourceRoot, 'view/login/UserAuthModal.vue'), 'utf8');
const lotteryDrawSource = readFileSync(resolve(sourceRoot, 'components/growth/LotteryDraw.vue'), 'utf8');

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function stripComments(source: string) {
  return source
    .replace(/<!--[\s\S]*?-->/gu, '')
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/(^|\s)\/\/.*$/gmu, '$1');
}

describe('移动浏览器与 App 渲染一致性门禁', () => {
  it('Android 引擎文件不再承载第二套可见样式', () => {
    const executableCss = androidEngineStyles.replace(/\/\*[\s\S]*?\*\//gu, '').trim();
    expect(executableCss).toBe('');
  });

  it('业务代码不能直接声明 Android WebView 视觉选择器', () => {
    const violations = walk(sourceRoot)
      .filter((path) => ['.vue', '.less', '.css', '.ts'].includes(extname(path)))
      .filter((path) => !path.endsWith('.test.ts'))
      .filter((path) => !path.endsWith('config/renderingProfile.ts'))
      .filter((path) => !path.endsWith('assets/css/mobile-rendering-baseline.less'))
      .filter((path) => !path.endsWith('assets/css/android-webview-compat.less'))
      .filter((path) => readFileSync(path, 'utf8').includes('light-note-android-webview'))
      .map((path) => relative(sourceRoot, path));

    expect(violations).toEqual([]);
  });

  it('scoped 样式不能在 global 结束后继续拼接业务后代', () => {
    const unsafeGlobalAncestor = /:global\([^)]*\)\s+[^\s,{]/u;
    const violations = walk(sourceRoot)
      .filter((path) => extname(path) === '.vue')
      .filter((path) => !path.endsWith('.test.ts'))
      .filter((path) => unsafeGlobalAncestor.test(stripComments(readFileSync(path, 'utf8'))))
      .map((path) => relative(sourceRoot, path));

    expect(violations).toEqual([]);

    const compiled = compileStyle({
      source: 'html.light-note-mobile-rendering .component-root { border: 0; }',
      filename: 'ScopedMobileProbe.vue',
      id: 'data-v-mobile-probe',
      scoped: true,
    });
    expect(compiled.errors).toEqual([]);
    expect(compiled.code).toContain('html.light-note-mobile-rendering .component-root[data-v-mobile-probe]');
    expect(compiled.code).not.toMatch(/html\.light-note-mobile-rendering\s*\{/u);
  });

  it('抽奖页禁用动画选择器编译后仍只作用于抽奖组件', () => {
    const { descriptor } = parse(lotteryDrawSource, { filename: 'LotteryDraw.vue' });
    const style = descriptor.styles.find((item) => item.scoped);

    expect(style).toBeDefined();

    const compiled = compileStyle({
      source: style!.content,
      filename: 'LotteryDraw.vue',
      id: 'data-v-lottery-gate',
      scoped: true,
      preprocessLang: style!.lang,
    });

    expect(compiled.errors).toEqual([]);
    for (const selector of [
      '.disable-animations .lt .lt-prize',
      '.disable-animations .lt .lt-prize-core',
      '.disable-animations .lt .lt-progress > span',
      '.disable-animations .lt .lt-odds-toggle__icon',
    ]) {
      expect(compiled.code).toContain(selector);
    }
    expect(compiled.code).not.toMatch(/\.disable-animations\s*\{[^}]*animation:\s*none/iu);
  });

  it('全局 UI 字体栈唯一且不再声明平台独占中文字体', () => {
    expect(commonStyles).toMatch(/--app-font-family:[\s\S]*?system-ui[\s\S]*?'Noto Sans SC'/u);
    expect(commonStyles).toMatch(/font-family:\s*var\(--app-font-family\)/u);

    const platformFontDeclarations = walk(sourceRoot)
      .filter((path) => ['.vue', '.less', '.css'].includes(extname(path)))
      .flatMap((path) =>
        readFileSync(path, 'utf8')
          .split('\n')
          .map((line, index) => ({ path, line, index: index + 1 })),
      )
      .filter(({ line }) => /font-family\s*:[^;]*(?:微软雅黑|Microsoft YaHei Light)/iu.test(line))
      .map(({ path, index }) => `${relative(sourceRoot, path)}:${index}`);

    expect(platformFontDeclarations).toEqual([]);
  });

  it('共享移动基线先于空的 Android 引擎层加载', () => {
    expect(styleIndex.indexOf("@import 'mobile-rendering-baseline.less'")).toBeGreaterThan(-1);
    expect(styleIndex.indexOf("@import 'mobile-rendering-baseline.less'")).toBeLessThan(
      styleIndex.indexOf("@import 'android-webview-compat.less'"),
    );
    expect(baselineStyles).toContain('html.light-note-mobile-rendering');
  });

  it('构建期颜色与字重回退变量全部由共享移动基线提供', () => {
    const colorCategories = [
      'background',
      'card-background',
      'panel-background',
      'menu-background',
      'input-background',
      'tag-background',
      'border',
      'text',
      'foreground',
      'muted',
      'primary',
      'todo',
      'bookmark',
      'note',
      'file',
      'tag',
      'warning',
      'danger',
      'success',
      'transparent',
      'white',
      'black',
    ];
    const softCategories = [
      'primary',
      'todo',
      'bookmark',
      'note',
      'file',
      'tag',
      'warning',
      'danger',
      'success',
      'border',
      'muted',
      'text',
    ];

    for (const category of colorCategories) {
      expect(baselineStyles, category).toContain(`--ln-android-color-mix-${category}:`);
    }
    for (const category of softCategories) {
      expect(baselineStyles, `${category}-soft-background`).toContain(
        `--ln-android-color-mix-${category}-soft-background:`,
      );
    }
    for (const kind of ['regular', 'medium', 'bold']) {
      expect(baselineStyles, kind).toContain(`--ln-android-font-weight-${kind}:`);
    }
  });

  it('浅色认证卡片使用不透明主题表面，移动端不会透出深色遮罩', () => {
    expect(authModalStyles).toMatch(/--auth-card-bg:\s*var\(--surface-raised-background\)/u);
    expect(authModalStyles).not.toMatch(/--auth-card-bg:\s*color-mix\(/u);
    expect(authModalStyles).toMatch(
      /--auth-card-border:\s*var\(--surface-border-color,\s*var\(--card-border-color\)\)/u,
    );
  });

  it('必要布局不再依赖旧 WebView 缺失的 :has()', () => {
    const violations = walk(sourceRoot)
      .filter((path) => ['.vue', '.less', '.css'].includes(extname(path)))
      .filter((path) => !path.endsWith('.test.ts'))
      .filter((path) => stripComments(readFileSync(path, 'utf8')).includes(':has('))
      .map((path) => relative(sourceRoot, path));

    expect(violations).toEqual([]);
  });

  it('CSS 数学函数内的减法必须显式使用 calc，避免构建后把像素差值改写成百分比', () => {
    const unsafeFunctionSubtraction =
      /(?:\b(?:min|max|clamp)\(|,)\s*(?:100%|100v[wh])\s*-\s*\d+(?:\.\d+)?(?:px|rem)\b/iu;
    const violations = walk(sourceRoot)
      .filter((path) => ['.vue', '.less', '.css'].includes(extname(path)))
      .filter((path) => unsafeFunctionSubtraction.test(stripComments(readFileSync(path, 'utf8'))))
      .map((path) => relative(sourceRoot, path));

    expect(violations).toEqual([]);
  });

  it('保留的容器查询有共享移动等价回退，新增容器查询必须先补门禁', () => {
    const containerQueryFiles = walk(sourceRoot)
      .filter((path) => ['.vue', '.less', '.css'].includes(extname(path)))
      .filter((path) => stripComments(readFileSync(path, 'utf8')).includes('@container'))
      .map((path) => relative(sourceRoot, path))
      .sort();
    const containerTypeFiles = walk(sourceRoot)
      .filter((path) => ['.vue', '.less', '.css'].includes(extname(path)))
      .filter((path) => /\bcontainer-(?:name|type)\s*:/u.test(stripComments(readFileSync(path, 'utf8'))))
      .map((path) => relative(sourceRoot, path))
      .sort();

    expect(containerQueryFiles).toEqual(['components/cloudSpace/fieldList.vue', 'view/settings/Settings.vue']);
    expect(containerTypeFiles).toEqual([
      'components/cloudSpace/fieldList.vue',
      'components/home/CardPanel.vue',
      'view/noteLibrary/NoteLibrary.vue',
      'view/settings/Settings.vue',
    ]);
    expect(baselineStyles).toContain('.field-list .mobile-batch-actions');
    expect(baselineStyles).toContain('--bookmark-card-min-width: 260px !important');
    expect(baselineStyles).toContain('--file-card-min-width: 260px !important');
    expect(baselineStyles).toContain('--note-card-min-width: 320px !important');
    expect(readFileSync(resolve(sourceRoot, 'view/settings/Settings.vue'), 'utf8')).toContain(
      '.settings-body.is-mobile-sub',
    );
  });

  it('动态视口单位同时覆盖 CSS 声明和组件内联高度', () => {
    expect(viteConfig).toContain("import dynamicViewportFallback from './src/vite/dynamicViewportFallback'");
    expect(viteConfig).toContain('dynamicViewportFallback()');

    for (const path of [
      'components/base/BasicComponents/BDrawer.vue',
      'components/base/BasicComponents/BModal/BModal.vue',
    ]) {
      expect(readFileSync(resolve(sourceRoot, path), 'utf8'), path).toContain('resolveViewportUnitValue');
    }
  });

  it('移动端不预留旧 WebView 缺失的滚动条槽，关键方形装饰有显式尺寸回退', () => {
    const avatarStyles = readFileSync(resolve(sourceRoot, 'components/growth/AvatarFramePreview.vue'), 'utf8');

    expect(baselineStyles).toMatch(/scrollbar-gutter:\s*auto\s*!important/u);
    expect(baselineStyles).toMatch(/\.growth-page \.cal-cell\s*\{[\s\S]*?min-height:\s*42px/u);
    expect(avatarStyles).toMatch(
      /\.avatar-frame__portrait\s*\{[\s\S]*?width:\s*var\(--frame-display-avatar-size\);[\s\S]*?height:\s*var\(--frame-display-avatar-size\);/u,
    );
    expect(avatarStyles).toContain("'avatar-frame--motion-paused': isMotionPaused");
    expect(avatarStyles).toContain('const isMotionVisible = ref(!props.pauseWhenOffscreen)');
    expect(avatarStyles).toContain("rootMargin: '24px 0px'");
    expect(avatarStyles).toMatch(
      /\.avatar-frame--motion-paused \.avatar-frame__art[\s\S]*?animation:\s*none\s*!important/u,
    );
  });
});
