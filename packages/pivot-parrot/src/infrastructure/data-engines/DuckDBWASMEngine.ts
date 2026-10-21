import type { DuckDBBundles } from '@duckdb/duckdb-wasm';
import { DataEngine, type DataEngineOptions } from './DataEngine';
import { DuckDBDialect } from '../../domain/query/dialects/index';
import { fromSchema } from '../../domain/field/FieldItem';

/**
 * DuckDBWASMEngine - DuckDB WASM implementation of DataEngine
 *
 * Features:
 * - Load/export: CSV, Parquet, Arrow, JSON
 * - Schema introspection
 * - Query execution with caching
 * - Full in-browser OLAP operations
 */

export interface DuckDBWASMEngineOptions extends DataEngineOptions {
  /** Where to load the DuckDB wasm and worker files from; jsDelivr when absent. */
  bundles?: DuckDBBundles;
}

export class DuckDBWASMEngine extends DataEngine {
  public duckdb: any;
  protected _bundles: DuckDBBundles | undefined;
  public db: any;
  public conn: any;
  protected _loadingLock: Map<string, Promise<void>>;
  protected _dialect: DuckDBDialect;

  constructor(duckdb: any, { bundles, ...options }: DuckDBWASMEngineOptions = {}) {
    super(options); // Initialize base class with cache, tracking, etc.
    this.duckdb = duckdb;
    this._bundles = bundles;
    this.db = null;
    this.conn = null;

    // Loading lock to prevent concurrent loads
    this._loadingLock = new Map();

    // SQL dialect
    this._dialect = new DuckDBDialect();
  }

  /**
   * Get SQL dialect for DuckDB
   * @returns {DuckDBDialect}
   */
  getDialect() {
    return this._dialect;
  }

  /**
   * Initialize DuckDB connection
   */
  async init() {
    if (this.db && this.conn) return; // Already initialized

    const bundle = await this.duckdb.selectBundle(this._bundles ?? this.duckdb.getJsDelivrBundles());
    // The worker runs from a blob: URL, so a root-relative bundle path would not resolve inside it.
    const absolute = (url: string | null) => url && new URL(url, document.baseURI).href;

    // Use Blob URL to avoid CORS issues with CDN workers
    const workerUrl = URL.createObjectURL(
      new Blob([`importScripts("${absolute(bundle.mainWorker)}");`], { type: "text/javascript" })
    );
    const worker = new Worker(workerUrl);
    const logger = new this.duckdb.VoidLogger();

    this.db = new this.duckdb.AsyncDuckDB(logger, worker);
    await this.db.instantiate(absolute(bundle.mainModule), absolute(bundle.pthreadWorker));

    this.conn = await this.db.connect();
  }

  // ==================== LOAD METHODS ====================

  /**
   * Load CSV data
   * @param {string|ArrayBuffer} data - CSV string or ArrayBuffer
   * @param {string} tableName - Table name in DuckDB
   * @param {Object} options - Loading options
   * @param {string} options.decimalSeparator - Decimal separator: '.' (default) or ','
   */
  async loadCSV(data, tableName = this.defaultTable, options: { decimalSeparator?: string } = {}) {
    await this.init();

    const { decimalSeparator = '.' } = options;

    // Register file in DuckDB virtual filesystem
    const fileName = `${tableName}.csv`;

    if (typeof data === 'string') {
      await this.db.registerFileText(fileName, data);
    } else {
      await this.db.registerFileBuffer(fileName, new Uint8Array(data));
    }

    // Table-mutating: run exclusively so it can't interleave with a
    // concurrent read query on the same connection.
    await this._queryMutex.runExclusive(async () => {
      // Create table from CSV with specified decimal separator
      if (decimalSeparator === ',') {
        await this.conn.query(`
          CREATE OR REPLACE TABLE ${tableName} AS
          SELECT * FROM read_csv('${fileName}', auto_detect=true, decimal_separator=',')
        `);
      } else {
        await this.conn.query(`
          CREATE OR REPLACE TABLE ${tableName} AS
          SELECT * FROM read_csv_auto('${fileName}')
        `);
      }
    });

    this.clearCache();
  }

  /**
   * Load Parquet data
   * @param {ArrayBuffer} data - Parquet binary data
   * @param {string} tableName - Table name in DuckDB
   */
  async loadParquet(data, tableName = this.defaultTable) {
    await this.init();

    const fileName = `${tableName}.parquet`;
    await this.db.registerFileBuffer(fileName, new Uint8Array(data));

    // Table-mutating: run exclusively so it can't interleave with a
    // concurrent read query on the same connection.
    await this._queryMutex.runExclusive(async () => {
      await this.conn.query(`
        CREATE OR REPLACE TABLE ${tableName} AS
        SELECT * FROM read_parquet('${fileName}')
      `);
    });

    this.clearCache();
  }

