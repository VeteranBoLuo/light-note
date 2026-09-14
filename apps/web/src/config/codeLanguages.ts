/** 编辑器与预览共用语言标识；别名只用于读取，不改写历史正文。 */
export const CODE_LANGUAGES = [
  { value: 'plaintext', text: 'Plain Text' },
  { value: 'javascript', text: 'JavaScript' },
  { value: 'typescript', text: 'TypeScript' },
  { value: 'html', text: 'HTML' },
  { value: 'css', text: 'CSS' },
  { value: 'json', text: 'JSON' },
  { value: 'bash', text: 'Bash' },
  { value: 'python', text: 'Python' },
  { value: 'java', text: 'Java' },
  { value: 'go', text: 'Go' },
  { value: 'rust', text: 'Rust' },
  { value: 'cpp', text: 'C++' },
  { value: 'sql', text: 'SQL' },
];
const aliases: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  xml: 'html',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  c: 'cpp',
  'c++': 'cpp',
  rs: 'rust',
  golang: 'go',
  text: 'plaintext',
  txt: 'plaintext',
  md: 'markdown',
};
export function normalizeCodeLanguage(value: string = ''): string {
  const name = value.trim().toLowerCase().split(/\s+/u)[0] || 'plaintext';
  return Object.prototype.hasOwnProperty.call(aliases, name) ? aliases[name] : name;
}
export function codeLanguageLabel(value: string): string {
  return CODE_LANGUAGES.find((item) => item.value === value)?.text || value;
}
export function supportsCodeHighlight(value: string): boolean {
  return value !== 'plaintext' && (value === 'markdown' || CODE_LANGUAGES.some((item) => item.value === value));
}

// 按源码字符数限定每块和每篇的同步解析工作量。
export const MAX_CODE_HIGHLIGHT_LENGTH = 12_000;
export const MAX_NOTE_HIGHLIGHT_LENGTH = 40_000;
