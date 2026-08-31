import {
  PRODUCTION_WORKBOOK_MAX_COLUMNS,
  PRODUCTION_WORKBOOK_MAX_ROWS,
  ProductionWorkbookCellV1,
  ProductionWorkbookCellStyleV1,
  ProductionWorkbookContentV1,
  ProductionWorkbookSheetV1,
} from '@lightnote/shared/production-project-protocol';

const BOOLEAN_PATTERN = /^(true|false)$/iu;
const NUMBER_PATTERN = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/iu;
const A1_PATTERN = /^([A-Z]{1,3})([1-9][0-9]{0,6})$/u;

export const WORKBOOK_FORMULA_ERRORS = Object.freeze({
  cycle: '#CYCLE!',
  divideByZero: '#DIV/0!',
  invalid: '#ERROR!',
  name: '#NAME?',
  reference: '#REF!',
  value: '#VALUE!',
} as const);

export type WorkbookFormulaError = (typeof WORKBOOK_FORMULA_ERRORS)[keyof typeof WORKBOOK_FORMULA_ERRORS];
type WorkbookFormulaAnalysis = Readonly<{ supported: boolean; dependencies: ReadonlySet<string> }>;

type FormulaToken = Readonly<{
  type: 'number' | 'identifier' | 'plus' | 'minus' | 'star' | 'slash' | 'left' | 'right' | 'comma' | 'colon' | 'eof';
  value: string;
}>;

type FormulaScalar = Readonly<{ kind: 'scalar'; value: string | number | boolean | null }>;
type FormulaRange = Readonly<{ kind: 'range'; values: readonly FormulaScalar[] }>;
type FormulaValue = FormulaScalar | FormulaRange;

class WorkbookFormulaEvaluationError extends Error {
  readonly code: WorkbookFormulaError;

  constructor(code: WorkbookFormulaError) {
    super(code);
    this.code = code;
  }
}

function formulaError(code: WorkbookFormulaError): never {
  throw new WorkbookFormulaEvaluationError(code);
}

function tokenizeWorkbookFormula(source: string): FormulaToken[] {
  const tokens: FormulaToken[] = [];
  let index = 0;
  const formula = String(source || '').replace(/^=/u, '');
  while (index < formula.length) {
    const character = formula[index]!;
    if (/\s/u.test(character)) {
      index += 1;
      continue;
    }
    const tokenType = (
      {
        '+': 'plus',
        '-': 'minus',
        '*': 'star',
        '/': 'slash',
        '(': 'left',
        ')': 'right',
        ',': 'comma',
        ':': 'colon',
      } as const
    )[character];
    if (tokenType) {
      tokens.push({ type: tokenType, value: character });
      index += 1;
      continue;
    }
    if (/\d|\./u.test(character)) {
      const match = /^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/iu.exec(formula.slice(index));
      if (!match) formulaError(WORKBOOK_FORMULA_ERRORS.invalid);
      tokens.push({ type: 'number', value: match[0] });
      index += match[0].length;
      continue;
    }
    if (/[A-Z_]/iu.test(character)) {
      const match = /^[A-Z_][A-Z0-9_]*/iu.exec(formula.slice(index));
      if (!match) formulaError(WORKBOOK_FORMULA_ERRORS.invalid);
      tokens.push({ type: 'identifier', value: match[0].toUpperCase() });
      index += match[0].length;
      continue;
    }
    formulaError(WORKBOOK_FORMULA_ERRORS.invalid);
  }
  tokens.push({ type: 'eof', value: '' });
  return tokens;
}

function scalar(value: string | number | boolean | null): FormulaScalar {
  return { kind: 'scalar', value };
}

function scalarNumber(value: FormulaValue): number {
  if (value.kind === 'range') formulaError(WORKBOOK_FORMULA_ERRORS.value);
  if (value.value === null || value.value === '') return 0;
  if (typeof value.value === 'number') {
    if (!Number.isFinite(value.value)) formulaError(WORKBOOK_FORMULA_ERRORS.value);
    return value.value;
  }
  if (typeof value.value === 'boolean') return value.value ? 1 : 0;
  if (Object.values(WORKBOOK_FORMULA_ERRORS).includes(value.value as WorkbookFormulaError)) {
    formulaError(value.value as WorkbookFormulaError);
  }
  const numeric = Number(String(value.value).trim());
  if (!Number.isFinite(numeric)) formulaError(WORKBOOK_FORMULA_ERRORS.value);
  return numeric;
}

