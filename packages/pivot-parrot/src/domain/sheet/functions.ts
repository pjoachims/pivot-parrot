/**
 * The sheet's function list: what the autocomplete offers, Excel's German
 * names for those functions, and the rewrite that lets the formula engine
 * compute a formula written with them.
 */

import { CELL_REFERENCE, FUNCTION_MAY_FOLLOW, insideText } from './formula';

export interface SheetFunction {
  /** Excel's English name, as the list shows it. */
  name: string;
  /** Excel's German name, where it differs. */
  de?: string;
  args: string;
  description: string;
  /** The formula engine's key, where it differs from the name. */
  engine?: string;
}

// Only functions that compute in the sheet: jspreadsheet expands a range into its
// cells before the engine sees it, so SUMIF, COUNTIF, LARGE, VLOOKUP and the like,
// which need a range as one argument, return wrong results and are left out.
export const SHEET_FUNCTIONS: readonly SheetFunction[] = [
  { name: 'SUM', de: 'SUMME', args: 'number1, [number2], ...', description: 'Adds the numbers' },
  { name: 'AVERAGE', de: 'MITTELWERT', args: 'number1, [number2], ...', description: 'Arithmetic mean of the numbers' },
  { name: 'MIN', args: 'number1, [number2], ...', description: 'Smallest number' },
  { name: 'MAX', args: 'number1, [number2], ...', description: 'Largest number' },
  { name: 'COUNT', de: 'ANZAHL', args: 'value1, [value2], ...', description: 'Counts the cells that hold numbers' },
  { name: 'COUNTA', de: 'ANZAHL2', args: 'value1, [value2], ...', description: 'Counts the cells that are not empty' },
  { name: 'COUNTBLANK', de: 'ANZAHLLEEREZELLEN', args: 'range', description: 'Counts the empty cells' },
  { name: 'MEDIAN', args: 'number1, [number2], ...', description: 'Middle value of the numbers' },
  { name: 'STDEV.S', de: 'STABW.S', args: 'number1, [number2], ...', description: 'Standard deviation of a sample', engine: 'STDEVS' },
  { name: 'STDEV.P', de: 'STABW.N', args: 'number1, [number2], ...', description: 'Standard deviation of a population', engine: 'STDEVP' },
  { name: 'VAR.S', args: 'number1, [number2], ...', description: 'Variance of a sample', engine: 'VARS' },
  { name: 'VAR.P', args: 'number1, [number2], ...', description: 'Variance of a population', engine: 'VARP' },
  { name: 'PRODUCT', de: 'PRODUKT', args: 'number1, [number2], ...', description: 'Multiplies the numbers' },
  { name: 'POWER', de: 'POTENZ', args: 'number, power', description: 'A number raised to a power' },
  { name: 'SQRT', de: 'WURZEL', args: 'number', description: 'Square root' },
  { name: 'ABS', args: 'number', description: 'Absolute value' },
  { name: 'ROUND', de: 'RUNDEN', args: 'number, digits', description: 'Rounds to the given number of digits' },
  { name: 'ROUNDUP', de: 'AUFRUNDEN', args: 'number, digits', description: 'Rounds away from zero' },
  { name: 'ROUNDDOWN', de: 'ABRUNDEN', args: 'number, digits', description: 'Rounds toward zero' },
  { name: 'CEILING', de: 'OBERGRENZE', args: 'number, significance', description: 'Rounds up to a multiple of significance' },
  { name: 'FLOOR', de: 'UNTERGRENZE', args: 'number, significance', description: 'Rounds down to a multiple of significance' },
  { name: 'INT', de: 'GANZZAHL', args: 'number', description: 'Rounds down to an integer' },
  { name: 'TRUNC', de: 'KÜRZEN', args: 'number, [digits]', description: 'Cuts off the decimals' },
  { name: 'MOD', de: 'REST', args: 'number, divisor', description: 'Remainder of a division' },
  { name: 'IF', de: 'WENN', args: 'test, value_if_true, [value_if_false]', description: 'One value if the test holds, another if not' },
  { name: 'IFS', de: 'WENNS', args: 'test1, value1, [test2, value2], ...', description: 'The value of the first test that holds' },
  { name: 'IFERROR', de: 'WENNFEHLER', args: 'value, value_if_error', description: 'The value, or a fallback when it is an error' },
  { name: 'AND', de: 'UND', args: 'test1, [test2], ...', description: 'TRUE if every test holds' },
  { name: 'OR', de: 'ODER', args: 'test1, [test2], ...', description: 'TRUE if any test holds' },
  { name: 'NOT', de: 'NICHT', args: 'test', description: 'Reverses TRUE and FALSE' },
  { name: 'CONCATENATE', de: 'VERKETTEN', args: 'text1, [text2], ...', description: 'Joins texts into one' },
  { name: 'LEFT', de: 'LINKS', args: 'text, [count]', description: 'First characters of a text' },
  { name: 'RIGHT', de: 'RECHTS', args: 'text, [count]', description: 'Last characters of a text' },
  { name: 'LEN', de: 'LÄNGE', args: 'text', description: 'Number of characters' },
  { name: 'UPPER', de: 'GROSS', args: 'text', description: 'Text in upper case' },
  { name: 'LOWER', de: 'KLEIN', args: 'text', description: 'Text in lower case' },
  { name: 'TRIM', de: 'GLÄTTEN', args: 'text', description: 'Removes extra spaces' }
];

