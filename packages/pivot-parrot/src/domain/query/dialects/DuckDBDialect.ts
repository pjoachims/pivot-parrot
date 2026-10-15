import { SQLDialect } from './SQLDialect';

/**
 * DuckDBDialect - SQL dialect for DuckDB
 *
 * Inherits Arrow type system from SQLDialect base class.
 * Only overrides toSQL methods for DuckDB-specific SQL generation.
 */
export class DuckDBDialect extends SQLDialect {
  constructor() {
    super();

    // Override timestamp toSQL for DuckDB's EPOCH_MS function
    this.types.timestamp = {
      ...this.types.timestamp,
      toSQL: (val: any) => {
        if (val === null || val === undefined) return 'NULL';
        // DuckDB: EPOCH_MS() for timestamp construction
        const ms = typeof val === 'bigint' ? Number(val / 1000n) : val;
        return `EPOCH_MS(${ms})`;
      }
    };

    // Override date32 toSQL for DuckDB's CAST(EPOCH_MS() AS DATE)
    this.types.date32 = {
      ...this.types.date32,
      toSQL: (val: any) => {
        if (val === null || val === undefined) return 'NULL';
        // DuckDB: CAST(EPOCH_MS() AS DATE)
        if (typeof val === 'number') {
          return `CAST(EPOCH_MS(${val}) AS DATE)`;
        }
        return `DATE '${val}'`;
      }
    };

    // Override decimal128 for DuckDB's quoted decimal strings
    this.types.decimal128 = {
      ...this.types.decimal128,
      toDisplay: (val: any) => {
        if (val === null || val === undefined) return null;
        // Strip quotes from large DECIMAL strings (e.g., "17592609399340031059533")
        const str = String(val);
        if (str.startsWith('"') && str.endsWith('"')) {
          return str.slice(1, -1);
        }
        return val;
      },
      toSQL: (val: any) => {
        if (val === null || val === undefined) return 'NULL';
        const str = String(val);
        if (str.startsWith('"') && str.endsWith('"')) {
          return str.slice(1, -1);
        }
        return String(val);
      }
    };

    // DuckDB-specific aggregations
    this.aggregations.approx_count_distinct = (field) =>
      `APPROX_COUNT_DISTINCT(${field})`;
    this.aggregations.median = (field) => `MEDIAN(${field})`;
    this.aggregations.mode = (field) => `MODE(${field})`;

    this.functions.regex_match = (field, pattern) => `regexp_matches(${field}, ${pattern})`;

    // DuckDB-specific date/time functions
    this.functions.date_part = (part, field) => `DATE_PART('${part}', ${field})`;
    this.functions.epoch_ms = (field) => `EPOCH_MS(${field})`;
    this.functions.to_timestamp = (expr) => `TO_TIMESTAMP(${expr})`;
    this.functions.floor = (expr) => `FLOOR(${expr})`;
    this.functions.period_start = (unit, offset) =>
      `CAST(date_trunc('${unit}', current_date) + INTERVAL (${offset}) ${unit.toUpperCase()} AS DATE)`;
  }

  get name() {
    return 'duckdb';
  }

  /**
   * Map DuckDB type to Arrow type
   * @param {string} duckdbType - Native DuckDB type string (e.g., 'BIGINT', 'VARCHAR', 'TIMESTAMP')
   * @returns Arrow type object with icon, isNumeric, toDisplay, toSQL
   */
  mapTypeToArrowType(duckdbType: string) {
    const type = duckdbType.toUpperCase();

    // Integer types
    if (type.includes('BIGINT') || type.includes('INT64') || type.includes('HUGEINT')) {
      return this.types.int64;
    }
    if (type === 'INTEGER' || type === 'INT' || type.includes('INT32')) return this.types.int32;
    if (type.includes('SMALLINT') || type.includes('INT16')) return this.types.int16;
    if (type.includes('TINYINT') || type.includes('INT8')) return this.types.int8;

    // Unsigned integers
    if (type.includes('UBIGINT') || type.includes('UINT64')) return this.types.uint64;
    if (type.includes('UINTEGER') || type.includes('UINT32')) return this.types.uint32;
    if (type.includes('USMALLINT') || type.includes('UINT16')) return this.types.uint16;
    if (type.includes('UTINYINT') || type.includes('UINT8')) return this.types.uint8;

    // Float types
    if (type.includes('DOUBLE')) return this.types.double;
    if (type.includes('FLOAT') || type.includes('REAL')) return this.types.float32;
    if (type.includes('DECIMAL') || type.includes('NUMERIC')) return this.types.decimal;

    // String types
    if (type.includes('VARCHAR') || type.includes('CHAR') || type === 'TEXT' || type === 'STRING') {
      return this.types.string;
    }

    // Temporal types
    if (type.includes('TIMESTAMP')) return this.types.timestamp;
    if (type === 'DATE') return this.types.date32;
    if (type.includes('TIME')) return this.types.time64;

    // Boolean
    if (type.includes('BOOLEAN') || type.includes('BOOL')) return this.types.bool;

    // Complex types
    if (type.includes('STRUCT')) return this.types.struct;
    if (type.includes('LIST') || type.includes('ARRAY')) return this.types.list;
    if (type.includes('MAP')) return this.types.map;

    // Binary
    if (type.includes('BLOB') || type.includes('BINARY')) return this.types.binary;

    // UUID (treat as string)
    if (type === 'UUID') return this.types.string;

    // Default fallback to string
    return this.types.string;
  }

  /**
   * Format date/timestamp columns to strings using STRFTIME
   * @param {string} columnName - Column name (already quoted if needed)
   * @param {string} fieldType - Field type ('date', 'timestamp', etc.)
   * @returns {string} SQL expression
   */
  formatDateColumn(columnName: string, fieldType: string): string {
    const lowerType = fieldType.toLowerCase();
    if (lowerType.includes('date32') || lowerType.includes('date')) {
      return `STRFTIME(${columnName}, '%Y-%m-%d')`;
    } else if (lowerType.includes('timestamp')) {
      return `STRFTIME(${columnName}, '%Y-%m-%d %H:%M:%S')`;
    }
    return columnName;
  }
}
