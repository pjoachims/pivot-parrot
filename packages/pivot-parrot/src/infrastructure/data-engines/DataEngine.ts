import { Mutex } from 'async-mutex';
import type { SQLDialect } from '../../domain/query/dialects/SQLDialect';
import { profiler } from '../../domain/query/utils/profiler';

export interface DataEngineOptions {
  cacheSize?: number;
  defaultTable?: string;
}

export interface QueryResult {
  data?: any[];
  table?: any; // Apache Arrow Table - present instead of `data` when options.format === 'arrow'
  dtypes: Record<string, any>;
  rowCount: number;
  columnCount: number;
  sql?: string;
  executionTime?: number;
}

/**
 * DataEngine - Abstract base class for data operations
 *
 * Defines the interface that all data engine implementations must follow.
 * Implementations can be local (DuckDB WASM) or remote (Databricks, generic backend).
 */
export class DataEngine {
  protected _currentQuery: string | null;
  protected _queryStartTime: number | null;
  protected _queryType: string | null;
  protected _queryListeners: Set<(queryInfo: any) => void>;
  protected _queryMutex: Mutex;
  protected _cache: Map<string, any>;
  protected _cacheOrder: string[];
  protected _cacheSize: number;
  public defaultTable: string;
  // Hash of the dataset last loaded into THIS engine instance. Lets callers
  // (store.loadData) skip reloads per-engine rather than per-store: a store
  // outlives its engine across remounts/HMR, so a store-scoped guard could
  // skip loading into a fresh, empty engine.
  public loadedDataHash: string | null = null;

  constructor(options: DataEngineOptions = {}) {
    // Query execution tracking
    this._currentQuery = null;
    this._queryStartTime = null;
    this._queryType = null;
    this._queryListeners = new Set();

    // Mutex - only 1 query at a time
    this._queryMutex = new Mutex();

    // Query cache (LRU)
    this._cache = new Map();
    this._cacheOrder = [];
    this._cacheSize = options.cacheSize || 10;

    // Default table name (must match the table name used in store.ts loadData)
    this.defaultTable = options.defaultTable || 'pivot_data';
  }

  /**
   * Get current query execution info
   * @returns {Object|null} { sql, startTime, elapsed, type } or null if no query running
   */
  getCurrentQuery() {
    if (!this._currentQuery) return null;

    return {
      sql: this._currentQuery,
      startTime: this._queryStartTime,
      elapsed: Date.now() - this._queryStartTime,
      type: this._queryType || 'query'
    };
  }

  /**
   * Subscribe to query execution updates
   * @param {Function} listener - Called when query starts/stops
   * @returns {Function} Unsubscribe function
   */
  subscribeToQueries(listener) {
    this._queryListeners.add(listener);
    return () => this._queryListeners.delete(listener);
  }

  /**
   * Notify listeners of query state change
   * @protected
   */
  _notifyListeners() {
    const queryInfo = this.getCurrentQuery();
    this._queryListeners.forEach(listener => listener(queryInfo));
  }

  /**
   * Check if a query is currently running
   */
  isQueryRunning() {
    return this._queryMutex.isLocked();
  }

  /**
   * Check if cancel is supported by this engine
   * Override in subclasses that support cancellation
   * @returns {boolean} True if cancel is supported
   */
  canCancel(): boolean {
    return false;
  }

  /**
   * Cancel the current running query
   * Override in subclasses that support cancellation
   * @returns {boolean} True if a query was cancelled
   */
  cancelCurrentQuery(): boolean {
    return false;
  }

  /**
   * Mark query as started
   * @protected
   * @param {string} sql - SQL query
   * @param {string} type - Query type: 'pivot' | 'drilldown' | 'uniqueValues' | 'query'
   */
  _startQuery(sql, type = 'query') {
    this._currentQuery = sql;
    this._queryStartTime = Date.now();
    this._queryType = type;
    this._notifyListeners();
  }

  /**
   * Mark query as finished
   * @protected
   */
  _endQuery() {
    this._currentQuery = null;
    this._queryStartTime = null;
    this._queryType = null;
    this._notifyListeners();
  }