function aggregateNumbers(values: readonly FormulaValue[]) {
  const numbers: number[] = [];
  for (const value of values) {
    const scalars = value.kind === 'range' ? value.values : [value];
    for (const item of scalars) {
      if (
        typeof item.value === 'string' &&
        Object.values(WORKBOOK_FORMULA_ERRORS).includes(item.value as WorkbookFormulaError)
      ) {
        formulaError(item.value as WorkbookFormulaError);
      }
      if (typeof item.value === 'number' && Number.isFinite(item.value)) numbers.push(item.value);
    }
  }
  return numbers;
}

class WorkbookFormulaParser {
  private cursor = 0;

  constructor(
    private readonly tokens: readonly FormulaToken[],
    private readonly resolveCell: (address: string) => FormulaScalar,
  ) {}

  parse(): FormulaScalar {
    const value = this.expression();
    if (this.peek().type !== 'eof' || value.kind === 'range') formulaError(WORKBOOK_FORMULA_ERRORS.invalid);
    return value;
  }

  private expression(): FormulaValue {
    return this.additive();
  }

  private additive(): FormulaValue {
    let value = this.multiplicative();
    while (this.peek().type === 'plus' || this.peek().type === 'minus') {
      const operator = this.take().type;
      const right = this.multiplicative();
      const leftNumber = scalarNumber(value);
      const rightNumber = scalarNumber(right);
      value = scalar(operator === 'plus' ? leftNumber + rightNumber : leftNumber - rightNumber);
    }
    return value;
  }

  private multiplicative(): FormulaValue {
    let value = this.unary();
    while (this.peek().type === 'star' || this.peek().type === 'slash') {
      const operator = this.take().type;
      const right = scalarNumber(this.unary());
      const left = scalarNumber(value);
      if (operator === 'slash' && right === 0) formulaError(WORKBOOK_FORMULA_ERRORS.divideByZero);
      value = scalar(operator === 'star' ? left * right : left / right);
    }
    return value;
  }

  private unary(): FormulaValue {
    if (this.peek().type === 'plus') {
      this.take();
      return scalar(scalarNumber(this.unary()));
    }
    if (this.peek().type === 'minus') {
      this.take();
      return scalar(-scalarNumber(this.unary()));
    }
    return this.primary();
  }

  private primary(): FormulaValue {
    const token = this.take();
    if (token.type === 'number') return scalar(Number(token.value));
    if (token.type === 'left') {
      const value = this.expression();
      this.expect('right');
      return value;
    }
    if (token.type !== 'identifier') formulaError(WORKBOOK_FORMULA_ERRORS.invalid);
    if (this.peek().type === 'left') return this.functionCall(token.value);
    const start = parseWorkbookCellAddress(token.value);
    if (!start) {
      if (/^[A-Z]{1,3}\d+$/u.test(token.value)) formulaError(WORKBOOK_FORMULA_ERRORS.reference);
      formulaError(WORKBOOK_FORMULA_ERRORS.name);
    }
    if (this.peek().type !== 'colon') return this.resolveCell(start.address);
    this.take();
    const endToken = this.take();
    const end = endToken.type === 'identifier' ? parseWorkbookCellAddress(endToken.value) : null;
    if (!end) formulaError(WORKBOOK_FORMULA_ERRORS.reference);
    const values: FormulaScalar[] = [];
    const firstRow = Math.min(start.row, end.row);
    const lastRow = Math.max(start.row, end.row);
    const firstColumn = Math.min(start.column, end.column);
    const lastColumn = Math.max(start.column, end.column);
    if ((lastRow - firstRow + 1) * (lastColumn - firstColumn + 1) > 100_000) {
      formulaError(WORKBOOK_FORMULA_ERRORS.reference);
    }
    for (let row = firstRow; row <= lastRow; row += 1) {
      for (let column = firstColumn; column <= lastColumn; column += 1) {
        values.push(this.resolveCell(workbookCellAddress(row, column)));
      }
    }
    return { kind: 'range', values };
  }

