import type { ArrowTypeDefinition } from '../../types/ArrowTypes';
import { Arrow, uint32ArrayToNumber } from '../../types/ArrowTypes';

/**
 * SQLDialect - Base class for SQL dialect abstraction
 *
 * Uses Arrow types as the base type system. All data comes from Arrow Tables,
 * so we use Arrow type names directly (Int64, Utf8, Timestamp, etc.).
 *
 * Dialects can override toSQL methods for engine-specific SQL generation.
 *
 * Registries:
 * - types: Arrow type name → ArrowTypeDefinition (with toDisplay, toSQL)
 * - aggregations: Aggregation name → SQL generator function
 * - operators: Operator name → SQL operator string
 * - functions: Function name → SQL generator function
 */
export class SQLDialect {
  public types: Record<string, ArrowTypeDefinition>;
  public aggregations: Record<string, (field: string, options?: any) => string>;
  public operators: Record<string, string>;
  public functions: Record<string, (...args: any[]) => string>;

  constructor() {
    // Use Arrow types as base - all data comes from Arrow Tables
    this.types = { ...Arrow };

    // Aggregation registry: agg name → generator function
    this.aggregations = {
      'sum': (field) => `SUM(${field})`,
      'avg': (field) => `AVG(${field})`,
      'count': (field) => `COUNT(${field})`,
      'min': (field) => `MIN(${field})`,
      'max': (field) => `MAX(${field})`,
      'count_distinct': (field) => `COUNT(DISTINCT ${field})`,
      // Statistical aggregations (SQL standard)
      'stddev': (field) => `STDDEV(${field})`,
      'variance': (field) => `VARIANCE(${field})`,
      // median and mode not included - not universal SQL standard
      // approx_count_distinct not included - not universal
    };

    // Operator registry: operator name → SQL operator string
    this.operators = {
      // regex not included - not universal
    };

    // Function registry: function name → generator function
    // Only includes SQL standard functions (SQL-92/SQL-99)
    this.functions = {
      'extract': (part, field) => `EXTRACT(${part.toUpperCase()} FROM ${field})`,
      'floor': (expr) => `FLOOR(${expr})`,
      // String formatting for derived fields
      'cast_to_string': (expr) => `CAST(${expr} AS VARCHAR)`,
      'lpad': (expr, len, char) => `LPAD(CAST(${expr} AS VARCHAR), ${len}, '${char}')`,
      // unix_timestamp and from_unixtime removed - MySQL/Databricks-specific
      // Subclasses should add database-specific functions as needed
    };
  }

  /**
   * Get dialect name
   * @returns {string}
   */
  get name() {
    return 'generic';
  }

  // ==================== TYPE TRANSFORMS ====================

  /**
   * Transform value for display using type registry
   * @param {any} value - Raw value
   * @param {string} typeName - Engine type name (may include params like "decimal<35,19>")
   * @returns {any} Formatted value for display
   */
  toDisplay(value: any, typeName: string): any {
    const { baseType, type, params } = this.parseTypeName(typeName);
    if (!type) {
      console.warn(`Unknown type: ${baseType}, returning raw value`);
      return value;
    }
    return type.toDisplay(value, params);
  }

  /**
   * Split a parameterized type name ("decimal<35,19>") into its registry entry and params ("35,19").
   */
  parseTypeName(typeName: string): { baseType: string; type: ArrowTypeDefinition | undefined; params: string | null } {
    const idx = typeName.indexOf('<');
    const baseType = idx === -1 ? typeName : typeName.slice(0, idx);
    const params = idx === -1 ? null : typeName.slice(idx + 1, -1);
    return { baseType, type: this.types[baseType], params };
  }

  /**
   * Convert value to Number for charts
   * Handles decimal types with proper scale conversion
   * @param {any} value - Raw value
   * @param {string} typeName - Engine type name (may include params like "decimal<38,19>")
   * @returns {number | null} Numeric value for charts
   */
  toChartValue(value: any, typeName: string): number | null {
    if (value === null || value === undefined) return null;

    // Parse parameterized types: "decimal<38,19>" → baseType="decimal", params="38,19"
    const idx = typeName.indexOf('<');
    const baseType = idx === -1 ? typeName : typeName.slice(0, idx);
    const params = idx === -1 ? null : typeName.slice(idx + 1, -1);

    // Handle decimal types specially
    if (baseType === 'decimal' || baseType === 'decimal128' || baseType === 'decimal256') {
      const scale = params ? parseInt(params.split(',')[1], 10) : 0;

      // Handle Uint32Array (Apache Arrow JS representation)
      if (value instanceof Uint32Array) {
        return uint32ArrayToNumber(value, scale);
      }

      // Handle BigInt
      if (typeof value === 'bigint') {
        return Number(value) / Math.pow(10, scale);
      }
    }

    // Default: convert to Number
    if (typeof value === 'number') return value;
    if (typeof value === 'bigint') return Number(value);

    try {
      const num = Number(value);
      return isNaN(num) ? null : num;
    } catch {
      return null;
    }
  }

