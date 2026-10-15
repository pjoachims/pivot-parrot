/**
 * Filter Classes - OOP approach to filter management
 *
 * Filters are stored as plain objects in config (React-friendly)
 * but converted to class instances when needed for SQL generation or display
 *
 * Note: toSQL() methods now accept a SQLDialect parameter for engine-specific SQL generation
 */

import type { SQLDialect } from '../dialects/SQLDialect';

/**
 * A LIKE pattern literal ('<prefix><value><suffix>') that matches the value literally.
 * The escape character is '!' rather than '\\': in Spark SQL a backslash already
 * escapes inside the string literal, so ESCAPE '\\' is an unterminated literal there.
 */
function likePattern(dialect: SQLDialect, value: any, prefix: string, suffix: string): string {
  const escaped = String(value).replace(/[!%_]/g, '!$&');
  return `'${prefix}${dialect.escapeValue(escaped)}${suffix}' ESCAPE '!'`;
}

/**
 * Excluding a value keeps the blanks, as in Excel. In SQL NOT (x = 'A') is NULL,
 * not true, for a NULL x, so the NULL rows have to be let back in explicitly.
 */
function negate(field: string, condition: string): string {
  return `(NOT (${condition}) OR ${field} IS NULL)`;
}

/**
 * Base Filter class
 */
class Filter {
  public field: string;
  /** Arrow type of the filtered field, when known: decides how a typed-in value is quoted. */
  public dtype?: string | null;

  constructor({ field, dtype }: { field: string; dtype?: string | null }) {
    this.field = field;
    this.dtype = dtype;
  }

  /**
   * Generate SQL WHERE clause fragment
   * @param {SQLDialect} dialect - SQL dialect for engine-specific generation
   * @param {boolean} quoteField - Whether to quote the field identifier (default: true)
   * @returns {string} SQL fragment
   */
  toSQL(dialect: SQLDialect, quoteField: boolean = true): string | null {
    throw new Error('toSQL() must be implemented by subclass');
  }

  getLabel(): string {
    throw new Error('getLabel() must be implemented by subclass');
  }
}

/**
 * Date Range Filter (BETWEEN for dates)
 */
class DateRangeFilter extends Filter {
  public start: any;
  public end: any;

  constructor({ field, dtype, start, end, betweenStart, betweenEnd }: any) {
    super({ field, dtype });
    // Support both naming conventions
    this.start = start || betweenStart;
    this.end = end || betweenEnd;
  }

  toSQL(dialect: SQLDialect, quoteField = true): string {
    const field = quoteField ? dialect.quoteIdentifier(this.field) : this.field;
    const start = dialect.escapeValue(this.start);
    const end = dialect.escapeValue(this.end);
    return `${field} BETWEEN '${start}' AND '${end}'`;
  }

  getLabel(): string {
    return `${this.start} to ${this.end}`;
  }
}

/**
 * One Of Filter (IN clause with checkboxes)
 */
class OneOfFilter extends Filter {
  public selectedValues: any[];
  public isNot: boolean;

  constructor({ field, dtype, selectedValues, isNot = false }: any) {
    super({ field, dtype });
    this.selectedValues = selectedValues || [];
    this.isNot = isNot;
  }

  toSQL(dialect: SQLDialect, quoteField = true): string | null {
    if (!this.selectedValues || this.selectedValues.length === 0) return null;
    const field = quoteField ? dialect.quoteIdentifier(this.field) : this.field;
    const values = this.selectedValues.filter(v => v !== null && v !== undefined);
    const blanksSelected = values.length < this.selectedValues.length;
    const inList = values.length > 0
      ? `${field} IN (${values.map(v => dialect.quoteValue(v, this.dtype)).join(', ')})`
      : null;
    const condition = !inList ? `${field} IS NULL`
      : blanksSelected ? `(${inList} OR ${field} IS NULL)`
      : inList;
    if (!this.isNot) return condition;
    return blanksSelected ? `NOT (${condition})` : negate(field, condition);
  }

  getLabel(): string {
    const prefix = this.isNot ? 'NOT ' : '';
    return `${prefix}${this.selectedValues.length} selected`;
  }
}

/**
 * Between Filter (numeric ranges)
 */
class BetweenFilter extends Filter {
  public start: any;
  public end: any;

  constructor({ field, dtype, betweenStart, betweenEnd }) {
    super({ field, dtype });
    this.start = betweenStart;
    this.end = betweenEnd;
  }

  toSQL(dialect: SQLDialect, quoteField = true) {
    const field = quoteField ? dialect.quoteIdentifier(this.field) : this.field;
    const start = dialect.quoteValue(this.start, this.dtype);
    const end = dialect.quoteValue(this.end, this.dtype);
    return `${field} BETWEEN ${start} AND ${end}`;
  }