  private functionCall(name: string): FormulaScalar {
    if (!['SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT'].includes(name)) formulaError(WORKBOOK_FORMULA_ERRORS.name);
    this.expect('left');
    const values: FormulaValue[] = [];
    if (this.peek().type !== 'right') {
      do {
        values.push(this.expression());
        if (this.peek().type !== 'comma') break;
        this.take();
      } while (this.peek().type !== 'right');
    }
    this.expect('right');
    const numbers = aggregateNumbers(values);
    if (name === 'COUNT') return scalar(numbers.length);
    if (name === 'SUM') return scalar(numbers.reduce((total, value) => total + value, 0));
    if (name === 'AVERAGE') {
      if (!numbers.length) formulaError(WORKBOOK_FORMULA_ERRORS.divideByZero);
      return scalar(numbers.reduce((total, value) => total + value, 0) / numbers.length);
    }
    if (!numbers.length) return scalar(0);
    return scalar(
      numbers
        .slice(1)
        .reduce(
          (selected, value) => (name === 'MIN' ? Math.min(selected, value) : Math.max(selected, value)),
          numbers[0]!,
        ),
    );
  }

  private peek() {
    return this.tokens[this.cursor] || { type: 'eof' as const, value: '' };
  }

  private take() {
    const token = this.peek();
    this.cursor += 1;
    return token;
  }

  private expect(type: FormulaToken['type']) {
    if (this.peek().type !== type) formulaError(WORKBOOK_FORMULA_ERRORS.invalid);
    this.take();
  }
}

export function workbookColumnLabel(column: number) {
  let value = Math.min(PRODUCTION_WORKBOOK_MAX_COLUMNS, Math.max(1, Math.floor(column)));
  let label = '';
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

export function workbookCellAddress(row: number, column: number) {
  return `${workbookColumnLabel(column)}${Math.min(PRODUCTION_WORKBOOK_MAX_ROWS, Math.max(1, Math.floor(row)))}`;
}

export function workbookColumnNumber(label: string) {
  let value = 0;
  for (const character of String(label || '').toUpperCase()) {
    if (character < 'A' || character > 'Z') return 0;
    value = value * 26 + character.charCodeAt(0) - 64;
  }
  return value <= PRODUCTION_WORKBOOK_MAX_COLUMNS ? value : 0;
}

export function parseWorkbookCellAddress(address: string) {
  const match = String(address || '')
    .trim()
    .toUpperCase()
    .match(A1_PATTERN);
  if (!match) return null;
  const row = Number(match[2]);
  const column = workbookColumnNumber(match[1]);
  if (!column || row > PRODUCTION_WORKBOOK_MAX_ROWS) return null;
  return { row, column, address: `${match[1]}${match[2]}` };
}

export function workbookFormulaBarValue(cell?: ProductionWorkbookCellV1) {
  if (!cell) return '';
  if (cell.formula) return cell.formula.startsWith('=') ? cell.formula : `=${cell.formula}`;
  if (cell.value === null) return '';
  if (typeof cell.value === 'boolean') return cell.value ? 'TRUE' : 'FALSE';
  return String(cell.value);
}

export function workbookCellDisplay(cell?: ProductionWorkbookCellV1) {
  if (!cell) return '';
  if (cell.value !== null) {
    if (typeof cell.value === 'boolean') return cell.value ? 'TRUE' : 'FALSE';
    const format = cell.style?.numberFormat || 'general';
    if (typeof cell.value === 'number') {
      if (format === 'number') return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 }).format(cell.value);
      if (format === 'currency')
        return new Intl.NumberFormat('zh-CN', {
          style: 'currency',
          currency: 'CNY',
          minimumFractionDigits: 2,
        }).format(cell.value);
      if (format === 'percent')
        return new Intl.NumberFormat('zh-CN', {
          style: 'percent',
          maximumFractionDigits: 2,
        }).format(cell.value);
      if (format === 'date') {
        const excelEpoch = Date.UTC(1899, 11, 30);
        return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeZone: 'UTC' }).format(
          new Date(excelEpoch + cell.value * 86_400_000),
        );
      }
    }
    if (format === 'date' && typeof cell.value === 'string' && Number.isFinite(Date.parse(cell.value))) {
      return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(cell.value));
    }
    return String(cell.value);
  }
  return cell.formula ? `=${cell.formula.replace(/^=/u, '')}` : '';
}