  /**
   * Get SQL dialect for this engine
   * Subclasses must implement this to return the appropriate dialect instance
   * @returns {SQLDialect} SQL dialect instance
   */
  getDialect(): SQLDialect {
    throw new Error('DataEngine.getDialect() must be implemented by subclass');
  }
  /**
   * Initialize the data engine
   */
  async init() {
    throw new Error('DataEngine.init() must be implemented by subclass');
  }

  /**
   * Execute SQL query with mutex lock, caching, and tracking
   * @param {string} sql - SQL query to execute
   * @param {boolean} useCache - Whether to use query caching
   * @param {string} type - Query type: 'pivot' | 'drilldown' | 'uniqueValues' | 'query'
   * @param {Object} options - Query options (timeout, etc.). options.format = 'arrow'
   *   requests a columnar Arrow Table instead of materialized row objects
   *   (local engine only - remote engines fall back to row-shaped results).
   * @returns {Promise<Object>} Query result with structure:
   *   { data, dtypes, sql, executionTime, rowCount, columnCount } or, when
   *   options.format === 'arrow' and supported: { table, dtypes, sql, executionTime, rowCount, columnCount }
   */
  async executeQuery(sql: string, useCache = true, type = 'query', options: any = {}): Promise<QueryResult> {
    // Use mutex to ensure only 1 query at a time
    return profiler.profileAsync('DataEngine.executeQuery', async () => {
      return this._queryMutex.runExclusive(async () => {
      // Check cache - format is part of the key so an 'arrow' request never
      // returns a cached row-shaped result (or vice versa).
      const cacheKey = this._hashQuery(sql, options.format);
      if (useCache && this._cache.has(cacheKey)) {
        return this._cache.get(cacheKey);
      }

      // Track query execution
      this._startQuery(sql, type);

      // CRITICAL: Yield to event loop to allow React to render the progress overlay
      // Without this, DuckDB WASM blocks the main thread before React can update
      await new Promise(resolve => setTimeout(resolve, 0));

      try {
        // Call subclass implementation and measure time
        const startTime = performance.now();
        const result = await this._executeQueryImpl(sql, options);
        const executionTime = performance.now() - startTime;

        // Ensure result has standard format
        const queryResult = {
          ...result,
          sql,
          executionTime
        };

        // Cache result
        if (useCache) {
          this._addToCache(cacheKey, queryResult);
        }

        return queryResult;
      } finally {
        // Stop tracking
        this._endQuery();
      }
      });
    });
  }

  /**
   * Execute SQL query implementation (to be implemented by subclasses)
   * @protected
   * @param {string} sql - SQL query to execute
   * @param {Object} options - Query options (timeout, etc.)
   * @returns {Promise<Object>} Query result
   */
  protected async _executeQueryImpl(sql: string, _options: any = {}): Promise<QueryResult> {
    throw new Error('DataEngine._executeQueryImpl() must be implemented by subclass');
  }

  /**
   * Get table schema
   * @param {string} tableName - Table name
   * @returns {Promise<Array>} Array of column definitions:
   *   [{name: string, type: string, nullable: boolean}, ...]
   */
  async getSchema(_tableName: string): Promise<any[]> {
    throw new Error('DataEngine.getSchema() must be implemented by subclass');
  }

  /**
   * Load Arrow bytes into database (DuckDB WASM only)
   * @param {Uint8Array|ArrayBuffer} bytes - Arrow IPC bytes
   * @param {string} tableName - Table name to create
   * @returns {Promise<any>} Schema information
   */
  async loadArrowBytes(_bytes: Uint8Array | ArrayBuffer, _tableName: string): Promise<any> {
    throw new Error('DataEngine.loadArrowBytes() is only supported by DuckDBWASMEngine');
  }