  getLabel() {
    return `${this.start} - ${this.end}`;
  }
}

/**
 * Equal Filter
 */
class EqualFilter extends Filter {
  public value: any;
  public isNot: boolean;

  constructor({ field, dtype, value, isNot = false }) {
    super({ field, dtype });
    this.value = value;
    this.isNot = isNot;
  }

  toSQL(dialect: SQLDialect, quoteField = true) {
    const field = quoteField ? dialect.quoteIdentifier(this.field) : this.field;
    const value = dialect.quoteValue(this.value, this.dtype);
    const condition = `${field} = ${value}`;
    return this.isNot ? negate(field, condition) : condition;
  }

  getLabel() {
    const prefix = this.isNot ? '≠ ' : '= ';
    return `${prefix}${this.value}`;
  }
}

/**
 * Contains Filter (LIKE %value%)
 */
class ContainsFilter extends Filter {
  public value: any;
  public isNot: boolean;

  constructor({ field, dtype, value, isNot = false }) {
    super({ field, dtype });
    this.value = value;
    this.isNot = isNot;
  }

  toSQL(dialect: SQLDialect, quoteField = true) {
    const field = quoteField ? dialect.quoteIdentifier(this.field) : this.field;
    const condition = `${field} LIKE ${likePattern(dialect, this.value, '%', '%')}`;
    return this.isNot ? negate(field, condition) : condition;
  }

  getLabel() {
    const prefix = this.isNot ? 'not contains ' : 'contains ';
    return `${prefix}"${this.value}"`;
  }
}

/**
 * Starts With Filter
 */
class StartsWithFilter extends Filter {
  public value: any;
  public isNot: boolean;

  constructor({ field, dtype, value, isNot = false }) {
    super({ field, dtype });
    this.value = value;
    this.isNot = isNot;
  }

  toSQL(dialect: SQLDialect, quoteField = true) {
    const field = quoteField ? dialect.quoteIdentifier(this.field) : this.field;
    const condition = `${field} LIKE ${likePattern(dialect, this.value, '', '%')}`;
    return this.isNot ? negate(field, condition) : condition;
  }

  getLabel() {
    const prefix = this.isNot ? 'not starts with ' : 'starts with ';
    return `${prefix}"${this.value}"`;
  }
}

/**
 * Ends With Filter
 */
class EndsWithFilter extends Filter {
  public value: any;
  public isNot: boolean;

  constructor({ field, dtype, value, isNot = false }) {
    super({ field, dtype });
    this.value = value;
    this.isNot = isNot;
  }

  toSQL(dialect: SQLDialect, quoteField = true) {
    const field = quoteField ? dialect.quoteIdentifier(this.field) : this.field;
    const condition = `${field} LIKE ${likePattern(dialect, this.value, '%', '')}`;
    return this.isNot ? negate(field, condition) : condition;
  }

  getLabel() {
    const prefix = this.isNot ? 'not ends with ' : 'ends with ';
    return `${prefix}"${this.value}"`;
  }
}

/**
 * Regex Filter
 */
class RegexFilter extends Filter {
  public value: any;
  public isNot: boolean;

  constructor({ field, dtype, value, isNot = false }) {
    super({ field, dtype });
    this.value = value;
    this.isNot = isNot;
  }

  toSQL(dialect: SQLDialect, quoteField = true) {
    const field = quoteField ? dialect.quoteIdentifier(this.field) : this.field;
    const condition = dialect.getFunction('regex_match', field, `'${dialect.escapeValue(this.value)}'`);
    return this.isNot ? negate(field, condition) : condition;
  }

  getLabel() {
    const prefix = this.isNot ? 'not matches ' : 'matches ';
    return `${prefix}/${this.value}/`;
  }
}

/**
 * Null Filter
 */
class NullFilter extends Filter {
  public isNot: boolean;

  constructor({ field, dtype, isNot = false }) {
    super({ field, dtype });
    this.isNot = isNot;
  }

  toSQL(dialect: SQLDialect, quoteField = true) {
    const field = quoteField ? dialect.quoteIdentifier(this.field) : this.field;
    return `${field} IS ${this.isNot ? 'NOT ' : ''}NULL`;
  }

  getLabel() {
    return this.isNot ? 'is not null' : 'is null';
  }
}

/**
 * Greater Than Filter
 */
class GreaterFilter extends Filter {
  public value: any;
  public isNot: boolean;

  constructor({ field, dtype, value, isNot = false }) {
    super({ field, dtype });
    this.value = value;
    this.isNot = isNot;
  }