export function parseWorkbookFormulaBarValue(
  source: string,
  existing?: ProductionWorkbookCellV1,
): ProductionWorkbookCellV1 | null {
  const value = String(source ?? '');
  const withStyle = (cell: ProductionWorkbookCellV1): ProductionWorkbookCellV1 =>
    existing?.style ? { ...cell, style: { ...existing.style } } : cell;
  if (!value.trim()) return null;
  const trimmed = value.trim();
  const normalizeFormula = (formula: string) => formula.trim().replace(/^=/u, '').trim();
  const existingFormula = existing?.formula ? normalizeFormula(existing.formula) : '';
  const submittedFormula = normalizeFormula(trimmed);
  const explicitFormula = trimmed.startsWith('=');
  if (existingFormula && submittedFormula === existingFormula) {
    return { value: existing?.value ?? null, formula: existing!.formula! };
  }
  if (explicitFormula) {
    const formula = submittedFormula;
    return formula ? withStyle({ value: null, formula }) : null;
  }
  if (BOOLEAN_PATTERN.test(trimmed)) return withStyle({ value: trimmed.toLocaleLowerCase() === 'true' });
  if (NUMBER_PATTERN.test(trimmed)) {
    const numericValue = Number(trimmed);
    if (Number.isFinite(numericValue)) return withStyle({ value: numericValue });
  }
  return withStyle({ value });
}

function analyzeWorkbookFormula(formula: string): WorkbookFormulaAnalysis {
  const dependencies = new Set<string>();
  try {
    new WorkbookFormulaParser(tokenizeWorkbookFormula(formula), (address) => {
      dependencies.add(address);
      return scalar(1);
    }).parse();
    return { supported: true, dependencies };
  } catch (error) {
    if (error instanceof WorkbookFormulaEvaluationError && error.code === WORKBOOK_FORMULA_ERRORS.divideByZero) {
      return { supported: true, dependencies };
    }
    return { supported: false, dependencies: new Set() };
  }
}

export function isWorkbookFormulaSupported(formula: string) {
  return analyzeWorkbookFormula(formula).supported;
}

function workbookSheetFormulaEvaluator(
  sheet: ProductionWorkbookSheetV1,
  analyses = new Map<string, WorkbookFormulaAnalysis>(),
  evaluationTargets?: ReadonlySet<string>,
) {
  const canonicalAddresses = new Map<string, string>();
  for (const address of Object.keys(sheet.cells)) {
    const parsed = parseWorkbookCellAddress(address);
    if (parsed) canonicalAddresses.set(parsed.address, address);
  }
  const cache = new Map<string, FormulaScalar>();
  const visiting = new Set<string>();

  const evaluateCell = (address: string): FormulaScalar => {
    const parsed = parseWorkbookCellAddress(address);
    if (!parsed) return scalar(WORKBOOK_FORMULA_ERRORS.reference);
    const canonical = parsed.address;
    const cached = cache.get(canonical);
    if (cached) return cached;
    if (visiting.has(canonical)) return scalar(WORKBOOK_FORMULA_ERRORS.cycle);
    const storedAddress = canonicalAddresses.get(canonical) || canonical;
    const cell = sheet.cells[storedAddress];
    if (!cell?.formula) {
      const result = scalar(cell?.value ?? null);
      cache.set(canonical, result);
      return result;
    }
    const analysis = analyses.get(canonical) || analyzeWorkbookFormula(cell.formula);
    analyses.set(canonical, analysis);
    if (!analysis.supported || (evaluationTargets && !evaluationTargets.has(canonical))) {
      const result = scalar(cell.value);
      cache.set(canonical, result);
      return result;
    }
    visiting.add(canonical);
    let result: FormulaScalar;
    try {
      result = new WorkbookFormulaParser(tokenizeWorkbookFormula(cell.formula), evaluateCell).parse();
      if (typeof result.value === 'number' && !Number.isFinite(result.value)) {
        result = scalar(WORKBOOK_FORMULA_ERRORS.value);
      }
    } catch (error) {
      result = scalar(error instanceof WorkbookFormulaEvaluationError ? error.code : WORKBOOK_FORMULA_ERRORS.invalid);
    } finally {
      visiting.delete(canonical);
    }
    cache.set(canonical, result);
    return result;
  };

  return evaluateCell;
}