  /**
   * Transform value to SQL literal using type registry
   * @param {any} value - Raw value
   * @param {string} typeName - Engine type name
   * @returns {string} SQL literal
   */
  toSQL(value: any, typeName: string): string {
    const type = this.types[typeName];
    if (!type) {
      console.warn(`Unknown type: ${typeName}, returning NULL`);
      return 'NULL';
    }
    return type.toSQL(value);
  }

  /**
   * Map native database type to Arrow type
   * Generic implementation for standard SQL types.
   * Subclasses should override for database-specific type mappings.
   * @param {string} nativeType - Native database type string (e.g., 'BIGINT', 'VARCHAR', 'TIMESTAMP')
   * @returns Arrow type object with icon, isNumeric, toDisplay, toSQL
   */
  mapTypeToArrowType(nativeType: string) {
    const type = nativeType.toUpperCase();

    // Integer types (SQL standard)
    if (type.includes('BIGINT') || type.includes('INT8') || type.includes('INT64')) return this.types.int64;
    if (type === 'INTEGER' || type === 'INT' || type.includes('INT4') || type.includes('INT32')) return this.types.int32;
    if (type.includes('SMALLINT') || type.includes('INT2') || type.includes('INT16')) return this.types.int16;

    // Float types (SQL standard)
    if (type.includes('DOUBLE')) return this.types.double;
    if (type.includes('REAL') || type.includes('FLOAT')) return this.types.float32;
    if (type.includes('DECIMAL') || type.includes('NUMERIC')) return this.types.decimal;

    // String types (SQL standard)
    if (type.includes('VARCHAR') || type.includes('CHAR') || type === 'TEXT' || type === 'STRING') {
      return this.types.string;
    }

    // Temporal types (SQL standard)
    if (type.includes('TIMESTAMP')) return this.types.timestamp;
    if (type === 'DATE') return this.types.date32;
    if (type.includes('TIME')) return this.types.time64;

    // Boolean (SQL standard)
    if (type.includes('BOOLEAN') || type.includes('BOOL')) return this.types.bool;

    // Binary
    if (type.includes('BINARY') || type.includes('BLOB')) return this.types.binary;

    // Default fallback to string
    return this.types.string;
  }


  // ==================== IDENTIFIERS & VALUES ====================

  /**
   * Quote identifier if needed (spaces, special chars, starts with number)
   * @param {string} identifier - Column/table name
   * @returns {string} Quoted identifier
   */
  quoteIdentifier(identifier: string): string {
    const needsQuotes = /[^a-zA-Z0-9_]/.test(identifier) || /^[0-9]/.test(identifier);
    return needsQuotes ? `"${identifier.replace(/"/g, '""')}"` : identifier;
  }

  /**
   * Generate CAST expression
   * @param {string} expr - SQL expression to cast
   * @param {string} targetType - Target type name (engine-specific)
   * @returns {string} CAST expression
   */
  cast(expr: string, targetType: string): string {
    return `CAST(${expr} AS ${targetType.toUpperCase()})`;
  }