  /**
   * Load Arrow IPC bytes directly into DuckDB
   * @param {Uint8Array} arrowBytes - Raw Arrow IPC bytes
   * @param {string} tableName - Table name in DuckDB
   */
  async loadArrowBytes(arrowBytes, tableName = this.defaultTable) {
    await this.init();

    // Check if already loading this table
    if (this._loadingLock.has(tableName)) {
      return this._loadingLock.get(tableName);
    }

    // Create promise for this load operation
    const loadPromise = this._performLoad(arrowBytes, tableName);
    this._loadingLock.set(tableName, loadPromise);

    try {
      await loadPromise;
    } finally {
      // Clear lock when done
      this._loadingLock.delete(tableName);
    }
  }

  async _performLoad(arrowBytes, tableName) {
    try {
      // Table-mutating: run exclusively so the drop+insert can't interleave
      // with a concurrent read query on the same connection. The drop is
      // awaited directly - DuckDB WASM's query() promise only resolves once
      // the worker confirms completion, so no extra timing delay is needed.
      await this._queryMutex.runExclusive(async () => {
        await this.conn.query(`DROP TABLE IF EXISTS ${tableName}`);
        await this.conn.insertArrowFromIPCStream(arrowBytes, {
          name: tableName
        });
      });

    } catch (error) {
      console.error(`Error loading Arrow bytes into DuckDB:`, error);
      throw new Error(`Failed to load Arrow bytes into DuckDB: ${error.message}`);
    }

    this.clearCache();
  }

  /**
   * Load Arrow table object
   * @param {Object} table - Apache Arrow table
   * @param {string} tableName - Table name in DuckDB
   */
  async loadArrow(table, tableName = this.defaultTable) {
    await this.init();

    // Table-mutating: run exclusively so it can't interleave with a
    // concurrent read query on the same connection.
    await this._queryMutex.runExclusive(async () => {
      await this.conn.query(`DROP TABLE IF EXISTS ${tableName}`);
      await this.conn.insertArrowTable(table, { name: tableName });
    });

    this.clearCache();
  }

  /**
   * Load JSON data
   * @param {string|Object|Array} data - JSON string, object, or array
   * @param {string} tableName - Table name in DuckDB
   */
  async loadJSON(data, tableName = this.defaultTable) {
    await this.init();

    const jsonString = typeof data === 'string' ? data : JSON.stringify(data);
    const fileName = `${tableName}.json`;

    await this.db.registerFileText(fileName, jsonString);

    // Table-mutating: run exclusively so it can't interleave with a
    // concurrent read query on the same connection.
    await this._queryMutex.runExclusive(async () => {
      await this.conn.query(`
        CREATE OR REPLACE TABLE ${tableName} AS
        SELECT * FROM read_json_auto('${fileName}')
      `);
    });

    this.clearCache();
  }

  // ==================== EXPORT METHODS ====================

  /**
   * Export to CSV
   * @param {string} query - Optional SQL query (defaults to entire table)
   * @returns {string} CSV string
   */
  async toCSV(query = null) {
    await this.init();

    const sql = query || `SELECT * FROM ${this.defaultTable}`;
    const result = await this.conn.query(sql);

    // Convert Arrow result to CSV
    const arrow = result;
    const rows = [];

    // Header
    const headers = arrow.schema.fields.map(f => f.name);
    rows.push(headers.join(','));

    // Data rows - use toArray() to preserve BigInt
    for (const rowObj of arrow.toArray()) {
      const row = [];
      for (const fieldName of headers) {
        const val = rowObj[fieldName];
        // Basic CSV escaping - String() handles BigInt
        const strVal = val === null ? '' : String(val);
        row.push(strVal.includes(',') ? `"${strVal}"` : strVal);
      }
      rows.push(row.join(','));
    }

    return rows.join('\n');
  }

  /**
   * Export to Parquet
   * @param {string} query - Optional SQL query
   * @returns {ArrayBuffer} Parquet binary data
   */
  async toParquet(query = null) {
    await this.init();

    const sql = query || `SELECT * FROM ${this.defaultTable}`;
    const result = await this.conn.query(sql);

    // DuckDB returns Arrow table, serialize as Parquet
    // Note: This is a simplified approach - production would use proper Parquet writer
    const arrow = result;
    return arrow.serialize();
  }

  /**
   * Export to Arrow
   * @param {string} query - Optional SQL query
   * @returns {Object} Apache Arrow table
   */
  async toArrow(query = null) {
    await this.init();

    const sql = query || `SELECT * FROM ${this.defaultTable}`;
    const result = await this.conn.query(sql);

    return result;
  }