  /**
   * Load Arrow table into database (DuckDB WASM only)
   * @param {any} arrowTable - Arrow Table object
   * @param {string} tableName - Table name to create
   * @returns {Promise<any>} Schema information
   */
  async loadArrow(_arrowTable: any, _tableName: string): Promise<any> {
    throw new Error('DataEngine.loadArrow() is only supported by DuckDBWASMEngine');
  }

  /**
   * Load CSV data into database (DuckDB WASM only)
   * @param {string} csvData - CSV string or URL
   * @param {string} tableName - Table name to create
   * @returns {Promise<any>} Schema information
   */
  async loadCSV(_csvData: string, _tableName: string): Promise<any> {
    throw new Error('DataEngine.loadCSV() is only supported by DuckDBWASMEngine');
  }

  /**
   * Get unique values for a field
   * @param {string} fieldName - Field name to get unique values for
   * @param {string} tableName - Table name
   * @param {string} whereClause - Optional WHERE clause for filtering
   * @param {number} limit - Maximum number of values to return
   * @param {number} timeout - Optional query timeout in milliseconds
   * @param {string} expression - Optional SQL expression (for custom groupings)
   * @param {string} dtype - Optional data type for display conversion
   * @returns {Promise<{values: Array, truncated: boolean}>} The first `limit`
   *   unique values, and whether the field has more
   */
  async getUniqueValues(fieldName, tableName = this.defaultTable, whereClause = '', limit = 1000, timeout = null, expression = null, dtype = null): Promise<{ values: any[]; truncated: boolean }> {
    const dialect = this.getDialect();

    // Use expression if provided (for custom groupings), otherwise quote the field name
    const selectExpr = expression || dialect.quoteIdentifier(fieldName);
    const nullCheckExpr = expression || dialect.quoteIdentifier(fieldName);

    // Build WHERE clause: combine provided whereClause with NOT NULL check
    let whereSQL = '';
    if (whereClause) {
      whereSQL = `WHERE ${whereClause} AND ${nullCheckExpr} IS NOT NULL`;
    } else {
      whereSQL = `WHERE ${nullCheckExpr} IS NOT NULL`;
    }

    const sql = `
      SELECT DISTINCT ${selectExpr} as _value
      FROM ${tableName}
      ${whereSQL}
      ORDER BY _value
      LIMIT ${limit + 1}
    `.trim().replace(/\s+/g, ' ');

    const result = await this.executeQuery(sql, false, 'uniqueValues', { timeout });

    // Get dtype from query result - works for both regular fields and custom groupings
    const valueDtype = result.dtypes?.['_value'] || dtype;

    // Since we alias to _value, always extract from that column
    // Use dialect.toDisplay to convert values (handles BigInt, dates, etc.)
    const values = result.data.slice(0, limit).map(row => {
      const val = row['_value'] !== undefined
        ? row['_value']
        : (Object.values(row)[0] ?? null);
      return valueDtype ? dialect.toDisplay(val, valueDtype) : val;
    });
    return { values, truncated: result.data.length > limit };
  }

  /**
   * Detect dtype for an expression by running a LIMIT 0 query
   * @param {string} expression - SQL expression to check
   * @param {string} tableName - Table name
   * @returns {Promise<string|null>} Detected dtype or null
   */
  async detectExpressionDtype(expression, tableName = this.defaultTable) {
    const sql = `SELECT ${expression} as _value FROM ${tableName} LIMIT 0`;
    const result = await this.executeQuery(sql, false, 'query', {});
    return result.dtypes?.['_value'] || null;
  }