export function evaluateWorkbookFormula(
  sheet: ProductionWorkbookSheetV1,
  formula: string,
): string | number | boolean | null {
  let temporaryAddress = workbookCellAddress(PRODUCTION_WORKBOOK_MAX_ROWS, PRODUCTION_WORKBOOK_MAX_COLUMNS);
  for (let column = PRODUCTION_WORKBOOK_MAX_COLUMNS; sheet.cells[temporaryAddress] && column > 1; column -= 1) {
    temporaryAddress = workbookCellAddress(PRODUCTION_WORKBOOK_MAX_ROWS, column - 1);
  }
  if (sheet.cells[temporaryAddress]) return WORKBOOK_FORMULA_ERRORS.reference;
  const evaluator = workbookSheetFormulaEvaluator({
    ...sheet,
    cells: { ...sheet.cells, [temporaryAddress]: { value: null, formula: String(formula || '').replace(/^=/u, '') } },
  });
  return evaluator(temporaryAddress).value;
}

/**
 * 只重新计算本引擎支持、且受指定地址变更影响的公式。未指定地址时会重算全部受支持公式；
 * 导入的复杂或跨表公式始终保留原公式与缓存值。
 */
export function recalculateWorkbookSheet(sheet: ProductionWorkbookSheetV1, changedAddresses?: readonly string[]) {
  const analyses = new Map<string, WorkbookFormulaAnalysis>();
  for (const [address, cell] of Object.entries(sheet.cells)) {
    const parsed = parseWorkbookCellAddress(address);
    if (parsed && cell.formula) analyses.set(parsed.address, analyzeWorkbookFormula(cell.formula));
  }
  const targets = new Set<string>();
  if (changedAddresses === undefined) {
    for (const [address, analysis] of analyses) if (analysis.supported) targets.add(address);
  } else {
    const affected = new Set(
      changedAddresses
        .map((address) => parseWorkbookCellAddress(address)?.address)
        .filter((address): address is string => Boolean(address)),
    );
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const [address, analysis] of analyses) {
        if (!analysis.supported || targets.has(address)) continue;
        if (affected.has(address) || [...analysis.dependencies].some((dependency) => affected.has(dependency))) {
          targets.add(address);
          affected.add(address);
          expanded = true;
        }
      }
    }
  }
  const evaluateCell = workbookSheetFormulaEvaluator(sheet, analyses, targets);
  let formulaCount = 0;
  let errorCount = 0;
  for (const [address, cell] of Object.entries(sheet.cells)) {
    const canonical = parseWorkbookCellAddress(address)?.address;
    if (!cell.formula || !canonical || !targets.has(canonical)) continue;
    formulaCount += 1;
    const result = evaluateCell(address).value;
    cell.value = result;
    if (typeof result === 'string' && Object.values(WORKBOOK_FORMULA_ERRORS).includes(result as WorkbookFormulaError)) {
      errorCount += 1;
    }
  }
  return { formulaCount, errorCount };
}

export function recalculateProductionWorkbook(content: ProductionWorkbookContentV1) {
  return content.sheets.map((sheet) => ({ sheetId: sheet.id, ...recalculateWorkbookSheet(sheet) }));
}

export function createWorkbookSheet(id: string, name: string): ProductionWorkbookSheetV1 {
  return { id, name, cells: {}, view: { freezeRows: 0, freezeColumns: 0 }, extensions: {} };
}

export function cloneProductionWorkbook(content: ProductionWorkbookContentV1): ProductionWorkbookContentV1 {
  // Project content is a JSON protocol. JSON cloning also unwraps Vue reactive
  // proxies, while structuredClone throws DataCloneError for those proxies.
  return JSON.parse(JSON.stringify(content)) as ProductionWorkbookContentV1;
}

export function workbookUsedRange(sheet?: ProductionWorkbookSheetV1) {
  let maxRow = 0;
  let maxColumn = 0;
  for (const address of Object.keys(sheet?.cells || {})) {
    const parsed = parseWorkbookCellAddress(address);
    if (!parsed) continue;
    maxRow = Math.max(maxRow, parsed.row);
    maxColumn = Math.max(maxColumn, parsed.column);
  }
  return { maxRow, maxColumn };
}