  /**
   * Escape string value for SQL (single quotes)
   * @param {any} value - Value to escape
   * @returns {string} Escaped value (without surrounding quotes)
   */
  escapeValue(value: any): string {
    return String(value).replace(/'/g, "''");
  }

  /**
   * Quote a filter value as an SQL literal.
   * A JS string is a string literal, except that a numeric string on a numeric
   * field (a number typed into a filter dialog) is emitted as a number. The
   * string's content alone never decides: '01234' on a string field stays '01234'.
   * @param value - Filter value
   * @param dtype - Arrow type name of the filtered field, when known
   */
  quoteValue(value: any, dtype?: string | null): string {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    if (typeof value === 'number' || typeof value === 'bigint') return String(value);
    if (value instanceof Date) return `'${value.toISOString()}'`;

    const str = String(value);
    if (dtype && this.parseTypeName(dtype).type?.isNumeric && /^\s*-?\d+(\.\d+)?\s*$/.test(str)) {
      return str.trim();
    }
    return `'${this.escapeValue(str)}'`;
  }

  // ==================== AGGREGATION REGISTRY ====================

  /**
   * Get aggregation SQL expression
   * @param {string} aggName - Aggregation name (sum, count, approx_count_distinct, etc.)
   * @param {string} field - Field expression (already quoted if needed)
   * @returns {string} SQL aggregation expression
   * @throws {Error} If aggregation not supported by this dialect
   */
  getAggregation(aggName: string, field: string): string {
    const aggFunc = this.aggregations[aggName];
    if (!aggFunc) {
      throw new Error(
        `Aggregation '${aggName}' is not supported by ${this.name} dialect. ` +
        `Available: ${Object.keys(this.aggregations).join(', ')}`
      );
    }
    return aggFunc(field);
  }

  /**
   * Build complete aggregation expression from field name and aggregation type
   * Handles quoting and dialect-specific SQL generation
   * @param {string} fieldName - Raw field name (will be quoted)
   * @param {string} aggregation - Aggregation type (e.g., 'sum', 'count', 'count_distinct')
   * @returns {string} Complete SQL aggregation expression
   */
  buildAggregation(fieldName: string, aggregation: string): string {
    const quotedField = this.quoteIdentifier(fieldName);
    const aggKey = aggregation.toLowerCase().replace(/\s+/g, '_');
    return this.getAggregation(aggKey, quotedField);
  }

  // ==================== OPERATOR REGISTRY ====================

  /**
   * Get SQL operator string
   * @param {string} opName - Operator name (regex, etc.)
   * @param {boolean} isNot - Whether to negate (NOT operator)
   * @returns {string} SQL operator
   * @throws {Error} If operator not supported by this dialect
   */
  getOperator(opName: string, isNot: boolean = false): string {
    const op = this.operators[opName];
    if (!op) {
      throw new Error(
        `Operator '${opName}' is not supported by ${this.name} dialect. ` +
        `Available: ${Object.keys(this.operators).join(', ') || 'none'}`
      );
    }
    return isNot ? `NOT ${op}` : op;
  }

  // ==================== FUNCTION REGISTRY ====================

  /**
   * Get SQL function expression
   * @param {string} funcName - Function name (extract, date_part, etc.)
   * @param {...any} args - Function arguments
   * @returns {string} SQL function expression
   * @throws {Error} If function not supported by this dialect
   */
  getFunction(funcName: string, ...args: any[]): string {
    const func = this.functions[funcName];
    if (!func) {
      throw new Error(
        `Function '${funcName}' is not supported by ${this.name} dialect. ` +
        `Available: ${Object.keys(this.functions).join(', ') || 'none'}`
      );
    }
    return func(...args);
  }

  // ==================== DATE FORMATTING ====================

  /**
   * Format a date/timestamp column to a string representation
   * @param {string} columnName - Column name (already quoted if needed)
   * @param {string} fieldType - Field type ('date', 'timestamp', etc.)
   * @returns {string} SQL expression that returns formatted date string
   */
  formatDateColumn(columnName: string, fieldType: string): string {
    // Default: cast to VARCHAR (generic fallback)
    if (fieldType === 'date' || fieldType === 'timestamp') {
      return `CAST(${columnName} AS VARCHAR)`;
    }
    return columnName;
  }

  // ==================== UTILITY ====================

  /**
   * Check if this dialect supports a specific feature
   * @param {string} type - Registry type ('aggregation', 'operator', 'type', 'function')
   * @param {string} name - Feature name
   * @returns {boolean}
   */
  supports(type: string, name: string): boolean {
    switch (type) {
      case 'aggregation':
        return name in this.aggregations;
      case 'operator':
        return name in this.operators;
      case 'type':
        return name in this.types;
      case 'function':
        return name in this.functions;
      default:
        return false;
    }
  }

  // ==================== WHERE CLAUSE BUILDING ====================

  /**
   * Build WHERE clause from filters
   * @param {Array<{field: string, value?: any, sqlExpr?: string, typeName?: string}>} filters - Array of filter objects
   * @returns {string} WHERE clause SQL (without "WHERE" keyword)
   */
  buildWhereClause(filters: Array<{field?: string, value?: any, sqlExpr?: string, typeName?: string}>): string {
    if (!filters || filters.length === 0) return '';

    const clauses = filters.map(filter => {
      // If sqlExpr is provided with value/typeName, build boolean condition: (sqlExpr = value)
      if (filter.sqlExpr && (filter.value !== undefined || filter.typeName !== undefined)) {
        const { value, typeName } = filter;

        // Handle NULL
        if (value === null || value === undefined) {
          return `(${filter.sqlExpr}) IS NULL`;
        }

        // Special handling for BOOLEAN type: expression is already a boolean condition
        // Don't compare with TRUE/FALSE, just use it directly or negate it
        if (typeName && this.types[typeName]?.category === 'boolean') {
          if (value === true) {
            return `(${filter.sqlExpr})`;
          } else {
            return `NOT (${filter.sqlExpr})`;
          }
        }

        // Use type registry to convert value to SQL
        const sqlValue = typeName ? this.toSQL(value, typeName) : this.quoteValue(value);
        return `(${filter.sqlExpr} = ${sqlValue})`;
      }

      // If sqlExpr is provided without value/typeName, use it directly (already a complete condition)
      if (filter.sqlExpr) {
        return `(${filter.sqlExpr})`;
      }

      // Otherwise, build simple equality filter (dimension filters)
      const { field, value, typeName } = filter;
      if (!field) {
        throw new Error('Filter must have either sqlExpr or field property');
      }

      const quotedField = this.quoteIdentifier(field);

      // Handle NULL
      if (value === null || value === undefined) {
        return `${quotedField} IS NULL`;
      }

      // Use type registry to convert value to SQL
      const sqlValue = typeName ? this.toSQL(value, typeName) : this.quoteValue(value);
      return `(${quotedField} = ${sqlValue})`;
    });

    return clauses.join(' AND ');
  }

  /**
   * Detect pivot-friendly field types from schema
   * Maps each field's native type to Arrow type name using mapTypeToArrowType()
   * For decimal types, preserves precision/scale as "decimal<p,s>" for proper formatting.
   * @param schema - Schema array with {name, type} objects
   * @returns Field type mapping {columnName: Arrow type name string}
   */
  detectFieldTypes(schema: Array<{name: string, type: string}>): Record<string, string> {
    const types: Record<string, string> = {};
    const mappingLog: Array<{field: string, schemaType: string, arrowType: string, icon: string}> = [];

    schema.forEach(col => {
      const arrowTypeObj = col.type
        ? this.mapTypeToArrowType(col.type)
        : this.types.string;

      // For decimal types, preserve precision/scale from original type
      // e.g., "decimal(35,19)" → "decimal<35,19>"
      let typeName = arrowTypeObj.name;
      if (arrowTypeObj.name === 'decimal' && col.type) {
        const decimalMatch = col.type.match(/decimal\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)/i);
        if (decimalMatch) {
          typeName = `decimal<${decimalMatch[1]},${decimalMatch[2]}>`;
        }
      }

      // Store the Arrow type NAME (string), not the full object
      types[col.name] = typeName;

      // Collect mapping for debug logging
      mappingLog.push({
        field: col.name,
        schemaType: col.type || 'unknown',
        arrowType: arrowTypeObj.name,
        icon: arrowTypeObj.icon
      });
    });

    return types;
  }

