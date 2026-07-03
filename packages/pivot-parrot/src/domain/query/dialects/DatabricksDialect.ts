import { SQLDialect } from './SQLDialect';

/**
 * DatabricksDialect - SQL dialect for Databricks SQL
 *
 * Inherits Arrow type system from SQLDialect base class.
 * Only overrides toSQL methods for Databricks-specific SQL generation.
 *
 * Databricks SQL is based on Apache Spark SQL.
 */
export class DatabricksDialect extends SQLDialect {
  constructor() {
    super();

    // Override timestamp toSQL for Databricks's TIMESTAMP_MILLIS function
    this.types.timestamp = {
      ...this.types.timestamp,
      toSQL: (val: any) => {
        if (val === null || val === undefined) return 'NULL';
        // Databricks: TIMESTAMP_MILLIS() for timestamp construction
        const ms = typeof val === 'bigint' ? Number(val / 1000n) : val;
        return `TIMESTAMP_MILLIS(${ms})`;
      }
    };

    // Override date32 toSQL for Databricks's DATE(FROM_UNIXTIME())
    this.types.date32 = {
      ...this.types.date32,
      toSQL: (val: any) => {
        if (val === null || val === undefined) return 'NULL';
        // Databricks: DATE(FROM_UNIXTIME())
        if (typeof val === 'number') {
          return `DATE(FROM_UNIXTIME(${val / 1000}))`;
        }
        return `DATE '${val}'`;
      }
    };

    // Databricks-specific aggregations
    this.aggregations.approx_count_distinct = (field) =>
      `APPROX_COUNT_DISTINCT(${field})`;
    // Databricks uses PERCENTILE for median (0.5 = 50th percentile)
    this.aggregations.median = (field) => `PERCENTILE(${field}, 0.5)`;
    // Databricks has native MODE function (available in Runtime 14.1+)
    this.aggregations.mode = (field) => `MODE(${field})`;

    // Databricks uses RLIKE for regex (Spark SQL syntax)
    this.operators.regex = 'RLIKE';

    // Databricks/Spark SQL date/time functions
    // Spark prefers named functions over EXTRACT
    this.functions.year = (field) => `YEAR(${field})`;
    this.functions.quarter = (field) => `QUARTER(${field})`;
    this.functions.month = (field) => `MONTH(${field})`;
    this.functions.week = (field) => `WEEKOFYEAR(${field})`;
    this.functions.hour = (field) => `HOUR(${field})`;
    this.functions.minute = (field) => `MINUTE(${field})`;
    this.functions.second = (field) => `SECOND(${field})`;

    // Databricks/Spark SQL timestamp functions
    this.functions.unix_timestamp = (field) => `UNIX_TIMESTAMP(${field})`;
    this.functions.from_unixtime = (expr) => `FROM_UNIXTIME(${expr})`;
    this.functions.floor = (expr) => `FLOOR(${expr})`;

    // Databricks uses STRING instead of VARCHAR (VARCHAR requires length)
    this.functions.cast_to_string = (expr) => `CAST(${expr} AS STRING)`;
    this.functions.lpad = (expr, len, char) => `LPAD(CAST(${expr} AS STRING), ${len}, '${char}')`;
  }

  get name() {
    return 'databricks';
  }

  /**
   * Override quoteIdentifier to use backticks for Databricks/Spark SQL
   * In Spark SQL, double quotes create STRING LITERALS, not identifiers
   * @param {string} identifier - Column/table name
   * @returns {string} Quoted identifier using backticks
   */
  quoteIdentifier(identifier: string): string {
    const needsQuotes = /[^a-zA-Z0-9_]/.test(identifier) || /^[0-9]/.test(identifier);
    return needsQuotes ? `\`${identifier.replace(/`/g, '``')}\`` : identifier;
  }

  /**
   * Map Databricks/Spark SQL type to Arrow type
   * @param {string} databricksType - Native Databricks type string (e.g., 'BIGINT', 'STRING', 'TIMESTAMP')
   * @returns Arrow type object with icon, isNumeric, toDisplay, toSQL
   */
  mapTypeToArrowType(databricksType: string) {
    const type = databricksType.toUpperCase();

    // Integer types
    if (type.includes('BIGINT') || type === 'LONG') return this.types.int64;
    if (type === 'INT' || type === 'INTEGER') return this.types.int32;
    if (type.includes('SMALLINT')) return this.types.int16;
    if (type.includes('TINYINT')) return this.types.int8;

    // Float types
    if (type.includes('DOUBLE')) return this.types.double;
    if (type.includes('FLOAT')) return this.types.float32;
    if (type.includes('DECIMAL')) return this.types.decimal;

    // String types
    if (type.includes('STRING') || type.includes('VARCHAR') || type.includes('CHAR')) {
      return this.types.string;
    }

    // Temporal types
    if (type === 'TIMESTAMP' || type.includes('TIMESTAMP')) return this.types.timestamp;
    if (type === 'DATE') return this.types.date32;

    // Boolean
    if (type.includes('BOOLEAN') || type.includes('BOOL')) return this.types.bool;

    // Complex types
    if (type.includes('STRUCT')) return this.types.struct;
    if (type.includes('ARRAY')) return this.types.list;
    if (type.includes('MAP')) return this.types.map;

    // Binary
    if (type.includes('BINARY')) return this.types.binary;

    // Default fallback to string
    return this.types.string;
  }

  /**
   * Format date/timestamp columns to strings using DATE_FORMAT
   * @param {string} columnName - Column name (already quoted if needed)
   * @param {string} fieldType - Field type ('date', 'timestamp', etc.)
   * @returns {string} SQL expression
   */
  formatDateColumn(columnName: string, fieldType: string): string {
    const lowerType = fieldType.toLowerCase();
    if (lowerType.includes('date32') || lowerType.includes('date')) {
      return `DATE_FORMAT(${columnName}, 'yyyy-MM-dd')`;
    } else if (lowerType.includes('timestamp')) {
      return `DATE_FORMAT(${columnName}, 'yyyy-MM-dd HH:mm:ss')`;
    }
    return columnName;
  }
}