export interface WorkbookSelectionRange {
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
}

export function workbookSelectionRange(startAddress: string, endAddress = startAddress): WorkbookSelectionRange {
  const start = parseWorkbookCellAddress(startAddress) || { row: 1, column: 1 };
  const end = parseWorkbookCellAddress(endAddress) || start;
  return {
    startRow: Math.min(start.row, end.row),
    endRow: Math.max(start.row, end.row),
    startColumn: Math.min(start.column, end.column),
    endColumn: Math.max(start.column, end.column),
  };
}

export function workbookRangeAddresses(range: WorkbookSelectionRange) {
  const addresses: string[] = [];
  for (let row = range.startRow; row <= range.endRow; row += 1) {
    for (let column = range.startColumn; column <= range.endColumn; column += 1) {
      addresses.push(workbookCellAddress(row, column));
    }
  }
  return addresses;
}

export function applyWorkbookCellStyle(
  sheet: ProductionWorkbookSheetV1,
  range: WorkbookSelectionRange,
  patch: Partial<ProductionWorkbookCellStyleV1>,
) {
  for (const address of workbookRangeAddresses(range)) {
    const cell = sheet.cells[address] || { value: null };
    const style = { ...(cell.style || {}), ...patch };
    for (const [key, value] of Object.entries(style)) if (value === undefined) delete style[key as keyof typeof style];
    sheet.cells[address] = Object.keys(style).length
      ? { ...cell, style }
      : { value: cell.value, ...(cell.formula ? { formula: cell.formula } : {}) };
  }
}

function formulaReferenceIsQuoted(source: string, offset: number) {
  let quoted = false;
  for (let index = 0; index < offset; index += 1) {
    if (source[index] !== '"') continue;
    if (source[index + 1] === '"') {
      index += 1;
      continue;
    }
    quoted = !quoted;
  }
  return quoted;
}

function shiftFormulaReferences(
  formula: string,
  dimension: 'row' | 'column',
  at: number,
  delta: number,
  deletedCount = 0,
) {
  return String(formula || '').replace(
    /(?<![A-Z0-9_!])((?:\$)?[A-Z]{1,3})((?:\$)?[1-9][0-9]{0,6})(?![A-Z0-9_])/giu,
    (match, rawColumn: string, rawRow: string, offset: number, source: string) => {
      if (formulaReferenceIsQuoted(source, offset)) return match;
      const column = workbookColumnNumber(rawColumn.replace('$', ''));
      const row = Number(rawRow.replace('$', ''));
      if (!column || !row) return match;
      let nextColumn = column;
      let nextRow = row;
      if (dimension === 'row') {
        if (deletedCount && row >= at && row < at + deletedCount) return '#REF!';
        if (row >= at + deletedCount) nextRow = row + delta;
      } else {
        if (deletedCount && column >= at && column < at + deletedCount) return '#REF!';
        if (column >= at + deletedCount) nextColumn = column + delta;
      }
      if (
        nextRow < 1 ||
        nextRow > PRODUCTION_WORKBOOK_MAX_ROWS ||
        nextColumn < 1 ||
        nextColumn > PRODUCTION_WORKBOOK_MAX_COLUMNS
      ) {
        return '#REF!';
      }
      return `${rawColumn.startsWith('$') ? '$' : ''}${workbookColumnLabel(nextColumn)}${
        rawRow.startsWith('$') ? '$' : ''
      }${nextRow}`;
    },
  );
}