  /**
   * Normalize Arrow type string to Arrow type name
   * Arrow type strings come in various formats:
   * - "Int64", "Utf8", "Bool"
   * - "Timestamp(Microsecond, None)"
   * - "Date32[days]" or "Date32<day>"
   * - "Decimal(38, 10)" or "Decimal128(35, 19)"
   *
   * We normalize these to Arrow type names that match our type registry.
   * For decimal types, we preserve precision/scale as "decimal<p,s>" for proper formatting.
   *
   * @param arrowTypeStr - Arrow type string from schema
   * @returns Normalized Arrow type name (matches keys in Arrow type registry)
   */
  detectArrowType(arrowTypeStr: string): string {
    // Check for decimal types - preserve precision/scale as params
    const decimalMatch = arrowTypeStr.match(/^Decimal\d*\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)/i);
    if (decimalMatch) {
      const precision = decimalMatch[1];
      const scale = decimalMatch[2];
      return `decimal<${precision},${scale}>`;
    }

    // Remove brackets, angle brackets, parentheses, and parameters
    const normalized = arrowTypeStr.split(/[\[\(<]/)[0].trim();

    // Return as-is - the Arrow type registry uses these exact names
    // (int64, utf8, timestamp, date32, bool, float64, etc.)
    return normalized.toLowerCase();
  }
}