/** Every name the engine does not know, upper case, to the key it computes with. */
const ENGINE_NAMES = new Map<string, string>([['AVG', 'AVERAGE']]);
for (const f of SHEET_FUNCTIONS) {
  const key = f.engine ?? f.name;
  if (key !== f.name) ENGINE_NAMES.set(f.name, key);
  if (f.de) ENGINE_NAMES.set(f.de, key);
}

const NAME_CHARS = 'A-Za-z0-9_.ÄÖÜäöüß';
const FUNCTION_CALL = new RegExp(`(?<![${NAME_CHARS}$])[A-Za-zÄÖÜäöüß][${NAME_CHARS}]*(?=\\()`, 'g');
const NAME_AT_END = new RegExp(`(?<![${NAME_CHARS}$])[A-Za-zÄÖÜäöüß][${NAME_CHARS}]*$`);
const PART_OF_A_NAME = new RegExp(`[${NAME_CHARS}(]`);

/**
 * The formula as the engine computes it: German names and aliases become the
 * engine's names and ";" separates arguments like ",". Quoted text stays as it is.
 */
export function toEngineFormula(expression: string): string {
  // Split at every quote: the even parts are outside text, an escaped "" included.
  return expression
    .split('"')
    .map((part, i) => i % 2 === 1 ? part : part
      .replace(FUNCTION_CALL, name => ENGINE_NAMES.get(name.toUpperCase()) ?? name)
      .replace(/;/g, ','))
    .join('"');
}

/** The functions whose English or German name starts with the prefix, English matches first. */
export function functionMatches(prefix: string): SheetFunction[] {
  const p = prefix.toUpperCase();
  if (!p) return [];
  const english = SHEET_FUNCTIONS.filter(f => f.name.startsWith(p));
  const german = SHEET_FUNCTIONS.filter(f => !f.name.startsWith(p) && f.de?.startsWith(p));
  return [...english, ...german];
}

/** The name to insert for a match: German when only the German name fits what was typed. */
export function completionName(f: SheetFunction, prefix: string): string {
  const p = prefix.toUpperCase();
  return f.de && !f.name.startsWith(p) && f.de.startsWith(p) ? f.de : f.name;
}

/**
 * The partial function name the caret ends, as [start, end), where a function
 * may start; null inside quoted text, mid-word, or for a cell reference like B2.
 */
export function functionSlot(text: string, caret: number): [number, number] | null {
  if (!text.startsWith('=') || caret < 2 || insideText(text, caret)) return null;
  if (caret < text.length && PART_OF_A_NAME.test(text[caret])) return null;
  const before = text.slice(0, caret);
  const name = NAME_AT_END.exec(before);
  if (!name || CELL_REFERENCE.test(name[0]) || !FUNCTION_MAY_FOLLOW.test(before.slice(0, name.index))) return null;
  return [name.index, caret];
}