  /**
   * Execute drilldown query
   * @param {Object} filters - Filter object with field/value pairs
   * @param {string} tableName - Table name
   * @param {number} limit - Row limit
   * @param {Object} detectedTypes - Field type mapping
   * @param {number} timeout - Query timeout in milliseconds
   * @param {Array} availableFields - Available fields (for custom expression resolution)
   * @param {Array} customGroupings - Custom groupings (for custom expression resolution)
   * @param {Array} customFilters - Custom filters (for custom expression resolution)
   * @param {string} format - 'rows' (default) or 'arrow'. 'arrow' keeps the result as a
   *   columnar Arrow Table where the engine supports it; unsupported engines (e.g. remote)
   *   silently fall back to row-shaped data - callers should adapt via columnarResult.ts
   * @returns {Promise<Object>} Drilldown result
   */
  async executeDrilldown(filters, tableName = this.defaultTable, limit = 10000, _detectedTypes = {}, timeout = null, availableFields = [], customGroupings = [], customFilters = [], format: 'rows' | 'arrow' = 'rows') {
    const dialect = this.getDialect();

    // Resolve custom grouping/filter expressions in drilldown filters
    // When user drills down on a custom grouping like "Is High Value",
    // we need to replace the field name with its resolved expression
    const { buildReferenceLookup, resolveDerivedFieldsInExpressionV2 } = await import('../../domain/field/derived-field-resolver-v2');

    const referenceLookup = buildReferenceLookup({
      availableFields,
      customGroupings,
      customFilters,
      customMetrics: [],
      includeMetrics: false  // Drilldown is for dimensions only
    });

    const resolvedFilters = filters.map(filter => {
      // Check if this filter field is a custom grouping or filter
      const customField = [...customGroupings, ...customFilters].find(
        f => f.id === filter.field || f.name === filter.field
      );

      if (customField && customField.expr) {
        // Resolve {{}} references in the expression
        const resolvedExpr = resolveDerivedFieldsInExpressionV2(customField.expr, referenceLookup);
        // Return filter with sqlExpr instead of field name
        return {
          ...filter,
          sqlExpr: resolvedExpr
        };
      }

      // Regular field - keep as-is
      return filter;
    });

    const whereClause = dialect.buildWhereClause(resolvedFilters);
    const whereSQL = whereClause ? `WHERE ${whereClause}` : '';

    const sql = `SELECT * FROM ${tableName} ${whereSQL} LIMIT ${limit}`.trim().replace(/\s+/g, ' ');

    const result = await this.executeQuery(sql, false, 'drilldown', { timeout, format });

    return {
      data: result.data,
      table: result.table,
      sql,
      executionTime: result.executionTime,
      filters,
      rowCount: result.rowCount,
      columnCount: result.columnCount,
      dtypes: result.dtypes,
      limitReached: result.rowCount >= limit
    };
  }

  /**
   * Detect pivot-friendly field types from schema
   * Converts engine-specific types to standard pivot types
   * @param {Array} schema - Schema from getSchema()
   * @returns {Object} Field type mapping {fieldName: 'integer'|'numeric'|'date'|'timestamp'|'string'|...}
   */
  detectFieldTypes(_schema): Record<string, string> {
    throw new Error('DataEngine.detectFieldTypes() must be implemented by subclass');
  }

  /**
   * Close connection and cleanup resources
   */
  async close() {
    throw new Error('DataEngine.close() must be implemented by subclass');
  }

  /**
   * Clear query cache
   */
  clearCache() {
    this._cache.clear();
    this._cacheOrder = [];
  }

  /**
   * Hash query for cache key
   * The cache is just an in-memory Map, so the SQL string itself is a fine
   * (collision-free) key - no need to actually hash it. The result format
   * (row-shaped vs Arrow) is folded in so the two shapes never collide.
   * @protected
   */
  _hashQuery(sql, format?: string) {
    return format ? `${format}:${sql}` : sql;
  }

  /**
   * Add query result to cache (LRU)
   * @protected
   */
  _addToCache(key, result) {
    // Remove oldest if at capacity
    if (this._cache.size >= this._cacheSize) {
      const oldest = this._cacheOrder.shift();
      this._cache.delete(oldest);
    }

    // Add to cache
    this._cache.set(key, result);
    this._cacheOrder.push(key);
  }

  /**
   * Get available fields (optional, implemented by RemoteDataEngine)
   * @returns Available fields or null
   */
  getAvailableFields?() {
    return null;
  }

  /**
   * Get detected types (optional, implemented by RemoteDataEngine)
   * @returns Detected types or null
   */
  getDetectedTypes?() {
    return null;
  }
}