  toSQL(dialect: SQLDialect, quoteField = true) {
    const field = quoteField ? dialect.quoteIdentifier(this.field) : this.field;
    const value = dialect.quoteValue(this.value, this.dtype);
    const condition = `${field} > ${value}`;
    return this.isNot ? negate(field, condition) : condition;
  }

  getLabel() {
    return `> ${this.value}`;
  }
}

/**
 * Less Than Filter
 */
class LessFilter extends Filter {
  public value: any;
  public isNot: boolean;

  constructor({ field, dtype, value, isNot = false }) {
    super({ field, dtype });
    this.value = value;
    this.isNot = isNot;
  }

  toSQL(dialect: SQLDialect, quoteField = true) {
    const field = quoteField ? dialect.quoteIdentifier(this.field) : this.field;
    const value = dialect.quoteValue(this.value, this.dtype);
    const condition = `${field} < ${value}`;
    return this.isNot ? negate(field, condition) : condition;
  }

  getLabel() {
    return `< ${this.value}`;
  }
}

/**
 * Greater Than or Equal Filter
 */
class GreaterEqualFilter extends Filter {
  public value: any;
  public isNot: boolean;

  constructor({ field, dtype, value, isNot = false }) {
    super({ field, dtype });
    this.value = value;
    this.isNot = isNot;
  }

  toSQL(dialect: SQLDialect, quoteField = true) {
    const field = quoteField ? dialect.quoteIdentifier(this.field) : this.field;
    const value = dialect.quoteValue(this.value, this.dtype);
    const condition = `${field} >= ${value}`;
    return this.isNot ? negate(field, condition) : condition;
  }

  getLabel() {
    return `≥ ${this.value}`;
  }
}

/**
 * Less Than or Equal Filter
 */
class LessEqualFilter extends Filter {
  public value: any;
  public isNot: boolean;

  constructor({ field, dtype, value, isNot = false }) {
    super({ field, dtype });
    this.value = value;
    this.isNot = isNot;
  }

  toSQL(dialect: SQLDialect, quoteField = true) {
    const field = quoteField ? dialect.quoteIdentifier(this.field) : this.field;
    const value = dialect.quoteValue(this.value, this.dtype);
    const condition = `${field} <= ${value}`;
    return this.isNot ? negate(field, condition) : condition;
  }

  getLabel() {
    return `≤ ${this.value}`;
  }
}

/**
 * Custom Filter Expression (raw SQL)
 * User is responsible for writing engine-compatible SQL
 */
class CustomFilterExpression extends Filter {
  public expr: string;
  public name: string;
  public isCustom: boolean;

  constructor({ field, dtype, expr, name, isCustom }) {
    super({ field, dtype });
    this.expr = expr;
    this.name = name;
    this.isCustom = isCustom;
  }

  toSQL(dialect: SQLDialect) {
    // Custom filter expressions are already SQL, just wrap in parentheses
    // User is responsible for engine compatibility
    return `(${this.expr})`;
  }

  getLabel() {
    return this.name || 'Custom filter';
  }
}

/**
 * Filter Factory - converts plain object to Filter instance
 *
 * @param {Object} filterDict - Plain filter object from config
 * @returns {Filter} Filter instance with toSQL() and getLabel() methods
 */
export function buildFilter(filterDict) {
  const { type, isCustom } = filterDict;

  // Handle custom filter expressions
  if (type === 'custom_filter' || isCustom) {
    return new CustomFilterExpression(filterDict);
  }

  switch (type) {
    case 'date_range':
      return new DateRangeFilter(filterDict);

    case 'one_of':
      return new OneOfFilter(filterDict);

    case 'between':
      return new BetweenFilter(filterDict);

    case 'equal':
      return new EqualFilter(filterDict);

    case 'contains':
      return new ContainsFilter(filterDict);

    case 'starts_with':
      return new StartsWithFilter(filterDict);

    case 'ends_with':
      return new EndsWithFilter(filterDict);

    case 'regex':
      return new RegexFilter(filterDict);

    case 'null':
      return new NullFilter(filterDict);

    case 'greater':
      return new GreaterFilter(filterDict);

    case 'less':
      return new LessFilter(filterDict);

    case 'greater_equal':
      return new GreaterEqualFilter(filterDict);

    case 'less_equal':
      return new LessEqualFilter(filterDict);

    case 'custom_expr':
      return new CustomFilterExpression({
        ...filterDict,
        expr: filterDict.value,
        name: 'Custom expression'
      });

    default:
      throw new Error(`Unknown filter type: ${type}`);
  }
}