  /**
   * Export to JSON
   * @param {string} query - Optional SQL query
   * @returns {Array} Array of objects
   */
  async toJSON(query = null) {
    await this.init();

    const sql = query || `SELECT * FROM ${this.defaultTable}`;
    const result = await this.conn.query(sql);

    // Convert Arrow to array using toArray() - preserves BigInt
    const arrow = result;
    const rows = arrow.toArray();

    return rows;
  }

  // ==================== SCHEMA ====================

  /**
   * Get table schema
   * @param {string} tableName - Table name
   * @returns {Array} Array of {name, type, nullable}
   */
  async getSchema(tableName = this.defaultTable) {
    await this.init();

    const result = await this.conn.query(`DESCRIBE ${tableName}`);
    const schema = [];

    for (let i = 0; i < result.numRows; i++) {
      schema.push({
        name: result.getChildAt(0).get(i),      // column_name
        type: result.getChildAt(1).get(i),      // column_type
        nullable: result.getChildAt(2).get(i) === 'YES'  // null
      });
    }

    return schema;
  }

  // ==================== QUERY ====================

  /**
   * Execute SQL query implementation (called by base class with mutex)
   * @protected
   * @param {string} sql - SQL query
   * @param {Object} options - Query options. options.format === 'arrow' returns the
   *   Arrow Table as-is (no row materialization) instead of an array of row objects.
   * @returns {Object} Query result: { data, dtypes, rowCount, columnCount } or,
   *   when options.format === 'arrow': { table, dtypes, rowCount, columnCount }
   */
  async _executeQueryImpl(sql, options: any = {}) {
    await this.init();

    // Execute query - DuckDB WASM natively returns an Arrow Table
    const result = await this.conn.query(sql);

    // Extract dtypes from Arrow schema
    const dtypes = {};
    const dialect = this.getDialect();
    for (const field of result.schema.fields) {
      // Check for Decimal type with precision/scale properties (Arrow JS)
      // field.type.toString() returns just "Decimal128" without params,
      // but precision/scale are available as properties
      const fieldType = field.type;
      if (fieldType && typeof fieldType.precision === 'number' && typeof fieldType.scale === 'number') {
        dtypes[field.name] = `decimal<${fieldType.precision},${fieldType.scale}>`;
      } else {
        const arrowTypeStr = fieldType?.toString?.() || 'string';
        dtypes[field.name] = dialect.detectArrowType(arrowTypeStr);
      }
    }

    // Arrow path: stay columnar, skip materializing row objects entirely
    if (options.format === 'arrow') {
      return {
        table: result,
        dtypes,      // Column name → DTYPE enum
        rowCount: result.numRows,
        columnCount: result.numCols
      };
    }

    // Convert using Arrow's toArray() - returns row proxies that preserve BigInt
    const rows = result.toArray();

    return {
      data: rows,  // Keep raw values (BigInt, etc.)
      dtypes,      // Column name → DTYPE enum
      rowCount: result.numRows,
      columnCount: result.numCols
    };
  }

  // Cache methods inherited from base class

  // ==================== CLEANUP ====================

  /**
   * Close DuckDB connection
   */
  async close() {
    if (this.conn) {
      await this.conn.close();
      this.conn = null;
    }
    if (this.db) {
      await this.db.terminate();
      this.db = null;
    }
    // A later init() starts from an empty database - any previously loaded
    // dataset is gone, so the reload guard must not skip the next load.
    this.loadedDataHash = null;
    this.clearCache();
  }

  // ==================== PIVOT OPERATIONS ====================

  // getUniqueValues() and executeDrilldown() inherited from base class

  /**
   * Detect pivot-friendly field types from DuckDB schema
   * Delegates to DuckDBDialect for consistent type mapping
   * @param {Array} schema - Schema from getSchema()
   * @returns {Object} Field type mapping {columnName: Arrow type name string}
   */
  detectFieldTypes(schema) {
    return this._dialect.detectFieldTypes(schema);
  }

  /**
   * Get available fields from schema
   * Creates FieldItems with proper Arrow type mapping
   * @returns {FieldItem[]} Array of FieldItems
   */
  async getAvailableFields() {
    const schema = await this.getSchema();
    const types = this.detectFieldTypes(schema);

    return schema.map((col) => fromSchema({
      name: col.name,
      type: types[col.name],  // Arrow type name (e.g., 'date32', 'int64')
      originalType: col.type  // Native DB type (e.g., 'DATE', 'BIGINT')
    }));
  }

}