function shiftWorkbookCells(
  sheet: ProductionWorkbookSheetV1,
  dimension: 'row' | 'column',
  at: number,
  count: number,
  deleting: boolean,
) {
  const amount = Math.max(1, Math.floor(count));
  const limit = dimension === 'row' ? PRODUCTION_WORKBOOK_MAX_ROWS : PRODUCTION_WORKBOOK_MAX_COLUMNS;
  if (at < 1 || at > limit) return false;
  const entries = Object.entries(sheet.cells)
    .map(([address, cell]) => ({ parsed: parseWorkbookCellAddress(address)!, cell }))
    .filter((entry) => Boolean(entry.parsed));
  if (!deleting) {
    const maximum = Math.max(0, ...entries.map(({ parsed }) => (dimension === 'row' ? parsed.row : parsed.column)));
    if (maximum + amount > limit) return false;
  }
  const nextCells: ProductionWorkbookSheetV1['cells'] = {};
  for (const { parsed, cell } of entries) {
    let row = parsed.row;
    let column = parsed.column;
    const position = dimension === 'row' ? row : column;
    if (deleting && position >= at && position < at + amount) continue;
    if (position >= at + (deleting ? amount : 0)) {
      if (dimension === 'row') row += deleting ? -amount : amount;
      else column += deleting ? -amount : amount;
    }
    const shifted = { ...cell };
    if (cell.formula) {
      shifted.formula = shiftFormulaReferences(
        cell.formula,
        dimension,
        at,
        deleting ? -amount : amount,
        deleting ? amount : 0,
      );
    }
    nextCells[workbookCellAddress(row, column)] = shifted;
  }
  sheet.cells = nextCells;
  recalculateWorkbookSheet(sheet);
  return true;
}

export function insertWorkbookRows(sheet: ProductionWorkbookSheetV1, at: number, count = 1) {
  return shiftWorkbookCells(sheet, 'row', at, count, false);
}

export function deleteWorkbookRows(sheet: ProductionWorkbookSheetV1, at: number, count = 1) {
  return shiftWorkbookCells(sheet, 'row', at, count, true);
}

export function insertWorkbookColumns(sheet: ProductionWorkbookSheetV1, at: number, count = 1) {
  return shiftWorkbookCells(sheet, 'column', at, count, false);
}

export function deleteWorkbookColumns(sheet: ProductionWorkbookSheetV1, at: number, count = 1) {
  return shiftWorkbookCells(sheet, 'column', at, count, true);
}

export function clearWorkbookRange(sheet: ProductionWorkbookSheetV1, range: WorkbookSelectionRange) {
  for (const address of workbookRangeAddresses(range)) delete sheet.cells[address];
  recalculateWorkbookSheet(sheet);
}

function sortableWorkbookValue(cell?: ProductionWorkbookCellV1) {
  if (!cell || cell.value === null) return { empty: true, value: '' as string | number };
  if (typeof cell.value === 'number') return { empty: false, value: cell.value };
  if (typeof cell.value === 'boolean') return { empty: false, value: cell.value ? 1 : 0 };
  return { empty: false, value: String(cell.value).toLocaleLowerCase() };
}

export function sortWorkbookRange(
  sheet: ProductionWorkbookSheetV1,
  range: WorkbookSelectionRange,
  keyColumn: number,
  direction: 'ascending' | 'descending',
) {
  if (range.endRow <= range.startRow || keyColumn < range.startColumn || keyColumn > range.endColumn) return false;
  const rows = Array.from({ length: range.endRow - range.startRow + 1 }, (_, offset) => {
    const row = range.startRow + offset;
    return {
      row,
      cells: Array.from({ length: range.endColumn - range.startColumn + 1 }, (__, columnOffset) => {
        const address = workbookCellAddress(row, range.startColumn + columnOffset);
        return sheet.cells[address]
          ? (JSON.parse(JSON.stringify(sheet.cells[address])) as ProductionWorkbookCellV1)
          : undefined;
      }),
      key: sortableWorkbookValue(sheet.cells[workbookCellAddress(row, keyColumn)]),
    };
  });
  rows.sort((left, right) => {
    if (left.key.empty !== right.key.empty) return left.key.empty ? 1 : -1;
    const comparison =
      typeof left.key.value === 'number' && typeof right.key.value === 'number'
        ? left.key.value - right.key.value
        : String(left.key.value).localeCompare(String(right.key.value), 'zh-CN', { numeric: true });
    return direction === 'ascending' ? comparison : -comparison;
  });
  rows.forEach((source, rowOffset) => {
    const targetRow = range.startRow + rowOffset;
    source.cells.forEach((cell, columnOffset) => {
      const address = workbookCellAddress(targetRow, range.startColumn + columnOffset);
      if (cell) sheet.cells[address] = cell;
      else delete sheet.cells[address];
    });
  });
  recalculateWorkbookSheet(sheet);
  return true;
}
